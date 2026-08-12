import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Timer, ClipboardCheck, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabase";
import { buildWeightedDeck, availableFacets, withDisplayNames } from "../lib/questionEngine";

const db = supabase.schema("menu_app");

// Where a new waiter actually starts. Two parts, in this order on purpose: they rate
// themselves in writing FIRST, then sit a real exam — so the owner can see the gap
// between "I know the menu well" and 41%, which is more useful than either number alone.
//
// The exam draws from the whole menu (that is the point — locating them), weighted by the
// facets the owner ranked, and every question goes through the same quality gates as the
// games, so the score means something. It writes menu_progress too: someone who genuinely
// knows the starters should not have to grind flashcards to prove it.

const SELF_RATING_QUESTIONS = [
  {
    id: "experience",
    q: "כמה זמן את/ה עובד/ת במסעדנות?",
    options: ["זו ההתחלה שלי", "פחות משנה", "1–3 שנים", "יותר מ-3 שנים"],
  },
  {
    id: "menu_familiarity",
    q: "עד כמה את/ה מכיר/ה את התפריט כאן?",
    options: ["בכלל לא", "ראיתי אותו", "מכיר/ה חלק", "מכיר/ה טוב"],
  },
  {
    id: "allergen_confidence",
    q: "אורח שואל על אלרגיה — עד כמה את/ה בטוח/ה בתשובה?",
    options: ["אשאל את המטבח", "בערך", "די בטוח/ה", "בטוח/ה לגמרי"],
  },
];

// displayName is added by withDisplayNames after the whole menu loads: only names that
// are ambiguous across categories get their serving style prefixed.
function pubToCard(p) {
  return {
    id: p.source_item_id, name: p.name || "", category: p.category,
    price: Number(p.price), desc: p.description || "",
    ingredients: (p.ingredients || []).filter(Boolean),
    allergens: (p.allergens || []).filter(Boolean),
  };
}

export default function BaselineIntake({ session, onDone }) {
  const [phase, setPhase] = useState("loading"); // loading | intro | self | exam | saving | done
  const [pool, setPool] = useState([]);
  const [config, setConfig] = useState(null);
  const [ratings, setRatings] = useState({});
  const [deck, setDeck] = useState([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [answers, setAnswers] = useState([]); // { itemId, correct }
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState(null);
  const startedRef = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: menu }, { data: cfg }] = await Promise.all([
        db.from("published_menu").select("*").eq("restaurant_id", session.restaurantId)
          .order("created_at", { ascending: true }).order("source_item_id", { ascending: true }),
        db.from("exam_config").select("*").eq("restaurant_id", session.restaurantId).maybeSingle(),
      ]);
      if (!alive) return;
      setPool(withDisplayNames((menu || []).map(pubToCard)));
      setConfig(cfg || {});
      setPhase("intro");
    })();
    return () => { alive = false; };
  }, [session.restaurantId]);

  const minutes = config?.baseline_minutes ?? 7;
  // ~3 questions a minute: enough to read the options without rushing.
  const targetCount = Math.max(10, Math.min(30, Math.round(minutes * 3)));

  const startExam = () => {
    const facets = config?.facets?.length ? config.facets : availableFacets(pool);
    const built = buildWeightedDeck(pool, targetCount, facets);
    setDeck(built);
    setSecondsLeft(minutes * 60);
    startedRef.current = Date.now();
    setPhase("exam");
  };

  // One clock for the whole exam rather than per question — running out is a legitimate
  // way to finish, and it keeps a slow reader from being cut off mid-question.
  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // The exam ends when the clock runs out or the deck is exhausted. finish() is async and
  // runs after render, so the ref keeps StrictMode's double-invoke from scoring twice, and
  // the render path below waits for `result` instead of assuming it is already there.
  const finished = phase === "exam" && (secondsLeft <= 0 || i >= deck.length);
  const finishingRef = useRef(false);
  useEffect(() => {
    if (finished && !finishingRef.current) { finishingRef.current = true; void finish(); }
  }, [finished]);

  async function finish() {
    setPhase("saving");
    const asked = answers.length;
    const correct = answers.filter((a) => a.correct).length;
    const pct = asked ? Math.round((correct / asked) * 100) : 0;
    const seconds = Math.round((Date.now() - startedRef.current) / 1000);
    setResult({ pct, asked, correct });

    if (session.offline) { setPhase("done"); return; }
    try {
      // anon only holds a column-level UPDATE grant on exactly these four columns.
      const { error: memberErr } = await db.from("team_members").update({
        baseline_pct: pct,
        baseline_taken_at: new Date().toISOString(),
        self_rating: ratings,
        total_seconds: seconds,
      }).eq("id", session.teamMemberId);
      if (memberErr) throw memberErr;

      // A correct multiple-choice answer is real but partial evidence (there is a guess
      // component), so it lands at 3 of 5 — above nothing, below the 4 that counts as
      // mastered. Enough that a waiter who truly knows a category can open its exam
      // straight away instead of grinding flashcards they don't need.
      //
      // Deduped by dish: a deck can legitimately ask about the same dish twice (once on
      // ingredients, once on allergens), and Postgres rejects an upsert whose payload hits
      // the same conflict target twice — "cannot affect row a second time". Two answers on
      // one dish collapse to the better of them.
      const best = new Map();
      for (const a of answers) {
        const score = a.correct ? 3 : 1;
        if (!best.has(a.itemId) || best.get(a.itemId) < score) best.set(a.itemId, score);
      }
      const rows = [...best].map(([source_item_id, mastery]) => ({
        team_member_id: session.teamMemberId,
        source_item_id, mastery,
        last_reviewed: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error: progErr } = await db.from("menu_progress")
          .upsert(rows, { onConflict: "team_member_id,source_item_id" });
        if (progErr) throw progErr;
      }

      await db.from("exam_results").insert({
        restaurant_id: session.restaurantId,
        team_member_id: session.teamMemberId,
        category: "baseline",
        score: pct,
        passed: true,
        dish_count: asked,
      });
      await db.from("progress_snapshots").insert({
        restaurant_id: session.restaurantId,
        team_member_id: session.teamMemberId,
        pct,
        seconds_delta: seconds,
      });
    } catch (e) {
      // Loud on purpose: a silently half-saved baseline (the score written but the
      // member row untouched) is how a missing anon grant hid here the first time.
      console.error("baseline save failed", e);
      setResult((r) => ({ ...r, saveFailed: true }));
    }
    setPhase("done");
  }

  if (phase === "loading") return <Center><Loader2 size={22} className="animate-spin text-[#8a8aa0]" /></Center>;

  if (phase === "intro") {
    const enough = pool.length >= 4;
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-2">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
            <ClipboardCheck size={30} />
          </div>
          <h1 className="text-xl font-black text-[#eef0f6]">בוא/י נראה איפה את/ה עומד/ת</h1>
          <p className="text-sm text-[#b4b4c4] leading-relaxed">
            {enough
              ? <>כמה שאלות קצרות עלייך, ואז מבחן היכרות של כ-{minutes} דקות על התפריט.
                  אין פה ציון עובר — זו נקודת ההתחלה שממנה נמדוד את ההתקדמות שלך.</>
              : <>התפריט של המסעדה עדיין לא מוכן לבוחן. אפשר להתחיל ללמוד ולחזור לזה אחר כך.</>}
          </p>
          <button
            onClick={() => (enough ? setPhase("self") : onDone(null))}
            className="w-full py-3 rounded-xl font-bold text-sm text-white"
            style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
            {enough ? "מתחילים" : "לאפליקציה"}
          </button>
          {enough && (
            <button onClick={() => onDone(null)} className="text-xs text-[#8a8aa0]">אעשה את זה אחר כך</button>
          )}
        </div>
      </Shell>
    );
  }

  if (phase === "self") {
    const allAnswered = SELF_RATING_QUESTIONS.every((q) => ratings[q.id]);
    return (
      <Shell>
        <p className="text-[11px] font-bold text-[#8a8aa0] mb-3">קודם כמה שאלות עלייך</p>
        <div className="flex-1 overflow-y-auto space-y-5">
          {SELF_RATING_QUESTIONS.map((q) => (
            <div key={q.id}>
              <p className="text-sm font-bold text-[#eef0f6] mb-2">{q.q}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const on = ratings[q.id] === opt;
                  return (
                    <button key={opt} onClick={() => setRatings((r) => ({ ...r, [q.id]: opt }))}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                        on ? "bg-[#6d5efc] text-white" : "bg-[#16181c] text-[#c4c4d4] border border-[#22252b]"}`}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button disabled={!allAnswered} onClick={startExam}
          className={`w-full py-3 rounded-xl font-bold text-sm mt-4 ${
            allAnswered ? "text-white" : "bg-[#16181c] text-[#5a5a6e]"}`}
          style={allAnswered ? { background: "linear-gradient(135deg,#6d5efc,#9b7bff)" } : undefined}>
          למבחן ההיכרות
        </button>
      </Shell>
    );
  }

  if (phase === "exam" && !finished) {
    const q = deck[i];
    if (!q) return <Center><Loader2 size={22} className="animate-spin text-[#8a8aa0]" /></Center>;
    const answer = (opt) => {
      if (picked) return;
      setPicked(opt);
      setAnswers((a) => [...a, { itemId: q.itemId, correct: opt === q.correct }]);
      setTimeout(() => { setPicked(null); setI((x) => x + 1); }, 450);
    };
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const ss = String(secondsLeft % 60).padStart(2, "0");
    return (
      <Shell>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-[#eef0f6]">{i + 1}/{deck.length}</p>
          <p className="text-xs font-black text-[#f3c14b] flex items-center gap-1"><Timer size={13} />{mm}:{ss}</p>
        </div>
        <div className="h-1 rounded-full bg-[#16181c] mb-4 overflow-hidden">
          <div className="h-full bg-[#6d5efc] transition-all" style={{ width: `${(i / deck.length) * 100}%` }} />
        </div>
        <div className="bg-[#16181c] rounded-lg p-3 mb-3">
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">{q.prompt}</p>
          <p className={`font-black text-[#eef0f6] ${q.subjectKind === "desc" ? "text-sm leading-snug" : "text-lg"}`}>{q.subject}</p>
        </div>
        <div className="space-y-2">
          {q.options.map((opt, j) => (
            <button key={j} disabled={!!picked} onClick={() => answer(opt)}
              className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right leading-snug transition-colors ${
                picked === opt ? "bg-[#6d5efc] text-white" : "bg-[#16181c] text-[#c4c4d4] border border-[#22252b]"}`}>
              {opt}
            </button>
          ))}
        </div>
        {/* No green/red here on purpose: this is a measurement, and showing the answer
            would teach mid-measurement and skew the rest of the exam. */}
      </Shell>
    );
  }

  // Covers "saving", and the frame between the last answer and finish() producing a score.
  if (phase === "saving" || !result) return <Center><Loader2 size={22} className="animate-spin text-[#8a8aa0]" /></Center>;

  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <p className="text-xs font-bold text-[#8a8aa0]">הידע ההתחלתי שלך</p>
        <p className="text-6xl font-black" style={{ color: result.pct >= 70 ? "#22c08c" : result.pct >= 40 ? "#f3a712" : "#e0315a" }}>
          {result.pct}%
        </p>
        <p className="text-sm text-[#b4b4c4]">{result.correct} מתוך {result.asked} שאלות</p>
        <p className="text-xs text-[#8a8aa0] leading-relaxed px-2 mt-1">
          זו נקודת ההתחלה. מכאן נלמד קטגוריה אחרי קטגוריה, וכל שיפור יימדד מול המספר הזה.
        </p>
        {result.saveFailed && (
          <p className="text-[11px] text-[#f3a712] px-2">התוצאה לא נשמרה לשרת — אפשר לעשות את הבוחן שוב מאוחר יותר.</p>
        )}
        <button onClick={() => onDone(result.pct)}
          className="w-full py-3 rounded-xl font-bold text-sm text-white mt-3 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          למסלול הלמידה <ArrowLeft size={16} />
        </button>
      </div>
    </Shell>
  );
}

const Shell = ({ children }) => (
  <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] px-4 py-5" dir="rtl">{children}</div>
);
const Center = ({ children }) => (
  <div className="h-full flex items-center justify-center bg-[#0c0d10]" dir="rtl">{children}</div>
);
