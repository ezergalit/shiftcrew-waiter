import StreakToast from "./StreakToast";
import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { shuffle, shortCat, FEEDBACK_MS } from "./shared";

// "בוחן זריז — מה יש אצלנו?" (user request, 2026-08-20). Thin categories — soft
// drinks and the like — have no ingredients or descriptions, so every regular
// question type is unbuildable there. What a waiter actually needs to know is the
// carry list itself: we have Coke, we don't have Pepsi. So the quiz mixes the real
// items with common beverages the restaurant does NOT carry.
//
// Safety rule (the AMBIGUOUS lesson): a decoy is usable only if it shares no word
// with ANY item on the whole menu — not just this category — otherwise "פפסי" on a
// menu that somewhere lists פפסי would make two options true.
const DECOYS = [
  "פפסי", "פפסי מקס", "פאנטה", "סבן אפ", "מירינדה", "XL", "רד בול", "מונסטר",
  "נסטי אפרסק", "פיוז-טי", "שוופס ענבים", "קינלי", "טרופית", "בירה שחורה",
  "פריגת תפוזים", "מי עדן בטעם לימון", "קוקה קולה וניל", "אשכוליות ספרינג",
];

const words = (s) =>
  String(s || "")
    .replace(/[^א-תA-Za-z0-9 /]/g, " ")
    .split(/[\s/]+/)
    .filter((w) => w.length >= 2);

export default function MenuCheckQuiz({ items, allItems, onAnswer, onDone }) {
  const pool = useMemo(() => items || [], [items]);
  const label = shortCat(pool[0]?.category || "");
  // Every word on the entire menu — the decoy filter runs against this.
  const menuWords = useMemo(() => {
    const s = new Set();
    (allItems || pool).forEach((it) => {
      words(it.name).forEach((w) => s.add(w));
      words(it.displayName).forEach((w) => s.add(w));
    });
    return s;
  }, [allItems, pool]);
  const decoys = useMemo(
    () => DECOYS.filter((d) => words(d).every((w) => !menuWords.has(w))),
    [menuWords]
  );
  const deck = useMemo(() => {
    if (pool.length < 3 || decoys.length < 3) return [];
    const qs = [];
    const reals = shuffle(pool).slice(0, 8);
    reals.forEach((it, idx) => {
      // Alternate the two forms so the round doesn't feel repetitive.
      if (idx % 2 === 0) {
        // Form A: which of these DO we carry? (1 real + 3 decoys)
        const opts = shuffle([dishLabel(it), ...shuffle(decoys).slice(0, 3)]);
        qs.push({ prompt: `איזה משקה יש אצלנו בתפריט?`, correct: dishLabel(it), opts, itemId: it.id });
      } else {
        // Form B: which of these do we NOT carry? (3 real + 1 decoy)
        const others = shuffle(pool.filter((x) => x.id !== it.id)).slice(0, 2);
        const fake = shuffle(decoys)[0];
        const opts = shuffle([fake, dishLabel(it), ...others.map(dishLabel)]);
        qs.push({ prompt: `איזה משקה לא נמצא אצלנו בתפריט?`, correct: fake, opts, itemId: it.id });
      }
    });
    return qs;
  }, [pool, decoys]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [streak, setStreak] = useState(0);
  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl"><p className="text-sm px-8 text-center">אין מספיק פריטים לבוחן בקטגוריה הזו</p></div>;
  if (i >= deck.length) return (
    <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <Trophy size={40} className="text-[#f3c14b]" />
      <p className="font-black text-lg">{score}/{deck.length}</p>
      <p className="text-xs text-[#8a8aa0]">עכשיו אתם יודעים בדיוק מה מגישים ב{label}</p>
      <button onClick={onDone} className="px-4 py-3 min-h-[44px] rounded-lg bg-[#6d5efc] text-white font-bold text-sm">חזור</button>
    </div>
  );
  const q = deck[i];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const correct = opt === q.correct;
    if (correct) setScore((s) => s + 1);
    setStreak((n) => (correct ? n + 1 : 0));
    onAnswer(q.itemId, correct ? 5 : 2);
    setTimeout(() => { setPicked(null); setI((x) => x + 1); }, FEEDBACK_MS);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <StreakToast streak={streak} />
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">← חזרה</button>
        <p className="text-[11px] font-black text-[#22c08c]">בוחן זריז · {label}</p>
        <p className="text-xs font-bold">{i + 1}/{deck.length}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full text-center space-y-3">
          <p className="text-xl font-black text-[#eef0f6] leading-snug">{q.prompt}</p>
          <div className="flex flex-col gap-2">
            {q.opts.map((opt, j) => {
              const isCorrectOpt = picked && opt === q.correct;
              const isWrongPick = picked === opt && opt !== q.correct;
              return (
                <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                  className={`py-3 min-h-[44px] px-3 rounded-lg font-bold text-sm leading-snug transition-colors ${isCorrectOpt ? "bg-[#22c08c] text-white" : isWrongPick ? "bg-[#e0315a] text-white" : "bg-[#16181c] border border-[#22252b] text-[#eef0f6]"}`}>
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
