import { useState, useEffect, useMemo, useRef } from "react";
import { GraduationCap } from "lucide-react";
import { buildMenuExamDeck } from "../lib/serviceScenarios";
import { gz } from "../lib/shiftChoice";

// מבחן התפריט המלא — the certificate exam, rebuilt as service scenarios (user request,
// 2026-08-20). It used to be multiple-choice recall like the practice games. But the exam
// is what the owner reads to decide whether someone can work the floor, so it asks what
// the floor asks: a pregnant guest wants a starter, a guest is allergic to sesame,
// "recommend me three rolls with salmon" — and the answer is the dish, by its full name.
//
// Two answer shapes, both from the same deck:
//   • single — one dish (or one ingredient set) is right.
//   • multi  — pick the exact set: three dishes, or every ingredient in a dish. Partial
//     credit would let "select everything" pass, so a set is right or it isn't.
//
// The questions themselves are built in lib/serviceScenarios.js, which refuses to produce
// anything it can't guarantee has one right answer.
const SECONDS = {
  compose: 35, multi: 30, allergenset: 30,
  pregnancy: 20, allergy: 20, pitfall: 20, order: 20, describe: 20, menugroup: 15, price: 15,
};
const KIND_TAG = {
  compose: "הרכבת מנה", multi: "המלצה לאורח", allergenset: "אלרגיות במנה",
  pregnancy: "אורחת בהריון", allergy: "אלרגיה", pitfall: "העדפת אורח",
  order: "סדר הגשה", describe: "אורח מתאר מנה", menugroup: "איפה בתפריט", price: "מחיר",
};

export default function MenuExam({ items, deckSize = 40, passMark = 70, categoryOrder, onAnswer, onDone, onFinish }) {
  // ⚠️ categoryOrder is the owner's own serving order (exam_config.category_order). The
  // serving-order question is built only from it — guessing a course from a category name
  // would teach the waiter something false about their own restaurant's service.
  const deck = useMemo(
    () => buildMenuExamDeck(items || [], deckSize, Math.random, categoryOrder || []),
    [items, deckSize, categoryOrder],
  );

  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(new Set());
  const [result, setResult] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);

  // One clock for the whole exam, sized by what the deck actually contains — a composition
  // question is heavier than "which of these four".
  const total = useMemo(() => deck.reduce((n, q) => n + (SECONDS[q.kind] || 20), 0), [deck]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const started = deck.length >= 5;
  useEffect(() => { if (started) setSecondsLeft(total); }, [started, total]);
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started]);
  const outOfTime = started && secondsLeft <= 0;

  // Reported once, from above the early returns — hooks can't run conditionally, and the
  // ref stops the finished screen re-writing the row on every render.
  const finished = started && (i >= deck.length || outOfTime);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!finished || reportedRef.current) return;
    reportedRef.current = true;
    // Scored over the whole deck: running out of time after two lucky answers must not
    // score higher than sitting the whole exam.
    const score = Math.round((correctCount / deck.length) * 100);
    onFinish?.({ score, passed: score >= passMark, dishCount: deck.length });
  }, [finished, correctCount, deck.length, passMark, onFinish]);

  if (deck.length < 5)
    return (
      <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6] px-8 text-center" dir="rtl">
        <div className="space-y-3">
          <p className="text-sm font-black">אין עדיין מספיק מידע בתפריט למבחן מלא</p>
          <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
            השאלות נבנות מהמרכיבים, האלרגיות והדגלים של המנות. ככל שהתפריט מפורט יותר —
            המבחן שלם יותר.
          </p>
          <button onClick={onDone} className="px-5 py-3 min-h-[44px] rounded-2xl bg-[#6d5efc] text-white font-black text-sm">חזרה</button>
        </div>
      </div>
    );

  if (finished) {
    const score = Math.round((correctCount / deck.length) * 100);
    const passed = score >= passMark;
    return (
      <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${passed ? "bg-[#15302b]" : "bg-[#3a1d22]"}`}>
          <GraduationCap size={38} className={passed ? "text-[#22c08c]" : "text-[#e0315a]"} />
        </div>
        <div>
          <p className="text-4xl font-black">{score}%</p>
          <p className="text-sm font-bold text-[#8a8aa0] mt-1">מבחן התפריט המלא · {correctCount}/{deck.length}</p>
        </div>
        <p className="text-sm text-[#c4c4d4] max-w-xs leading-relaxed">
          {passed
            ? "עברת! אפשר לסמוך עליך בהמלצה — גם כשלאורח יש הגבלה."
            : `צריך ${passMark}% כדי לעבור. עוד סבב על התפריט ואפשר לגשת שוב — אין הגבלה על מספר הניסיונות.`}
        </p>
        <button onClick={onDone} className="px-5 py-3 min-h-[44px] rounded-2xl bg-[#6d5efc] text-white font-black text-sm">סיום</button>
      </div>
    );
  }

  const q = deck[i];
  const need = q.options.filter((o) => o.correct).length;

  const toggle = (id) => {
    if (result) return;
    setPicked((prev) => {
      const n = new Set(prev);
      if (q.multi) { n.has(id) ? n.delete(id) : n.add(id); return n; }
      return new Set([id]);
    });
  };

  const grade = (chosen) => {
    if (result) return;
    const correctIds = new Set(q.options.filter((o) => o.correct).map((o) => o.id));
    // An exact set: every right option chosen, nothing extra. Partial credit here would
    // mean selecting all six dishes passes "recommend three with salmon".
    const ok = chosen.size === correctIds.size && [...chosen].every((id) => correctIds.has(id));
    if (ok) setCorrectCount((n) => n + 1);
    // The dish the question is about takes the score, so the exam feeds the same progress
    // map as everything else — and a wrong answer costs, exactly as in the other graded
    // modes. Ingredient chips have no dish id of their own; the subject carries it.
    if (q.subjectId) onAnswer?.(q.subjectId, ok ? 5 : 2);
    setResult({ ok });
  };

  const next = () => { setResult(null); setPicked(new Set()); setI((x) => x + 1); };

  const optClass = (o) => {
    const sel = picked.has(o.id);
    if (!result) return sel ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#eef0f6] border-[#22252b]";
    if (o.correct) return "bg-[#15302b] text-[#22c08c] border-[#22c08c]";
    if (sel) return "bg-[#3a1d22] text-[#e0315a] border-[#e0315a]";
    return "bg-[#16181c] text-[#4a4a5a] border-[#22252b]";
  };

  // Chips only when every label is short and none of them carries an explanation to show.
  const compactOptions = q.options.every((o) => (o.label || "").length <= 20 && !o.why);

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">← יציאה</button>
        <p className="text-xs font-bold truncate px-2">מבחן התפריט המלא</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-black ${secondsLeft <= 60 ? "text-[#e0315a]" : "text-[#f3c14b]"}`}>
            ⏱ {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
          <p className="text-xs font-bold text-[#8a8aa0]">{i + 1}/{deck.length}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-[#16181c] rounded-2xl p-4 space-y-1.5">
          <span className="inline-block text-[10px] font-black text-[#a79bff] bg-[#6d5efc]/15 rounded px-2 py-0.5">
            {KIND_TAG[q.kind] || "שאלה"}
          </span>
          {/* The question is the headline — it used to be grey 11px under a big dish name,
              and waiters answered the name instead of the question. */}
          <p className="text-[15px] font-black leading-snug">{gz(q.prompt)}</p>
          {q.hint && <p className="text-[11px] text-[#8a8aa0] leading-snug">{gz(q.hint)}</p>}
        </div>

        {/* Ingredient and allergen lists wrap as chips like the category exam does: a
            fourteen-option list in full-width rows is most of a phone screen, and this
            exam is forty questions long. Dish-name options stay as rows — they are long,
            and they carry the per-option "why" after the answer. */}
        <div className={compactOptions ? "flex flex-wrap gap-1.5" : "flex flex-col gap-2"}>
          {q.options.map((o) => (
            <button
              key={o.id}
              onClick={() => (q.multi ? toggle(o.id) : (setPicked(new Set([o.id])), grade(new Set([o.id]))))}
              disabled={!!result}
              className={compactOptions
                ? `rounded-lg border px-3 py-2 min-h-[40px] font-bold text-[12px] leading-snug transition-colors ${optClass(o)}`
                : `w-full text-right rounded-xl border px-3.5 py-3 min-h-[44px] font-bold text-[13px] leading-snug transition-colors ${optClass(o)}`}
            >
              {compactOptions ? o.label : (
                <span className="flex items-center justify-between gap-2">
                  <span className="flex-1">{o.label}</span>
                  {result && o.why && (
                    <span className={`text-[10.5px] font-black flex-shrink-0 ${o.correct ? "text-[#22c08c]" : "text-[#8a8aa0]"}`}>{o.why}</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {q.multi && !result && (
          <>
            <button
              onClick={() => grade(picked)}
              disabled={picked.size === 0}
              className={`w-full py-3.5 min-h-[44px] rounded-2xl font-black text-sm ${picked.size ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"}`}
            >
              שליחה
            </button>
            <p className="text-[11px] text-[#8a8aa0] text-center">
              {/* "נבחרו 1" is wrong in Hebrew and the counter sits under every question. */}
              {q.exactSet
                ? `${picked.size === 1 ? "נבחר 1" : `נבחרו ${picked.size}`} — לבחור את כל מה שנמצא במנה`
                : `${picked.size === 1 ? "נבחר 1" : `נבחרו ${picked.size}`} מתוך ${need}`}
            </p>
          </>
        )}

        {result && (
          <div className="space-y-2.5">
            <div className={`rounded-xl p-3 ${result.ok ? "bg-[#15302b] border border-[#22c08c]/40" : "bg-[#3a1d22] border border-[#e0315a]/40"}`}>
              <p className={`text-sm font-black ${result.ok ? "text-[#22c08c]" : "text-[#e0315a]"}`}>
                {result.ok ? "✓ נכון" : "✗ לא נכון"}
              </p>
              {!result.ok && (
                <p className="text-[12px] text-[#eef0f6] mt-1 leading-relaxed">
                  {q.multi
                    ? `התשובה: ${q.options.filter((o) => o.correct).map((o) => o.label).join(" · ")}`
                    : `התשובה הנכונה: ${q.options.find((o) => o.correct)?.label}`}
                </p>
              )}
            </div>
            <button onClick={next} className="w-full py-3.5 min-h-[44px] rounded-2xl font-black text-sm bg-[#6d5efc] text-white">
              {i + 1 >= deck.length ? "לתוצאה" : "לשאלה הבאה"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
