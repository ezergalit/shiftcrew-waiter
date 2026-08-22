import { useState, useEffect, useMemo, useRef } from "react";
import { GraduationCap } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { typedIngredientScore } from "../lib/typedGrading";
import { shortCat, shuffle, ALLERGENS } from "./shared";


// The graduation step for a category. Deliberately NOT free text: an earlier version asked
// the trainee to describe the dish and scored how many real ingredients they happened to
// mention. That only measured recall, never precision — so listing every ingredient on the
// menu scored 100% on every dish, and it couldn't tell Greek Truffle Cream 38 from 44 from
// 48, which is precisely the distinction that matters in service.
//
// Instead: the real ingredients are mixed with near-miss decoys taken from the OTHER dishes
// in the same category, and the trainee has to pick the exact set. Scored by Jaccard
// (correct / correct+missed+wrong), so both missing an ingredient and inventing one cost
// you, and "select everything" collapses to a low score. Fully deterministic — no AI, no
// language matching, nothing to tune — which also makes the number honest enough for the
// owner to act on.
export default function CategoryExam({ items, categoryLabel, onAnswer, onDone, onFinish }) {
  const deck = useMemo(() => {
    const pool = (items || []).filter((it) => it.ingredients?.length > 0);
    // 2026-08-20 (user request): exams are long now — up to 12 dishes instead of 4.
    return shuffle(pool)
      .slice(0, 12)
      // Free recall (user, 2026-08-20): no chips, no decoys — the waiter WRITES the
      // ingredients from memory, up to 7 fields. Graded fuzzily and leniently in
      // lib/typedGrading.js: recall is harder than recognition, and spelling is not
      // menu knowledge.
      .map((it) => ({ it, fields: Math.min(7, Math.max(3, (it.ingredients || []).length)) }));
  }, [items]);

  const [i, setI] = useState(0);
  const [typed, setTyped] = useState([]);          // free-recall ingredient entries
  const [pickedAll, setPickedAll] = useState(new Set());
  const [result, setResult] = useState(null);
  const [scores, setScores] = useState([]);

  // A real exam is timed. Each dish here is two multi-selects (ingredients + allergens),
  // heavier than a single multiple-choice, so it gets more room than the intake exam's 12s.
  // 25s/dish (was 45) — tightened 2026-08-20 by user request to make exams harder.
  const SECONDS_PER_DISH = 25;
  const [secondsLeft, setSecondsLeft] = useState(0);
  const started = deck.length >= 2;
  useEffect(() => {
    if (!started) return;
    setSecondsLeft(deck.length * SECONDS_PER_DISH);
  }, [started, deck.length]);
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started]);
  const outOfTime = started && secondsLeft <= 0;

  // Record the attempt exactly once, when the last question is graded. Declared above the
  // early returns below because hooks can't run conditionally; the ref guards against
  // re-firing on every re-render of the finished screen.
  const finished = started && (i >= deck.length || outOfTime);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!finished || reportedRef.current) return;
    reportedRef.current = true;
    // Average over the whole deck, not just what was answered — otherwise running out of
    // time after one lucky question would score higher than finishing the exam.
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / deck.length);
    onFinish?.({ score: avg, passed: avg >= 70, dishCount: deck.length });
  }, [finished, scores, deck.length, onFinish]);

  if (deck.length < 2)
    return (
      <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6] px-8 text-center" dir="rtl">
        <p className="text-sm">צריך לפחות 2 מנות עם מרכיבים בקטגוריה הזו כדי להיבחן</p>
      </div>
    );

  if (finished) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / deck.length);
    const passed = avg >= 70;
    return (
      <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${passed ? "bg-[#15302b]" : "bg-[#3a1d22]"}`}>
          <GraduationCap size={38} className={passed ? "text-[#22c08c]" : "text-[#e0315a]"} />
        </div>
        <div>
          <p className="text-4xl font-black">{avg}%</p>
          <p className="text-sm font-bold text-[#8a8aa0] mt-1">בוחן {categoryLabel}</p>
        </div>
        <p className="text-sm text-[#c4c4d4] max-w-xs leading-relaxed">
          {passed ? "עברת! הקטגוריה הזו כבר מוכרת לך היטב." : "עוד לא עברת — עוד קצת תרגול ואפשר לגשת שוב."}
        </p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#6d5efc] text-white font-black text-sm">סיום</button>
      </div>
    );
  }

  const q = deck[i];
  const realIng = q.it.ingredients || [];
  const realAll = q.it.allergens || [];

  // Correct / (correct + missed + wrong). Both empty is a perfect answer — knowing a dish
  // has no allergens is real knowledge, and selecting one anyway is penalised.
  const jaccard = (selected, correct) => {
    const s = new Set([...selected].map((x) => x.trim()));
    const c = new Set(correct.map((x) => x.trim()));
    const tp = [...c].filter((x) => s.has(x)).length;
    const fp = [...s].filter((x) => !c.has(x)).length;
    const fn = [...c].filter((x) => !s.has(x)).length;
    return tp + fp + fn === 0 ? 1 : tp / (tp + fp + fn);
  };

  const toggle = (setter) => (label) =>
    setter((prev) => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  const submit = () => {
    if (result) return;
    // Ingredients are free recall (lenient — see typedGrading.js); allergens stay a
    // closed-list exact set, because safety data has no "close enough".
    const ing = typedIngredientScore(typed, realIng);
    const allJ = jaccard(pickedAll, realAll);
    const score = Math.round((ing.score * 0.6 + allJ * 0.4) * 100);
    const rating = score >= 85 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
    onAnswer(q.it.id, rating);
    setScores((s) => [...s, score]);
    setResult({
      score,
      matchedIng: ing.matched,
      wrongIng: ing.wrong,
      missIng: ing.missed,
      wrongAll: [...pickedAll].filter((x) => !realAll.some((r) => r.trim() === x.trim())),
      missAll: realAll.filter((x) => !pickedAll.has(x)),
    });
  };

  const next = () => { setResult(null); setTyped([]); setPickedAll(new Set()); setI((x) => x + 1); };

  // Post-submit colouring: green = you got it, red = you picked it and it's not in the dish,
  // amber outline = it was in the dish and you missed it.
  const chipClass = (label, isSelected, isCorrect) => {
    if (!result) return isSelected ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]";
    if (isSelected && isCorrect) return "bg-[#22c08c] text-white border-[#22c08c]";
    if (isSelected && !isCorrect) return "bg-[#e0315a] text-white border-[#e0315a]";
    if (!isSelected && isCorrect) return "bg-[#33290f] text-[#f3a712] border-[#f3a712]";
    return "bg-[#16181c] text-[#4a4a5a] border-[#22252b]";
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← יציאה</button>
        <p className="text-xs font-bold truncate px-2">בוחן {shortCat(categoryLabel)}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Red for the last 30s — enough warning to finish the dish in hand. */}
          <span className={`text-xs font-black ${secondsLeft <= 30 ? "text-[#e0315a]" : "text-[#f3c14b]"}`}>
            ⏱ {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
          <p className="text-xs font-bold text-[#8a8aa0]">{i + 1}/{deck.length}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-[#16181c] rounded-xl p-4 text-center mb-4">
          <p className="text-xl font-black">{dishLabel(q.it)}</p>
          {result && (
            <p className={`text-3xl font-black mt-2 ${result.score >= 70 ? "text-[#22c08c]" : "text-[#e0315a]"}`}>{result.score}%</p>
          )}
        </div>

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">מה נמצא במנה? כתוב/כתבי מהזיכרון</p>
        <p className="text-[10.5px] text-[#5a5a6e] mb-2">לא חייבים את הכל, ואיות לא מדויק בסדר גמור. רק בלי להמציא — מרכיב שגוי מוריד.</p>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {Array.from({ length: q.fields }).map((_, idx) => {
            // Post-submit colouring per field: green = named a real ingredient,
            // red = named nothing in the dish, dark = left empty.
            const val = typed[idx] || "";
            let cls = "bg-[#16181c] border-[#22252b] text-[#eef0f6]";
            if (result && val.trim()) {
              const good = result.matchedIng.some((m) => m.entry === val.trim());
              cls = good ? "bg-[#15302b] border-[#22c08c] text-[#22c08c]" : "bg-[#3a1d22] border-[#e0315a] text-[#e0315a]";
            }
            return (
              <input
                key={idx}
                dir="rtl"
                value={val}
                disabled={!!result}
                onChange={(e) => setTyped((prev) => { const n = [...prev]; n[idx] = e.target.value; return n; })}
                placeholder={`מרכיב ${idx + 1}`}
                className={`w-full min-h-[44px] rounded-lg border px-3 text-[13px] font-bold placeholder-[#3a3d46] outline-none focus:border-[#6d5efc] ${cls}`}
              />
            );
          })}
        </div>

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-2">אילו אלרגיות יש במנה? (אם אין — לא לבחור כלום)</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ALLERGENS.map((a) => (
            <button
              key={a}
              disabled={!!result}
              onClick={() => toggle(setPickedAll)(a)}
              className={`text-[12px] font-bold px-3 py-2 rounded-lg border transition-colors ${chipClass(a, pickedAll.has(a), realAll.some((r) => r.trim() === a.trim()))}`}
            >
              {a}
            </button>
          ))}
        </div>

        {!result && (
          <>
            <button
              onClick={submit}
              disabled={!typed.some((t) => (t || "").trim())}
              className={`w-full py-3.5 rounded-2xl font-black text-sm ${
                typed.some((t) => (t || "").trim()) ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"
              }`}
            >
              שליחה
            </button>
            {!typed.some((t) => (t || "").trim()) && (
              <p className="text-[11px] text-[#8a8aa0] text-center mt-2">צריך לפחות מרכיב אחד</p>
            )}
          </>
        )}

        {result && (
          <div className="space-y-3">
            {result.missAll.length > 0 && (
              <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-xl p-3">
                <p className="text-[11px] font-black text-[#e0315a] mb-1">⚠️ פספסת אלרגיות</p>
                <p className="text-sm text-[#eef0f6]">{result.missAll.join(", ")}</p>
                <p className="text-[11px] text-[#c4c4d4] mt-1.5">זה הדבר הכי חשוב לדעת — לקוח עלול להיפגע.</p>
              </div>
            )}
            {result.wrongAll.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">סימנת אלרגיות שאינן במנה: {result.wrongAll.join(", ")}</p>
            )}
            {result.wrongIng.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">לא נמצא במנה: {result.wrongIng.join(", ")}</p>
            )}
            {result.matchedIng.length > 0 && (
              <p className="text-[11px] text-[#22c08c]">זיהית נכון: {result.matchedIng.map((m) => m.ingredient).join(", ")}</p>
            )}
            {result.missIng.length > 0 && (
              <p className="text-[11px] text-[#f3a712]">פספסת: {result.missIng.join(", ")}</p>
            )}
            {q.it.desc && (
              <div className="bg-[#16181c] rounded-xl p-3">
                <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">התיאור המלא</p>
                <p className="text-sm text-[#c4c4d4] leading-relaxed">{q.it.desc}</p>
              </div>
            )}
            <button onClick={next} className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#6d5efc] text-white">
              {i + 1 >= deck.length ? "לתוצאה" : "לשאלה הבאה"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
