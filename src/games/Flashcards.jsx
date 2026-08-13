import { useState } from "react";
import { Trophy, Star } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { countLabel } from "./shared";


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
      <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white font-bold text-sm mt-1">חזור</button>
    </div>
  );
  const it = items[i];
  const rate = (v) => { onRate(it.id, v); setRevealed(false); setI(i + 1); };
  const RATING_STYLE = { 1: "bg-[#3a1d22] text-[#e0315a]", 2: "bg-[#3a1d22] text-[#e0315a]", 3: "bg-[#33290f] text-[#f3a712]", 4: "bg-[#15302b] text-[#22c08c]", 5: "bg-[#15302b] text-[#22c08c]" };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button>
        {quick && <p className="text-[10px] font-black text-[#22c08c]">5 דקות לפני משמרת</p>}
        <p className="text-xs font-bold">{i + 1}/{items.length}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="bg-[#16181c] rounded-xl p-6 w-full text-center space-y-3">
          <p className="text-2xl font-black text-[#eef0f6] flex items-center justify-center gap-1.5">
            {it.isSpecial && <Star size={18} className="text-[#f3c14b] flex-shrink-0" fill="#f3c14b" />}
            {dishLabel(it)}
          </p>
          {/* The star alone is decoration — a waiter has no way to know what it means or
              why this dish is worth more attention. The sentence is the point. */}
          {it.isSpecial && (
            <p className="text-[11px] font-bold text-[#f3c14b] bg-[#33290f] rounded-lg py-1.5 px-2">
              ⭐ המנהל סימן: זו מנה חשובה ונמכרת — שווה להכיר אותה טוב
            </p>
          )}
          {!revealed && (
            <>
              {(it.ingredients?.length > 0 || it.allergens?.length > 0 || it.pitfalls?.length > 0) && (
                <p className="text-[11px] font-bold text-[#8a8aa0]">
                  {[
                    countLabel(it.ingredients, "מרכיב", "מרכיבים"),
                    countLabel(it.allergens, "אלרגיה", "אלרגיות"),
                    countLabel(it.pitfalls, "מוקש", "מוקשים"),
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              <button onClick={() => setRevealed(true)} className="w-full py-2.5 rounded-lg font-bold bg-[#6d5efc] text-white text-xs">חשוף</button>
            </>
          )}
          {revealed && (
            <>
              {it.desc && <p className="text-xs text-[#c4c4d4]">{it.desc}</p>}
              {it.ingredients?.length > 0 && <p className="text-[11px] text-[#8a8aa0]">מרכיבים: {it.ingredients.join(", ")}</p>}
              {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-[10px] font-bold text-[#e0315a]">אלרגיות: {it.allergens.join(", ")}</p></div>}
              {it.pitfalls?.length > 0 && <div className="bg-[#3a2f1d] p-2 rounded-lg"><p className="text-[10px] font-bold text-[#f3c14b]">מוקשים: {it.pitfalls.join(", ")}</p></div>}
              <div className="pt-1">
                <p className="text-[10px] font-bold text-[#8a8aa0] mb-1.5">כמה טוב ידעתם?</p>
                {/* Says plainly that this is practice, not scoring — otherwise a waiter
                    rates 5s expecting points and quietly gets none. */}
                <p className="text-[9px] text-[#5a5a6e] mb-1.5">הדירוג העצמי קובע מה תחזרו עליו — נקודות נצברות במשחקים ובמבחנים</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} onClick={() => rate(v)} className={`py-2.5 rounded-lg font-black text-sm ${RATING_STYLE[v]}`}>{v}</button>
                  ))}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[9px] text-[#8a8aa0]">לא ידעתי</span>
                  <span className="text-[9px] text-[#8a8aa0]">ידעתי מצוין</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
