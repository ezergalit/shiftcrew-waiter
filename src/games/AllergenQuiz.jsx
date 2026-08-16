import StreakToast from "./StreakToast";
import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { shuffle, ALLERGENS } from "./shared";

export default function AllergenQuiz({ items, onAnswer, onDone }) {
  const deck = useMemo(() => shuffle(items || []).slice(0, 8), [items]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [streak, setStreak] = useState(0);
  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין פריטים</p></div>;
  if (i >= deck.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{deck.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = deck[i];
  const actual = new Set(it.allergens || []);
  const toggle = (a) => { if (submitted) return; setSelected(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; }); };
  // Kept as state rather than recomputed on render: after `submitted` flips, the verdict
  // must describe the answer that was actually sent.
  const wasCorrect = submitted && selected.size === actual.size && [...selected].every(a => actual.has(a));
  const missed = [...actual].filter((a) => !selected.has(a));
  const overPicked = [...selected].filter((a) => !actual.has(a));
  const submit = () => {
    if (submitted) return;
    const correct = selected.size === actual.size && [...selected].every(a => actual.has(a));
    if (correct) setScore(s => s + 1);
    setStreak((n) => (correct ? n + 1 : 0));
    onAnswer(it.id, correct ? 5 : 2);
    setSubmitted(true);
    // A wrong answer needs longer on screen than a right one — there is something to read.
    setTimeout(() => { setSubmitted(false); setSelected(new Set()); setI(x => x + 1); }, correct ? 1400 : 2600);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <StreakToast streak={streak} />
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3 text-center">
          <p className="text-sm font-black mb-1">{dishLabel(it)}</p>
          <p className="text-[15px] font-black text-[#eef0f6] leading-snug">אילו אלרגיות יש במנה הזו?</p>
        </div>
        {/* The verdict has to be stated, not inferred from chip colours. Answering "no
            allergies" on a dish that has them used to paint every real allergen green and
            nothing red, so a wrong answer looked exactly like a right one. */}
        {submitted && (
          <div className={`rounded-lg p-3 mb-3 text-center border ${
            wasCorrect ? "bg-[#15302b] border-[#22c08c]" : "bg-[#3a1d22] border-[#e0315a]"
          }`}>
            <p className={`text-sm font-black ${wasCorrect ? "text-[#22c08c]" : "text-[#e0315a]"}`}>
              {wasCorrect ? "✓ נכון" : "✗ טעית"}
            </p>
            {!wasCorrect && (
              <p className="text-[11px] font-bold text-[#eef0f6] mt-1">
                {missed.length > 0 && (
                  selected.size === 0
                    ? `יש אלרגיות במנה: ${missed.join(", ")}`
                    : `פספסתם: ${missed.join(", ")}`
                )}
                {missed.length > 0 && overPicked.length > 0 && " · "}
                {overPicked.length > 0 && `אין במנה: ${overPicked.join(", ")}`}
              </p>
            )}
            {wasCorrect && actual.size === 0 && (
              <p className="text-[11px] text-[#8a8aa0] mt-1">אין אלרגיות במנה זו</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ALLERGENS.map(a => {
            const on = selected.has(a);
            // Three distinct post-answer states, not two: picked-and-right, picked-and-wrong,
            // and right-but-missed. The last one used to be indistinguishable from the first.
            const gotIt = submitted && on && actual.has(a);
            const wasMissed = submitted && !on && actual.has(a);
            const showWrongPick = submitted && on && !actual.has(a);
            return (
              <button key={a} disabled={submitted} onClick={() => toggle(a)}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                  gotIt ? "bg-[#22c08c] text-white border-[#22c08c]" :
                  wasMissed ? "bg-[#3a1d22] text-[#22c08c] border-[#22c08c] border-dashed" :
                  showWrongPick ? "bg-[#e0315a] text-white border-[#e0315a] line-through" :
                  on ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]"
                }`}>
                {wasMissed ? `${a} ←` : a}
              </button>
            );
          })}
        </div>
        {!submitted && (
          <button onClick={submit} className="w-full py-2.5 rounded-lg font-bold text-xs bg-[#6d5efc] text-white">
            {selected.size === 0 ? "אין אלרגיות / שליחה" : "שליחה"}
          </button>
        )}
      </div>
    </div>
  );
}
