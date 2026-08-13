import { AlertTriangle } from "lucide-react";
import { shortCat } from "./shared";


// The one genuinely subjective mode — there's nothing to objectively check when you're
// just looking at a card, so the player self-rates 1-5 after reveal. Every other mode
// grades itself instead (see learnItem in MainApp).
// Shown when a mode cannot build a fair round from the current pool. With practice scoped
// to opened categories, that is usually because the scope is still narrow — so name the
// scope and point at the way out rather than leaving a dead end.
export default function NotEnoughData({ what, openKeys, onDone }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-3 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <AlertTriangle size={34} className="text-[#f3c14b]" />
      <p className="text-sm font-black">אין מספיק מידע כדי לבנות {what}</p>
      {openKeys?.length > 0 && (
        <p className="text-xs text-[#8a8aa0] leading-relaxed">
          התרגול כרגע כולל רק {openKeys.map(shortCat).join(" · ")}.
          <br />עברו מבחן בקטגוריה נוספת כדי להרחיב את התרגול.
        </p>
      )}
      <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold mt-1">חזרה</button>
    </div>
  );
}
