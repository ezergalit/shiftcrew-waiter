import StreakToast from "./StreakToast";
import { useState, useEffect, useMemo } from "react";
import { Zap } from "lucide-react";
import { pickDistractors, dishLabel } from "../lib/questionEngine";
import { shuffle } from "./shared";
import DishReveal from "./DishReveal";


// Objective, faster-paced version of the name→ingredient idea (3 options, 30s overall
// clock instead of per-question) — was originally a self-report "ידעתי/לא יודע" button
// pair, then a price quiz; both replaced (2026-08-11, user feedback: price is irrelevant
// to menu knowledge and self-report is unverifiable — this keeps neither).
const SPEED_SECONDS = 30;
// A round is short enough that leaving instantly would just be a free deck reroll; long
// enough that being stuck for the full 30s after a mis-tap is annoying. 10s splits it.
const SPEED_EXIT_AFTER_S = 10;

export default function Speed({ items, onAnswer, onDone, onFinish }) {
  const pool = useMemo(() => (items || []).filter(it => it.ingredients?.length > 0), [items]);
  const deck = useMemo(() => shuffle(pool).slice(0, 12).map(it => {
    const a = shuffle(it.ingredients)[0];
    const otherIngredients = [...new Set(pickDistractors(pool, it, 6).flatMap(x => x.ingredients))].filter(ing => ing !== a);
    return { it, a, opts: shuffle([a, ...shuffle(otherIngredients).slice(0, 2)]) };
  }), [pool]);
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [time, setTime] = useState(SPEED_SECONDS);
  const [picked, setPicked] = useState(null);
  const [streak, setStreak] = useState(0);
  // Wrong answer → full dish card. The 30s clock pauses while it is on screen —
  // studying the dish must not eat the round's time.
  const [reveal, setReveal] = useState(null);
  useEffect(() => {
    if (time <= 0 || reveal) return;
    const t = setInterval(() => setTime(x => x - 1), 1000);
    return () => clearInterval(t);
  }, [time, reveal]);
  const finished = time <= 0 || i >= deck.length;
  // Fires exactly once on the false→true transition (both `time` and `i` only move forward).
  useEffect(() => { if (finished) onFinish?.(correct); }, [finished]);
  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פריטים</p></div>;
  if (finished) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Zap size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{correct} נכונים!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  if (reveal) return <DishReveal item={reveal} onNext={() => { setReveal(null); setPicked(null); setI(x => x + 1); }} />;
  const q = deck[i];
  const answer = (opt) => {
    setPicked(opt);
    const isCorrect = opt === q.a;
    if (isCorrect) setCorrect(c => c + 1);
    setStreak((n) => (isCorrect ? n + 1 : 0));
    onAnswer(q.it.id, isCorrect ? 5 : 2);
    if (isCorrect) {
      setTimeout(() => { setPicked(null); setI(x => x + 1); }, 350);
    } else {
      // Long enough to see the red highlight, then the study card takes over.
      setTimeout(() => setReveal(q.it), 700);
    }
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <StreakToast streak={streak} />
      {/* No way out at all used to mean a mis-tap cost the full 30s. The exit appears only
          after 10 seconds so it can't be used to reroll an unwanted deck instantly. */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-bold text-[#f3c14b]">⏱ {time}s</span>
        <p className="text-xs font-bold">{i + 1}/{deck.length}</p>
        {SPEED_SECONDS - time >= SPEED_EXIT_AFTER_S ? (
          <button onClick={onDone} className="text-xs text-[#8a8aa0]">יציאה ←</button>
        ) : (
          <span className="text-[11px] text-[#5a5a6e] font-bold">
            יציאה בעוד {SPEED_EXIT_AFTER_S - (SPEED_SECONDS - time)}s
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center w-full">
          <p className="text-[15px] font-black text-[#eef0f6] leading-snug mb-2">איזה מרכיב שייך למנה הזו?</p>
          <p className="text-lg font-black mb-4">{dishLabel(q.it)}</p>
          <div className="flex flex-col gap-2">
            {q.opts.map((opt, j) => {
              const isCorrectOpt = picked && opt === q.a;
              const isWrongPick = picked && opt === picked && opt !== q.a;
              return (
                <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                  className={`py-3 rounded-lg font-black text-sm transition-colors ${isCorrectOpt ? "bg-[#22c08c] text-white" : isWrongPick ? "bg-[#e0315a] text-white" : "bg-[#16181c] border border-[#22252b] text-[#eef0f6]"}`}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
