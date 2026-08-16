import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import { buildWeightedDeck } from "../lib/questionEngine";
import { FEEDBACK_MS } from "./shared";
import NotEnoughData from "./NotEnoughData";


// Objective: show the dish name, tap the correct description among 2 distractors.
// Was originally "read the description, type the dish's name" — replaced 2026-08-11
// (user feedback): the real menu's dish names are English/transliterated, so exact-match
// free-text typing was mostly testing spelling, not menu knowledge. Tap-only removes that
// friction entirely while keeping the grading objective (still can't self-report a lie).
// Rebuilt 2026-08-12 on the smart question engine — the old version showed the raw
// descriptions as options, so "סלמון אבוקדו" → "סלמון ואבוקדו…" answered itself. Now the
// deck mixes masked-description matching with the modifications question ("אילו שינויים
// ניתן לעשות?") and the ingredient trap, all with similarity-ranked near-miss traps.
export default function NameCompletion({ items, facets, openKeys, onAnswer, onDone }) {
  const pool = useMemo(() => items || [], [items]);
  // Same owner-ranked weighting as the quiz; this mode differs by presentation, not by
  // which aspects of the menu it is allowed to ask about.
  const facetKey = (facets || []).join(",");
  const deck = useMemo(() => buildWeightedDeck(pool, 8, facets), [pool, facetKey]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  if (deck.length < 3) return <NotEnoughData what="אתגר" openKeys={openKeys} onDone={onDone} />;
  if (i >= deck.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{deck.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = deck[i];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const correct = opt === q.correct;
    if (correct) setScore(s => s + 1);
    onAnswer(q.itemId, correct ? 5 : 2);
    setTimeout(() => { setPicked(null); setI(x => x + 1); }, FEEDBACK_MS);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full text-center space-y-3">
          <p className="text-xl font-black text-[#eef0f6] leading-snug">{q.prompt}</p>
          <p className="text-base font-bold text-[#a79bff] mb-3">{q.subject}</p>
          <div className="flex flex-col gap-2">
            {q.options.map((opt, j) => {
              const isCorrectOpt = picked && opt === q.correct;
              const isWrongPick = picked === opt && opt !== q.correct;
              return (
                <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                  className={`py-3 px-3 rounded-lg font-bold text-sm text-right leading-snug transition-colors ${isCorrectOpt ? "bg-[#22c08c] text-white" : isWrongPick ? "bg-[#e0315a] text-white" : "bg-[#16181c] border border-[#22252b] text-[#eef0f6]"}`}>
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
