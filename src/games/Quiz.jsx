import StreakToast from "./StreakToast";
import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import { buildWeightedDeck } from "../lib/questionEngine";
import { FEEDBACK_MS } from "./shared";
import NotEnoughData from "./NotEnoughData";
import DishReveal from "./DishReveal";


// Objective — right/wrong is checkable, so the game grades itself: correct → 5,
// wrong → 2. No self-report here, unlike Flashcards.
// Objective: read the description, pick the matching dish name among 4 options — the
// multiple-choice mirror of NameCompletion's name→description below. Price was dropped
// entirely (2026-08-11, user feedback): it's irrelevant to knowing the menu, and some
// dish *names* have a price baked into them (data-quality issue, fixed separately once
// the real menu text is in), so quizzing on price actively worked against the concept.
// Rebuilt 2026-08-12 on the smart question engine (src/lib/questionEngine.js) — user
// feedback: most questions were trivially easy (the dish name literally appeared in the
// correct option). Now a mixed deck of 4 question kinds (masked description→name,
// ingredient trap, allowed modifications, name→masked description) with similarity-ranked
// distractors and name-leak masking. See the engine file for the full rationale.
// 2026-08-12: added qServingStyle — asks which serving style a dish belongs to, with the
// full category lines as options, so the unit counts they carry get tested too.
export default function Quiz({ items, facets, openKeys, onAnswer, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [streak, setStreak] = useState(0);
  // After a wrong answer: the full dish card, so the mistake teaches (user request,
  // 2026-08-20). Holds the dish being studied; null = normal question flow.
  const [reveal, setReveal] = useState(null);
  const pool = useMemo(() => items || [], [items]);
  // Weighted by what the owner said matters, not a fixed builder list — otherwise the
  // ranking on their settings screen would quietly do nothing here.
  // Keyed on facet content, not array identity — a caller handing us a freshly built
  // array must never rebuild the deck the trainee is partway through.
  const facetKey = (facets || []).join(",");
  const qs = useMemo(() => buildWeightedDeck(pool, 8, facets), [pool, facetKey]);
  if (qs.length < 3) return <NotEnoughData what="חידון" openKeys={openKeys} onDone={onDone} />;
  if (i >= qs.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{qs.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  if (reveal) return <DishReveal item={reveal} onNext={() => { setReveal(null); setI(x => x + 1); }} />;
  const q = qs[i];
  const next = (opt) => {
    setPicked(opt);
    const correct = opt === q.correct;
    if (correct) setScore(s => s + 1);
    setStreak((n) => (correct ? n + 1 : 0));
    onAnswer(q.itemId, correct ? 5 : 2);
    const dish = correct ? null : pool.find(x => x.id === q.itemId);
    setTimeout(() => {
      setPicked(null);
      if (dish) setReveal(dish); else setI(x => x + 1);
    }, FEEDBACK_MS);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <StreakToast streak={streak} />
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold text-[#eef0f6]">{i + 1}/{qs.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        {/* The question is the star; the dish name is context. Sized accordingly —
            the old 15px prompt under an 18px dish name read as a caption. */}
        <div className="bg-[#16181c] rounded-xl p-4 mb-3">
          <p className={`text-xl font-black text-[#eef0f6] leading-snug ${q.showSubject === false ? "" : "mb-2"}`}>{q.prompt}</p>
          {q.showSubject !== false && (
            <p className={`font-bold text-[#a79bff] ${q.subjectKind === "desc" ? "text-sm leading-relaxed" : "text-base"}`}>{q.subject}</p>
          )}
        </div>
        <div className="space-y-2">
          {q.options.map((opt, j) => {
            const isCorrect = picked && opt === q.correct;
            const isWrong = picked === opt && opt !== q.correct;
            return (
              <button key={j} disabled={!!picked} onClick={() => next(opt)} className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right leading-snug transition-colors ${isCorrect ? "bg-[#22c08c] text-white" : isWrong ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>{opt}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
