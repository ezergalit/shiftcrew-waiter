import { useState } from "react";
import { Trophy, Star } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { countLabel } from "./shared";

// A real card that flips (2026-08-13). The reveal used to swap content in place, which
// read as a page change, not a card. rotateX (vertical) rather than rotateY: a horizontal
// flip "opens backwards" for RTL readers.
//
// The card is keyed by dish id: advancing remounts it un-flipped, so the next card never
// plays a reverse-flip animation on its way in.
export default function Flashcards({ items, session, quick, onRate, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!items?.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (i >= items.length) return (
    <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-3 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <Trophy size={40} className="text-[#f3c14b]" />
      <p className="font-black text-lg">סיימתם את הסבב!</p>
      {/* The session is a slice, so say what is left — otherwise "done" reads as "done
          with the whole category", which it usually is not. */}
      {session?.retiredCount > 0 && (
        <p className="text-xs text-[#22c08c] font-bold">
          {countLabel([...Array(session.retiredCount)], "מנה שאתם כבר שולטים בה", "מנות שאתם כבר שולטים בהן")} — דילגנו עליהן
        </p>
      )}
      {session?.poolCount > items.length && (
        <p className="text-xs text-[#8a8aa0]">
          נשארו עוד {session.poolCount - new Set(items.map((x) => x.id)).size} מנות בקטגוריה — סבב נוסף?
        </p>
      )}
      {session?.allRetired && (
        <p className="text-xs text-[#8a8aa0]">שולטים בכל הקטגוריה — זה היה רענון</p>
      )}
      <button onClick={onDone} className="px-4 py-3 rounded-lg bg-[#6d5efc] text-white font-bold text-sm mt-1 min-h-[44px]">חזור</button>
    </div>
  );
  const it = items[i];
  const rate = (v) => { onRate(it.id, v); setRevealed(false); setI(i + 1); };
  const RATING_STYLE = { 1: "bg-[#3a1d22] text-[#e0315a]", 2: "bg-[#3a1d22] text-[#e0315a]", 3: "bg-[#33290f] text-[#f3a712]", 4: "bg-[#15302b] text-[#22c08c]", 5: "bg-[#15302b] text-[#22c08c]" };

  const starBadge = it.isSpecial && (
    <p className="text-xs font-bold text-[#f3c14b] bg-[#33290f] rounded-lg py-1.5 px-2">
      ⭐ המנהל סימן: זו מנה חשובה ונמכרת — שווה להכיר אותה טוב
    </p>
  );

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">← חזרה</button>
        {quick && <p className="text-[11px] font-black text-[#22c08c]">5 דקות לפני משמרת</p>}
        <p className="text-xs font-bold">{i + 1}/{items.length}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flip-scene w-full" key={it.id}>
          <div className={`flip-card ${revealed ? "flipped" : ""}`}>

            {/* front — the whole face is the tap target */}
            <button
              onClick={() => setRevealed(true)}
              className="flip-face bg-[#16181c] border border-[#22252b] rounded-2xl p-6 w-full text-center space-y-3 min-h-[260px] flex flex-col items-center justify-center active:scale-[0.99] transition-transform"
            >
              <p className="text-2xl font-black text-[#eef0f6] flex items-center justify-center gap-1.5">
                {it.isSpecial && <Star size={18} className="text-[#f3c14b] flex-shrink-0" fill="#f3c14b" />}
                {dishLabel(it)}
              </p>
              {starBadge}
              {(it.ingredients?.length > 0 || it.allergens?.length > 0 || it.pitfalls?.length > 0) && (
                <p className="text-xs font-bold text-[#8a8aa0]">
                  {[
                    countLabel(it.ingredients, "מרכיב", "מרכיבים"),
                    countLabel(it.allergens, "אלרגיה", "אלרגיות"),
                    countLabel(it.pitfalls, "מוקש", "מוקשים"),
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              <span className="text-xs font-bold text-[#6d5efc] mt-1">הקישו להפוך את הכרטיס ↻</span>
            </button>

            {/* back */}
            <div className="flip-face flip-back bg-[#16181c] border border-[#6d5efc]/40 rounded-2xl p-5 w-full text-center space-y-2.5 min-h-[260px] flex flex-col justify-center">
              <p className="text-lg font-black text-[#eef0f6]">{dishLabel(it)}</p>
              {it.desc && <p className="text-sm text-[#c4c4d4] leading-relaxed">{it.desc}</p>}
              {it.ingredients?.length > 0 && <p className="text-xs text-[#8a8aa0]">מרכיבים: {it.ingredients.join(", ")}</p>}
              {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-xs font-bold text-[#e0315a]">אלרגיות: {it.allergens.join(", ")}</p></div>}
              {it.pitfalls?.length > 0 && <div className="bg-[#3a2f1d] p-2 rounded-lg"><p className="text-xs font-bold text-[#f3c14b]">מוקשים: {it.pitfalls.join(", ")}</p></div>}
              <div className="pt-1">
                <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">כמה טוב ידעתם?</p>
                {/* Says plainly that this is practice, not scoring — otherwise a waiter
                    rates 5s expecting points and quietly gets none. */}
                <p className="text-[11px] text-[#5a5a6e] mb-1.5">הדירוג העצמי קובע מה תחזרו עליו — נקודות נצברות במשחקים ובמבחנים</p>
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
      </div>
    </div>
  );
}
