import { useState, useEffect, useMemo, useRef } from "react";
import ExitExam from "./ExitExam";
import { GraduationCap } from "lucide-react";
import { dishLabel, askableIngredients } from "../lib/questionEngine";
import { shortCat, shuffle, ALLERGENS } from "./shared";


// The graduation step for a category.
//
// Two formats were tried before this one and both failed in opposite directions:
//   • free text scored by how many real ingredients you happened to mention — measured
//     recall with no precision, so listing every ingredient on the menu scored 100%;
//   • typing the ingredients from memory (2026-08-20) — the reverse failure. "סוכריות קרם
//     ברולה" holds קרם וניל / קרמל / קולי פטל: a waiter who writes "קרם ברולה, סוכר" knows
//     the dish and scores 13%. Menu knowledge is not the ability to recite supplier names.
//
// What it does now (user, 2026-08-23): pick the dish's ingredients out of ONE pool that is
// the same for every question in the exam, built from the whole category. That is hard to
// cheat by elimination — the pool never narrows, and every decoy is a real ingredient of a
// neighbouring dish, so "it sounds like food" tells you nothing. And Jaccard scoring
// (correct / correct+missed+wrong) means selecting everything collapses to near zero.
// Recognition, but the discriminating kind: which four of these eighteen are in THIS dish.
export default function CategoryExam({ items, categoryLabel, onAnswer, onDone, onFinish }) {
  const allKnowledge = (items || []).length > 0 && (items || []).every((it) => it.knowledge);
  const base = useMemo(
    () => (items || []).filter((it) => allKnowledge || !it.knowledge),
    [items, allKnowledge],
  );
  const deck = useMemo(() => {
    const pool = base.filter((it) => askableIngredients(it).length > 0);
    // 2026-08-20 (user request): exams are long now — up to 12 dishes instead of 4.
    return shuffle(pool).slice(0, 12).map((it) => ({ it }));
  }, [base]);

  // ⚠️ The options are the dish's real ingredients plus DECOYS taken from the other dishes
  // in the same category — never generic food words. That is what makes it hard to cheat:
  // every option is something this kitchen actually serves, so "which of these sounds like
  // food" tells you nothing, and the only way through is knowing this dish apart from its
  // neighbours. Fixed size, so the number of chips never hints at how many are correct.
  //
  // A shared pool for the whole exam was tried first and is worse in practice: a category
  // of eleven dishes produces fifty-odd chips, and hunting through a wall of text measures
  // patience, not menu knowledge.
  const POOL_SIZE = 14;
  const pools = useMemo(() => {
    const all = new Set();
    for (const it of base) for (const g of askableIngredients(it)) {
      const k = String(g).trim(); if (k) all.add(k);
    }
    return deck.map(({ it }) => {
      const mine = askableIngredients(it).map((g) => String(g).trim());
      const mineSet = new Set(mine);
      const decoys = shuffle([...all].filter((x) => !mineSet.has(x)));
      return shuffle([...mineSet, ...decoys.slice(0, Math.max(4, POOL_SIZE - mineSet.size))]);
    });
  }, [base, deck]);

  const [i, setI] = useState(0);
  const [pickedIng, setPickedIng] = useState(new Set());
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
  // ⚠️ The expected answer drops the trivial ingredients too — otherwise the waiter is
  // marked down for not selecting a chip that was never on the screen.
  const realIng = askableIngredients(q.it);
  const realAll = q.it.allergens || [];

  // Correct / (correct + missed + wrong). Both empty is a perfect answer — knowing a dish
  // has no allergens is real knowledge, and selecting one anyway is penalised.
  // ⚠️ A wrong pick costs MORE than a miss (FP_COST). Plain Jaccard still paid 50% for
  // selecting every chip on the screen, and a format where brute force earns half marks is
  // not an exam. It is also the truthful weighting in service: forgetting an ingredient
  // makes you hesitate, naming one that isn't there makes you tell the guest something
  // false. Measured after the change: select-all lands in the twenties.
  const FP_COST = 1.5;
  const jaccard = (selected, correct) => {
    const s = new Set([...selected].map((x) => x.trim()));
    const c = new Set(correct.map((x) => x.trim()));
    const tp = [...c].filter((x) => s.has(x)).length;
    const fp = [...s].filter((x) => !c.has(x)).length;
    const fn = [...c].filter((x) => !s.has(x)).length;
    return tp + fp + fn === 0 ? 1 : tp / (tp + FP_COST * fp + fn);
  };

  const toggle = (setter) => (label) =>
    setter((prev) => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  const submit = () => {
    if (result) return;
    // Both halves are exact sets scored the same way: picking a neighbour's ingredient
    // costs exactly what missing a real one costs, so guessing wide is never a strategy.
    const ingJ = jaccard(pickedIng, realIng);
    const allJ = jaccard(pickedAll, realAll);
    const score = Math.round((ingJ * 0.6 + allJ * 0.4) * 100);
    const rating = score >= 85 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
    onAnswer(q.it.id, rating);
    setScores((s) => [...s, score]);
    const inDish = (x) => realIng.some((r) => String(r).trim() === x.trim());
    setResult({
      score,
      wrongIng: [...pickedIng].filter((x) => !inDish(x)),
      missIng: realIng.filter((x) => !pickedIng.has(String(x).trim())),
      wrongAll: [...pickedAll].filter((x) => !realAll.some((r) => r.trim() === x.trim())),
      missAll: realAll.filter((x) => !pickedAll.has(x)),
    });
  };

  const next = () => { setResult(null); setPickedIng(new Set()); setPickedAll(new Set()); setI((x) => x + 1); };

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
        <ExitExam onDone={onDone} />
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

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">מה נמצא במנה?</p>
        <p className="text-[10.5px] text-[#5a5a6e] mb-2">בין האפשרויות יש מרכיבים של מנות אחרות בקטגוריה. לבחור בדיוק את מה שיש במנה הזו — מרכיב מיותר מוריד בדיוק כמו מרכיב חסר.</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(pools[i] || []).map((g) => (
            <button
              key={g}
              disabled={!!result}
              onClick={() => toggle(setPickedIng)(g)}
              className={`text-[12px] font-bold px-3 py-2 min-h-[40px] rounded-lg border transition-colors ${chipClass(g, pickedIng.has(g), realIng.some((r) => String(r).trim() === g))}`}
            >
              {g}
            </button>
          ))}
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
              disabled={pickedIng.size === 0}
              className={`w-full py-3.5 rounded-2xl font-black text-sm ${
                pickedIng.size > 0 ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"
              }`}
            >
              שליחה
            </button>
            {pickedIng.size === 0 && (
              <p className="text-[11px] text-[#8a8aa0] text-center mt-2">צריך לבחור לפחות מרכיב אחד</p>
            )}
          </>
        )}

        {result && (
          <div className="space-y-3">
            {result.missAll.length > 0 && (
              <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-xl p-3">
                <p className="text-[11px] font-black text-[#e0315a] mb-1">⚠️ פספסת אלרגיות</p>
                <p className="text-sm text-[#eef0f6]">{result.missAll.join(", ")}</p>
                <p className="text-[11px] text-[#c4c4d4] mt-1.5">זה הדבר הכי חשוב לדעת — אורח עלול להיפגע.</p>
              </div>
            )}
            {result.wrongAll.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">סימנת אלרגיות שאינן במנה: {result.wrongAll.join(", ")}</p>
            )}
            {result.wrongIng.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">לא נמצא במנה: {result.wrongIng.join(", ")}</p>
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
