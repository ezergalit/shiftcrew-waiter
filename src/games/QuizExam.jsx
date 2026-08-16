import { useState, useEffect, useMemo, useRef } from "react";
import { GraduationCap } from "lucide-react";
import { buildWeightedDeck } from "../lib/questionEngine";
import { FEEDBACK_MS } from "./shared";


// The graduation exam for categories the chip exam can't serve: dishes with no ingredient
// lists, or an owner who ranked ingredients and allergens out of their programme. Same
// pass mark and the same onFinish contract as CategoryExam, so the path treats them
// identically — what differs is only which knowledge is being checked.
export default function QuizExam({ items, facets, categoryLabel, onAnswer, onDone, onFinish }) {
  const pool = useMemo(() => items || [], [items]);
  const facetKey = (facets || []).join(",");
  const deck = useMemo(() => buildWeightedDeck(pool, 8, facets), [pool, facetKey]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const reportedRef = useRef(false);

  const finished = deck.length > 0 && i >= deck.length;
  const score = deck.length ? Math.round((correctCount / deck.length) * 100) : 0;
  const passed = score >= 70;

  // Declared above the early returns — hooks can't run conditionally — and guarded by a
  // ref so a re-render of the results screen can't record the attempt twice.
  useEffect(() => {
    if (finished && !reportedRef.current) {
      reportedRef.current = true;
      onFinish?.({ score, passed, dishCount: deck.length });
    }
  }, [finished, score, passed, deck.length]);

  if (deck.length < 3) return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 px-8 text-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <p className="text-sm">אין מספיק פרטים במנות של {categoryLabel} כדי לבנות מבחן.</p>
      <p className="text-xs text-[#8a8aa0]">בקשו מהמנהל/ת להשלים תיאורים או מרכיבים.</p>
      <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold">חזרה</button>
    </div>
  );

  if (finished) return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 px-8 text-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${passed ? "bg-[#15302b]" : "bg-[#3a1d22]"}`}>
        <GraduationCap size={38} className={passed ? "text-[#22c08c]" : "text-[#e0315a]"} />
      </div>
      <p className="text-4xl font-black" style={{ color: passed ? "#22c08c" : "#e0315a" }}>{score}%</p>
      <p className="text-sm font-bold">{passed ? "עברת! אתה מכיר את הקטגוריה הזו טוב." : "עוד לא עברת — תרגלו את הקטגוריה ותנסו שוב."}</p>
      <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold mt-2">חזרה</button>
    </div>
  );

  const q = deck[i];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const ok = opt === q.correct;
    if (ok) setCorrectCount((c) => c + 1);
    onAnswer(q.itemId, ok ? 5 : 2);
    setTimeout(() => { setPicked(null); setI((x) => x + 1); }, FEEDBACK_MS);
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← יציאה</button>
        <p className="text-xs font-bold">מבחן {categoryLabel}</p>
        <p className="text-xs font-bold text-[#8a8aa0]">{i + 1}/{deck.length}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Question dominant, subject secondary — mirrors Quiz.jsx. */}
        <div className="bg-[#16181c] rounded-xl p-4 mb-3">
          <p className={`text-xl font-black text-[#eef0f6] leading-snug ${q.showSubject === false ? "" : "mb-2"}`}>{q.prompt}</p>
          {q.showSubject !== false && (
            <p className={`font-bold ${q.subjectKind === "desc" ? "text-sm leading-relaxed" : "text-base"}`}>{q.subject}</p>
          )}
        </div>
        <div className="space-y-2">
          {q.options.map((opt, j) => {
            const isCorrect = picked && opt === q.correct;
            const isWrong = picked === opt && opt !== q.correct;
            return (
              <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right leading-snug transition-colors ${
                  isCorrect ? "bg-[#22c08c] text-white" : isWrong ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4] border border-[#22252b]"}`}>
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
