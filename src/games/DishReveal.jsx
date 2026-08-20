import { useEffect, useState } from "react";
import { dishLabel } from "../lib/questionEngine";
import { categoryVisual } from "../lib/categoryVisual";

// After a wrong answer in a graded game, the mistake becomes a study moment: the full
// dish card takes the screen for a few seconds, then the round continues — a button
// skips ahead, and a countdown advances on its own for a waiter who just watches.
// Matching is exempt (a board can't pause per-pair without breaking its pacing), and
// the exams are exams — no teaching mid-test.
export const REVEAL_SECONDS = 8;

export default function DishReveal({ item, onNext }) {
  const [left, setLeft] = useState(REVEAL_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= 0) onNext(); }, [left, onNext]);
  if (!item) return null;
  const vis = categoryVisual(item.category);
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-black text-[#f3a712]">רגע לומדים את המנה 📖</p>
        <p className="text-[11px] text-[#8a8aa0] font-bold">ממשיכים בעוד {Math.max(left, 0)}s</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-center">
        <div className="bg-[#16181c] border border-[#f3a712]/40 rounded-2xl p-5 w-full text-center space-y-2.5">
          <span
            className="w-14 h-14 rounded-2xl inline-flex items-center justify-center text-3xl"
            style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
            aria-hidden
          >
            {vis.emoji}
          </span>
          <p className="text-xl font-black text-[#eef0f6]">{dishLabel(item)}</p>
          {item.desc && <p className="text-sm text-[#c4c4d4] leading-relaxed">{item.desc}</p>}
          {item.ingredients?.length > 0 && (
            <p className="text-xs text-[#8a8aa0]">מרכיבים: {item.ingredients.join(", ")}</p>
          )}
          {item.allergens?.length > 0 && (
            <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-xs font-bold text-[#e0315a]">אלרגיות: {item.allergens.join(", ")}</p></div>
          )}
          {item.pitfalls?.length > 0 && (
            <div className="bg-[#3a2f1d] p-2 rounded-lg"><p className="text-xs font-bold text-[#f3c14b]">מוקשים: {item.pitfalls.join(", ")}</p></div>
          )}
        </div>
        <button
          onClick={onNext}
          className="mt-4 w-full py-3 min-h-[44px] rounded-lg font-bold text-sm bg-[#6d5efc] text-white"
        >
          הבנתי, ממשיכים ←
        </button>
      </div>
    </div>
  );
}
