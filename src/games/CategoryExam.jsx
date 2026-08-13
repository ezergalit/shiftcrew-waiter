import { useState, useEffect, useMemo, useRef } from "react";
import { GraduationCap } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
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
    return shuffle(pool)
      .slice(0, 4)
      .map((it) => {
        const real = it.ingredients || [];
        const isReal = (x) => real.some((r) => r.trim() === x.trim());
        const others = pool.filter((x) => x.id !== it.id);
        // Same-category siblings make the hardest, fairest decoys: for the three Truffle
        // Creams the decoys ARE the ingredients that tell them apart.
        const near = [...new Set(others.flatMap((x) => x.ingredients || []))].filter((x) => !isReal(x));
        const decoys = shuffle(near).slice(0, Math.min(5, Math.max(3, real.length)));
        return {
          it,
          options: shuffle([
            ...real.map((label) => ({ label, correct: true })),
            ...decoys.map((label) => ({ label, correct: false })),
          ]),
        };
      });
  }, [items]);

  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(new Set());
  const [pickedAll, setPickedAll] = useState(new Set());
  const [result, setResult] = useState(null);
  const [scores, setScores] = useState([]);

  // A real exam is timed. Each dish here is two multi-selects (ingredients + allergens),
  // heavier than a single multiple-choice, so it gets more room than the intake exam's 12s.
  const SECONDS_PER_DISH = 45;
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
          <p className="text-sm font-bold text-[#8a8aa0] mt-1">מבחן {categoryLabel}</p>
        </div>
        <p className="text-sm text-[#c4c4d4] max-w-xs leading-relaxed">
          {passed ? "עברת! אתה מכיר את הקטגוריה הזו טוב." : "עוד לא עברת — תרגלו את הקטגוריה ותנסו שוב."}
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
    const ingJ = jaccard(picked, realIng);
    const allJ = jaccard(pickedAll, realAll);
    const score = Math.round((ingJ * 0.6 + allJ * 0.4) * 100);
    const rating = score >= 85 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
    onAnswer(q.it.id, rating);
    setScores((s) => [...s, score]);
    setResult({
      score,
      wrongIng: [...picked].filter((x) => !realIng.some((r) => r.trim() === x.trim())),
      missIng: realIng.filter((x) => !picked.has(x)),
      wrongAll: [...pickedAll].filter((x) => !realAll.some((r) => r.trim() === x.trim())),
      missAll: realAll.filter((x) => !pickedAll.has(x)),
    });
  };

  const next = () => { setResult(null); setPicked(new Set()); setPickedAll(new Set()); setI((x) => x + 1); };

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
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← יציאה</button>
        <p className="text-xs font-bold truncate px-2">מבחן {shortCat(categoryLabel)}</p>
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

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-2">מה נמצא במנה? (בחרו את כל הנכונים)</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {q.options.map((opt) => (
            <button
              key={opt.label}
              disabled={!!result}
              onClick={() => toggle(setPicked)(opt.label)}
              className={`text-[12px] font-bold px-3 py-2 rounded-lg border transition-colors ${chipClass(opt.label, picked.has(opt.label), opt.correct)}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-2">אילו אלרגיות יש במנה? (אם אין — אל תבחרו כלום)</p>
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
              disabled={picked.size === 0}
              className={`w-full py-3.5 rounded-2xl font-black text-sm ${
                picked.size ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"
              }`}
            >
              שליחה
            </button>
            {picked.size === 0 && (
              <p className="text-[11px] text-[#8a8aa0] text-center mt-2">בחרו לפחות מרכיב אחד</p>
            )}
          </>
        )}

        {result && (
          <div className="space-y-3">
            {result.missAll.length > 0 && (
              <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-xl p-3">
                <p className="text-[11px] font-black text-[#e0315a] mb-1">⚠️ פספסתם אלרגיות</p>
                <p className="text-sm text-[#eef0f6]">{result.missAll.join(", ")}</p>
                <p className="text-[11px] text-[#c4c4d4] mt-1.5">זה הדבר הכי חשוב לדעת — לקוח עלול להיפגע.</p>
              </div>
            )}
            {result.wrongAll.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">סימנתם אלרגיות שאינן במנה: {result.wrongAll.join(", ")}</p>
            )}
            {result.wrongIng.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">לא נמצא במנה: {result.wrongIng.join(", ")}</p>
            )}
            {result.missIng.length > 0 && (
              <p className="text-[11px] text-[#f3a712]">פספסתם: {result.missIng.join(", ")}</p>
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
