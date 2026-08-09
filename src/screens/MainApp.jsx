import { useEffect, useState, useMemo } from "react";
import { GraduationCap, Trophy, LogOut, Check, HelpCircle, Loader2 } from "lucide-react";
import { supabase } from "../lib/shiftcrew";

const db = supabase.schema("menu_app");
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];

function pubToCard(p) {
  const ingredients = (p.ingredients || []).filter(Boolean);
  const groups = ingredients.length ? [{ label: "מרכיבים", items: ingredients }] : [];
  return {
    id: p.source_item_id,
    name: p.name,
    price: Number(p.price) || 0,
    description: p.description || "",
    groups,
    allergens: (p.allergens || []).filter(Boolean),
    isSpecial: !!p.is_special,
    tags: p.is_special ? ["מנת היום"] : [],
  };
}

const AVATAR_COLORS = ["#22c08c", "#ff7a59", "#e0315a", "#f3a712", "#3a86ff", "#6d5efc", "#9b7bff", "#1aa376"];
function colorForName(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function MainApp({ session, onSignOut }) {
  const [cards, setCards] = useState(null);
  const [mastered, setMastered] = useState(new Set());
  const [leaderboard, setLeaderboard] = useState([]);
  const [mode, setMode] = useState("home"); // home | flash | quiz | settings

  // Load menu
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await db.from("published_menu")
        .select("*").order("synced_at", { ascending: true });
      if (!alive) return;
      if (error) { console.error(error); setCards([]); return; }
      setCards((data || []).map(pubToCard));
    })();
    return () => { alive = false; };
  }, []);

  // Load mastery
  useEffect(() => {
    if (!session?.teamMemberId) return;
    let alive = true;
    (async () => {
      const { data } = await db.from("menu_progress")
        .select("source_item_id, mastery").eq("team_member_id", session.teamMemberId);
      if (!alive) return;
      setMastered(new Set((data || []).filter((r) => (r.mastery ?? 0) >= 4).map((r) => r.source_item_id)));
    })();
    return () => { alive = false; };
  }, [session?.teamMemberId]);

  // Load leaderboard
  useEffect(() => {
    if (!session?.restaurantId) return;
    let alive = true;
    (async () => {
      const { data } = await db.from("leaderboard")
        .select("*").eq("restaurant_id", session.restaurantId)
        .order("points", { ascending: false });
      if (!alive) return;
      setLeaderboard(data || []);
    })();
    return () => { alive = false; };
  }, [session?.restaurantId]);

  const daily = useMemo(() => {
    if (!Array.isArray(cards)) return [];
    const specials = cards.filter((c) => c.isSpecial);
    return [...specials, ...cards].filter(Boolean).slice(0, 6);
  }, [cards]);

  const learnItem = (id) => {
    setMastered((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      db.from("menu_progress").upsert({
        team_member_id: session.teamMemberId,
        source_item_id: id,
        mastery: 5,
        last_reviewed: new Date().toISOString(),
      }, { onConflict: "team_member_id,source_item_id" });
      // Update leaderboard
      db.from("leaderboard").upsert({
        restaurant_id: session.restaurantId,
        team_member_id: session.teamMemberId,
        name: session.name,
        points: next.size * 100,
        mastered_count: next.size,
        updated_at: new Date().toISOString(),
      }, { onConflict: "restaurant_id,team_member_id" });
      return next;
    });
  };

  if (mode === "flash") return <Flashcards items={daily} onKnown={learnItem} onDone={() => setMode("home")} />;
  if (mode === "quiz") return <Quiz items={daily} onCorrect={learnItem} onDone={() => setMode("home")} />;
  if (mode === "settings") return <SettingsScreen onBack={() => setMode("home")} session={session} onSignOut={onSignOut} leaderboard={leaderboard} />;

  const pct = cards && cards.length ? Math.round((mastered.size / cards.length) * 100) : 0;

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-5 py-4 flex items-center justify-between">
        <button onClick={() => setMode("settings")} className="text-[#8a8aa0] active:text-[#eef0f6]">
          <HelpCircle size={20} />
        </button>
        <p className="font-black text-base">Menu Trainer</p>
        <div className="w-6" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="rounded-3xl p-5 text-white shadow-[0_10px_30px_rgba(109,94,252,0.35)]" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          <div className="flex items-center gap-1.5 text-xs font-bold mb-2">
            <GraduationCap size={14} /> תרגול יומי
          </div>
          <p className="text-lg font-black leading-snug">תרגול קצר על התפריט</p>
          <p className="text-sm text-white/85 font-semibold mt-1">{daily.length} פריטים</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => setMode("flash")} className="bg-[#16181c] text-[#6d5efc] font-bold text-sm py-3 rounded-2xl active:bg-white/10">
              כרטיסיות
            </button>
            <button onClick={() => setMode("quiz")} className="bg-white/20 text-white font-bold text-sm py-3 rounded-2xl active:bg-white/30">
              חידון
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2">התקדמות</p>
          <div className="bg-[#16181c] rounded-2xl p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="h-2 bg-[#22252b] rounded-full overflow-hidden">
                <div className="h-full bg-[#6d5efc]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-[#8a8aa0] mt-2">{mastered.size}/{cards?.length || 0} פריטים</p>
            </div>
            <p className="text-2xl font-black text-[#6d5efc]">{pct}%</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2 flex items-center gap-1.5">
            <Trophy size={13} /> טבלת התחרויות
          </p>
          {leaderboard.length === 0 ? (
            <div className="bg-[#16181c] rounded-2xl p-4 text-center text-sm text-[#8a8aa0]">
              התחרות תחזיר כשאנשים יתחילו ללמוד
            </div>
          ) : (
            <div className="bg-[#16181c] rounded-2xl overflow-hidden">
              {leaderboard.slice(0, 5).map((row, idx) => (
                <div key={row.team_member_id} className={`flex items-center gap-3 px-4 py-2.5 ${idx > 0 ? "border-t border-[#22252b]" : ""}`}>
                  <span className="text-sm font-black" style={{ color: idx === 0 ? "#f3c14b" : idx === 1 ? "#c7ccd6" : "#cd8b5b" }}>
                    {idx + 1}
                  </span>
                  <span className="w-8 h-8 rounded-full text-white text-xs font-black flex items-center justify-center" style={{ background: colorForName(row.name) }}>
                    {row.name[0]}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#eef0f6]">{row.name}</p>
                    <p className="text-xs text-[#8a8aa0]">{row.mastered_count} נלמדו</p>
                  </div>
                  <p className="text-sm font-black text-[#6d5efc]">{row.points}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsScreen({ onBack, session, onSignOut, leaderboard }) {
  const myRank = leaderboard.findIndex((r) => r.team_member_id === session.teamMemberId) + 1;
  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-[#8a8aa0]">← חזרה</button>
        <p className="font-bold">הפרופיל שלי</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="bg-[#16181c] rounded-2xl p-4">
          <p className="text-sm font-bold text-[#8a8aa0] mb-2">שם</p>
          <p className="text-lg font-black text-[#eef0f6]">{session.name}</p>
          {myRank > 0 && <p className="text-xs text-[#6d5efc] font-bold mt-2">מקום {myRank}</p>}
        </div>
        <button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 text-[#e0315a] text-sm font-bold py-3.5 bg-[#16181c] rounded-2xl border border-[#22252b]">
          <LogOut size={16} /> התנתקות
        </button>
      </div>
    </div>
  );
}

function Flashcards({ items, onKnown, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (i >= items.length) {
    return (
      <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] items-center justify-center px-8 text-center" dir="rtl">
        <Trophy size={48} className="text-[#f3c14b] mb-4" />
        <h2 className="text-2xl font-black text-[#eef0f6]">סיימת את הכרטיסיות!</h2>
        <button onClick={onDone} className="mt-8 px-6 py-3 rounded-2xl font-bold bg-[#6d5efc] text-white">חזור לבית</button>
      </div>
    );
  }

  const it = items[i];
  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-5 py-3 flex items-center gap-3">
        <button onClick={onDone} className="text-[#8a8aa0]">← חזרה</button>
        <p className="font-bold text-sm">{i + 1}/{items.length}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-4">
        <div className="bg-[#16181c] rounded-3xl p-6 w-full text-center">
          <p className="text-3xl font-black text-[#eef0f6] mb-4">{it.name}</p>
          <p className="text-lg font-bold text-[#ea7317]">₪{it.price}</p>
          {!revealed && (
            <button onClick={() => setRevealed(true)} className="mt-6 w-full py-3 rounded-2xl font-bold bg-[#6d5efc] text-white">
              חשוף תשובה
            </button>
          )}
          {revealed && (
            <>
              {it.description && <p className="text-sm text-[#c4c4d4] mt-4">{it.description}</p>}
              {it.allergens?.length > 0 && (
                <div className="mt-4 p-3 bg-[#3a1d22] rounded-lg">
                  <p className="text-xs font-bold text-[#e0315a]">אלרגנים: {it.allergens.join(", ")}</p>
                </div>
              )}
              <div className="flex gap-2 mt-6">
                <button onClick={() => { onKnown(it.id); setRevealed(false); setI(i + 1); }} className="flex-1 py-3 rounded-2xl font-bold bg-[#22c08c] text-white">
                  ידעתי ✓
                </button>
                <button onClick={() => { setRevealed(false); setI(i + 1); }} className="flex-1 py-3 rounded-2xl font-bold bg-[#22252b] text-[#c4c4d4]">
                  בחזרה
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Quiz({ items, onCorrect, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const questions = useMemo(() => generateQuiz(items), [items]);

  if (i >= questions.length) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] items-center justify-center px-8 text-center" dir="rtl">
        <Trophy size={48} className="text-[#f3c14b] mb-4" />
        <h2 className="text-2xl font-black text-[#eef0f6]">{score}/{questions.length} ({pct}%)</h2>
        <button onClick={onDone} className="mt-8 px-6 py-3 rounded-2xl font-bold bg-[#6d5efc] text-white">חזור לבית</button>
      </div>
    );
  }

  const q = questions[i];
  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-5 py-3 flex items-center gap-3">
        <button onClick={onDone} className="text-[#8a8aa0]">← חזרה</button>
        <p className="font-bold text-sm">{i + 1}/{questions.length}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col">
        <div className="bg-[#16181c] rounded-2xl p-5 mb-4">
          <p className="text-lg font-black text-[#eef0f6]">{q.q}</p>
        </div>
        <div className="space-y-2">
          {q.options.map((opt, idx) => (
            <button key={idx} onClick={() => { if (opt.correct) { setScore(s => s + 1); onCorrect(q.item.id); } setI(i + 1); }}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-right ${opt.correct ? "bg-[#22c08c] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function generateQuiz(items) {
  if (!items.length) return [];
  return items.slice(0, 6).map((it) => {
    const rand = Math.random();
    if (rand < 0.33) {
      const correct = `₪${it.price}`;
      return {
        q: `מה המחיר של "${it.name}"?`,
        item: it,
        options: shuffle([
          { label: correct, correct: true },
          { label: `₪${it.price + 10}`, correct: false },
          { label: `₪${Math.max(5, it.price - 5)}`, correct: false },
        ]),
      };
    } else if (rand < 0.66 && it.allergens?.length) {
      const allergen = it.allergens[0];
      return {
        q: `האם "${it.name}" מתאימה למי שאלרגי ל${allergen}?`,
        item: it,
        options: [
          { label: "לא, יש בה אלרגן", correct: true },
          { label: "כן, בטוח", correct: false },
        ],
      };
    }
    return {
      q: `מה עיקרי מרכיב ב"${it.name}"?`,
      item: it,
      options: it.groups?.[0]?.items?.slice(0, 2).map((ing, idx) => ({
        label: ing,
        correct: idx === 0,
      })) || [{ label: "?", correct: true }],
    };
  });
}

function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }
