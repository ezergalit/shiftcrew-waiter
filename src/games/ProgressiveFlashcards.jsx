import { useRef, useState } from "react";
import { GraduationCap, Coffee } from "lucide-react";
import { Star } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { countLabel, nLabel, mokshim} from "./shared";
import { categoryVisual } from "../lib/categoryVisual";
import { pickNext, isUnderstood } from "../lib/progressiveSession";
import { nextConsecutiveFives } from "../lib/studySession";
import { gz } from "../lib/shiftChoice";

// The continuous flashcard session behind the menu tab's drill-down (2026-08-19).
// Visually it IS Flashcards — same card, same flip, same 1-5 rating — but rating a card
// doesn't advance an index into a fixed deck: progressiveSession picks the next dish, so
// tapping one specific dish flows straight into practicing its neighbours until they are
// understood (two consecutive 5s), walking the menu in order.
// Every CHECKPOINT_EVERY ratings the session pauses and asks (user request, 2026-08-20):
// "another round or a break?" — and once the whole scope is understood, "done — sit the
// exam?" instead. Declining the exam buys ten more refresh cards, then it asks again.
const CHECKPOINT_EVERY = 10;

export default function ProgressiveFlashcards({ items, label, firstId, initialProgress, onRate, onDone, onExam, examReady, slim = false }) {
  // Live local copy of the progress map: the parent's state update is async, and the very
  // next pick must already see the rating that was just given.
  const progRef = useRef({ ...(initialProgress || {}) });
  const [current, setCurrent] = useState(() => {
    const first = firstId ? (items || []).find((i) => i.id === firstId) : null;
    return first || pickNext(items, progRef.current).item;
  });
  const [revealed, setRevealed] = useState(false);
  const [zoom, setZoom] = useState(null); // full-screen dish photo, or null
  const [toast, setToast] = useState(null);
  const [sinceBreak, setSinceBreak] = useState(0);
  const [checkpoint, setCheckpoint] = useState(null); // null | "break" | "exam"

  if (!items?.length || !current) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <p>אין פריטים</p>
        <button onClick={onDone} className="px-4 py-3 rounded-lg bg-[#6d5efc] text-white font-bold text-sm min-h-[44px]">חזור</button>
      </div>
    );
  }

  const it = current;
  const fives = progRef.current[it.id]?.consecutiveFives || 0;
  const understoodCount = items.filter((x) => isUnderstood(progRef.current[x.id]?.consecutiveFives)).length;

  const rate = (v) => {
    onRate(it.id, v);
    const prev = progRef.current[it.id] || {};
    const nextFives = nextConsecutiveFives(prev.consecutiveFives, v);
    progRef.current[it.id] = { mastery: v, consecutiveFives: nextFives };
    const justUnderstood = isUnderstood(nextFives) && !isUnderstood(prev.consecutiveFives);
    const nx = pickNext(items, progRef.current, it.id);
    setToast(
      justUnderstood ? { cls: "bg-[#15302b] text-[#22c08c]", txt: `✓ הכרת את ${dishLabel(it)}! מנה חדשה נכנסת לסבב` }
        : v <= 2 ? { cls: "bg-[#33290f] text-[#f3a712]", txt: "נחזור על המנה הזו שוב בקרוב" }
        : null
    );
    setRevealed(false);
    setCurrent(nx.item);
    // Checkpoint protocol: finishing the whole scope asks about the exam right away;
    // otherwise every CHECKPOINT_EVERY cards the session offers a round/break choice.
    const allDone = items.every((x) => isUnderstood(progRef.current[x.id]?.consecutiveFives));
    const n = sinceBreak + 1;
    if (allDone && (justUnderstood || n >= CHECKPOINT_EVERY)) {
      setSinceBreak(0);
      setCheckpoint("exam");
    } else if (n >= CHECKPOINT_EVERY) {
      setSinceBreak(0);
      setCheckpoint("break");
    } else {
      setSinceBreak(n);
    }
  };

  const RATING_STYLE = { 1: "bg-[#3a1d22] text-[#e0315a]", 2: "bg-[#3a1d22] text-[#e0315a]", 3: "bg-[#33290f] text-[#f3a712]", 4: "bg-[#15302b] text-[#22c08c]", 5: "bg-[#15302b] text-[#22c08c]" };

  const starBadge = it.isSpecial && (
    <p className="text-xs font-bold text-[#f3c14b] bg-[#33290f] rounded-lg py-1.5 px-2">
      ⭐ המנהל סימן: זו מנה חשובה ונמכרת — שווה להכיר אותה טוב
    </p>
  );

  if (checkpoint === "exam") return (
    <div className="h-screen max-w-md mx-auto flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="w-20 h-20 rounded-3xl bg-[#15302b] flex items-center justify-center">
        <GraduationCap size={38} className="text-[#22c08c]" />
      </div>
      <p className="text-xl font-black">סיימת ללמוד {label}! 🎉</p>
      <p className="text-sm text-[#8a8aa0] leading-relaxed">הכרת את כל המנות — שני 5 ברצף על כל אחת. רוצה לגשת לבוחן?</p>
      {onExam ? (
        <button onClick={onExam} className="w-full py-3.5 min-h-[48px] rounded-2xl bg-[#22c08c] text-white text-sm font-black active:scale-[0.99] transition-transform">
          כן — לבוחן {label}
        </button>
      ) : (
        <button onClick={onDone} className="w-full py-3.5 min-h-[48px] rounded-2xl bg-[#22c08c] text-white text-sm font-black">סיום</button>
      )}
      <button onClick={() => setCheckpoint(null)} className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22252b] text-[#eef0f6] text-xs font-black">
        לא עכשיו — עוד {CHECKPOINT_EVERY} כרטיסיות חזרה
      </button>
      <button onClick={onDone} className="text-xs text-[#8a8aa0] font-bold py-2">הפסקה — חזרה לתפריט</button>
    </div>
  );

  if (checkpoint === "break") return (
    <div className="h-screen max-w-md mx-auto flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="w-20 h-20 rounded-3xl bg-[#1e1b33] flex items-center justify-center">
        <Coffee size={34} className="text-[#a79bff]" />
      </div>
      <p className="text-xl font-black">עברת {CHECKPOINT_EVERY} כרטיסיות 💪</p>
      <p className="text-sm text-[#8a8aa0]">הכרת {understoodCount} מתוך {nLabel(items.length, "מנה", "מנות")} ב{label}. ממשיכים?</p>
      {/* Enough of the category is known to sit the quiz — offer it here rather than
          making the waiter leave, find the category row and press it there (user,
          2026-08-23). Still only an offer: practising more is a fine answer. */}
      {examReady && onExam && (
        <button onClick={onExam} className="w-full py-3.5 min-h-[48px] rounded-2xl bg-[#22c08c] text-[#06231a] text-sm font-black active:scale-[0.99] transition-transform">
          יש לך מספיק ידע — לבוחן {label}
        </button>
      )}
      <button onClick={() => setCheckpoint(null)} className={`w-full py-3.5 min-h-[48px] rounded-2xl text-sm font-black active:scale-[0.99] transition-transform ${examReady && onExam ? "bg-[#22252b] text-[#eef0f6]" : "bg-[#6d5efc] text-white"}`}>
        עוד סיבוב
      </button>
      <button onClick={onDone} className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22252b] text-[#eef0f6] text-xs font-black">
        הפסקה — נמשיך אחר כך
      </button>
    </div>
  );

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">← חזרה</button>
        <p className="text-[11px] font-black text-[#22c08c]">תרגול {label}</p>
        <p className="text-xs font-bold">מכירים {understoodCount}/{items.length}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-2.5">
        {toast && (
          <p className={`w-full text-center text-[11px] font-black rounded-lg py-2 px-3 ${toast.cls}`}>{toast.txt}</p>
        )}
        {/* Keyed by dish id like Flashcards: advancing remounts un-flipped, no reverse-flip. */}
        <div className="flip-scene w-full" key={it.id}>
          <div className={`flip-card ${revealed ? "flipped" : ""}`}>

            {/* front — the whole face is the tap target */}
            <button
              onClick={() => setRevealed(true)}
              className="flip-face bg-[#16181c] border border-[#22252b] rounded-2xl p-6 w-full text-center space-y-3 min-h-[260px] flex flex-col items-center justify-center active:scale-[0.99] transition-transform"
            >
              {(() => { const vis = categoryVisual(it.category); return (
                <span
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
                  style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
                  aria-hidden
                >
                  {vis.emoji}
                </span>
              ); })()}
              <p className="text-2xl font-black text-[#eef0f6] flex items-center justify-center gap-1.5">
                {it.isSpecial && <Star size={18} className="text-[#f3c14b] flex-shrink-0" fill="#f3c14b" />}
                {dishLabel(it)}
              </p>
              {starBadge}
              {(it.ingredients?.length > 0 || it.allergens?.length > 0 || mokshim(it).length > 0 || it.pregnancy?.length > 0 || it.pitfalls?.length > 0) && (
                <p className="text-xs font-bold text-[#8a8aa0]">
                  {[
                    countLabel(it.ingredients, "מרכיב", "מרכיבים"),
                    countLabel(it.allergens, "אלרגיה", "אלרגיות"),
                    ...(slim ? [countLabel(mokshim(it), "מוקש", "מוקשים")]
                             : [countLabel(it.pregnancy, "רגישות בהריון", "רגישויות בהריון"), countLabel(it.pitfalls, "מוקש", "מוקשים")]),
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              <span className="text-xs font-bold text-[#6d5efc] mt-1">{gz("הקש/י להפוך את הכרטיס")}</span>
            </button>

            {/* back */}
            <div className="flip-face flip-back bg-[#16181c] border border-[#6d5efc]/40 rounded-2xl p-5 w-full text-center space-y-2.5 min-h-[260px] flex flex-col justify-center">
              <div className="flex items-center gap-2.5 w-full text-right">
                {/* 52px is enough to recognise the plate, not to study it — tapping it
                    opens the photo full screen (user, 2026-08-28). */}
                {slim && it.imageUrl && (
                  <button type="button" onClick={() => setZoom(it.imageUrl)} title="הגדלת התמונה"
                    className="flex-shrink-0 rounded-xl active:scale-95 transition-transform">
                    <img src={it.imageUrl} alt="" loading="lazy"
                      className="w-[52px] h-[52px] rounded-xl object-cover border border-[#22252b]" />
                  </button>
                )}
                <span className="flex-1 min-w-0 text-lg font-black text-[#eef0f6] leading-tight">{dishLabel(it)}</span>
              </div>
              {/* Slim back — three things only: ingredients, allergies, mokshim (user,
                  2026-08-27). Scoped to the skinned restaurant so every other restaurant
                  keeps the card it already had. Knowledge cards keep their text: it IS
                  their content. Empty sections simply don't render. */}
              {slim ? <>
                {it.knowledge && it.desc && <p className="text-sm text-[#c4c4d4] leading-relaxed text-right">{it.desc}</p>}
                {it.ingredients?.length > 0 && (
                  <div className="bg-[#1c1f25] p-2 rounded-lg"><p className="text-xs font-bold text-[#c4c4d4]">{it.knowledge ? "נקודות מפתח" : "מרכיבים"}: {it.ingredients.join(", ")}</p></div>
                )}
                {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-xs font-bold text-[#e0315a]">אלרגיות: {it.allergens.join(", ")}</p></div>}
                {mokshim(it).length > 0 && <div className="bg-[#3a2f1d] p-2 rounded-lg"><p className="text-xs font-bold text-[#f3c14b]">מוקשים: {mokshim(it).join(", ")}</p></div>}
              </> : <>
                {it.desc && <p className="text-sm text-[#c4c4d4] leading-relaxed">{it.desc}</p>}
                {it.ingredients?.length > 0 && <p className="text-xs text-[#8a8aa0]">מרכיבים: {it.ingredients.join(", ")}</p>}
                {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-xs font-bold text-[#e0315a]">אלרגיות: {it.allergens.join(", ")}</p></div>}
                {it.pregnancy?.length > 0 && <div className="bg-[#2a1d3a] p-2 rounded-lg"><p className="text-xs font-bold text-[#b48cff]">רגישות בהריון: {it.pregnancy.join(", ")}</p></div>}
                {it.pitfalls?.length > 0 && <div className="bg-[#3a2f1d] p-2 rounded-lg"><p className="text-xs font-bold text-[#f3c14b]">מוקשים: {it.pitfalls.join(", ")}</p></div>}
              </>}
              <div className="pt-1">
                <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">כמה טוב ידעת?</p>
                <p className="text-[11px] text-[#5a5a6e] mb-1.5">הדירוג העצמי קובע מה חוזרים עליו — נקודות נצברות רק בבחנים ובמבחן</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} onClick={() => rate(v)} className={`py-3 min-h-[44px] rounded-lg font-black text-base ${RATING_STYLE[v]}`}>{v}</button>
                  ))}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[11px] text-[#8a8aa0]">לא ידעתי</span>
                  <span className="text-[11px] text-[#8a8aa0]">ידעתי מצוין</span>
                </div>
              </div>
            </div>

          </div>
        </div>
        {/* Two dots: how close THIS dish is to "understood" (two consecutive 5s). */}
        <p className="flex items-center gap-1.5 text-[10.5px] text-[#8a8aa0]">
          <span className={`w-2 h-2 rounded-full inline-block ${fives >= 1 ? "bg-[#22c08c]" : "bg-[#22252b]"}`} />
          <span className={`w-2 h-2 rounded-full inline-block ${fives >= 2 ? "bg-[#22c08c]" : "bg-[#22252b]"}`} />
          שני 5 ברצף = המנה מוכרת לך והיא פורשת מהסבב
        </p>
      </div>
      {/* Full-screen dish photo. Tap anywhere to dismiss — the same overlay the menu
          tab uses. `fixed`, so it sits fine as the last child of the root. */}
      {zoom && (
        <button
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3"
          aria-label="סגירת התמונה"
        >
          <img src={zoom} alt="" className="max-w-[78%] max-h-[52vh] rounded-2xl object-contain shadow-2xl" />
        </button>
      )}
    </div>
  );
}
