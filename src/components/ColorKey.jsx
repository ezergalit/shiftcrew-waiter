import { AlertTriangle, Baby, Flame } from "lucide-react";
import { gz } from "../lib/shiftChoice";

// What the colours on a dish mean — shown once a day, before the first practice
// (user, 2026-08-23).
//
// The tags are colour-coded everywhere in the app, and a waiter who doesn't know the
// code reads a red chip and a yellow chip as "two warnings". They are not remotely the
// same thing: red can send a guest to hospital, yellow is a matter of taste. One screen
// a day, five seconds, and the colour carries meaning for the rest of the shift.
const KEY = "menu-app-colorkey";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function needsColorKey(memberId) {
  if (!memberId) return false;
  try { return localStorage.getItem(`${KEY}-${memberId}`) !== today(); } catch { return false; }
}

export function markColorKeySeen(memberId) {
  if (!memberId) return;
  try { localStorage.setItem(`${KEY}-${memberId}`, today()); } catch { /* full or blocked */ }
}

export const COLOR_ROWS = [
  {
    id: "allergens", icon: AlertTriangle, chip: "bg-[#3a1d22] text-[#ff8098]",
    sample: "אגוזים", title: "אדום — אלרגיות",
    body: "הדבר החשוב ביותר בתפריט. אורח עם אלרגיה למה שכתוב באדום עלול להגיע לבית חולים. תמיד לוודא במטבח לפני שמאשרים.",
  },
  {
    id: "pregnancy", icon: Baby, chip: "bg-[#2a2140] text-[#c4b5fd]",
    sample: "דג נא", title: "סגול — רגישות בהריון",
    body: "מנה שלא מתאימה לאורחת בהריון — דג או בשר נא, ביצה חיה, גבינות מסוימות. לא אלרגיה, אבל שווה להזכיר.",
  },
  {
    id: "pitfalls", icon: Flame, chip: "bg-[#33290f] text-[#f3c14b]",
    sample: "חריף", title: "צהוב — מוקשים והעדפות",
    body: "כוסברה, חריף, שום — דברים שאורחים אוהבים לבקש בלעדיהם. לא מסוכן, פשוט טעם.",
  },
];

export default function ColorKey({ onDone }) {
  return (
    <div className="h-full max-w-md mx-auto flex flex-col px-5 py-6 bg-[#0c0d10] text-[#eef0f6] overflow-y-auto" dir="rtl">
      <p className="text-xl font-black mb-1.5">רגע לפני התרגול — הצבעים</p>
      <p className="text-sm text-[#8a8aa0] mb-5 leading-relaxed">
        לכל מנה יש תגיות צבעוניות. הצבע הוא המשמעות:
      </p>

      <div className="space-y-3 flex-1">
        {COLOR_ROWS.map((r) => (
          <div key={r.id} className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2.5">
              <r.icon size={17} className="text-[#8a8aa0] flex-shrink-0" />
              <p className="text-[14px] font-black text-[#eef0f6] flex-1">{r.title}</p>
              <span className={`text-[11px] font-black rounded-md px-2 py-1 ${r.chip}`}>{r.sample}</span>
            </div>
            <p className="text-[12.5px] text-[#a4a4b8] leading-relaxed">{r.body}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onDone}
        className="w-full mt-5 py-3.5 min-h-[52px] rounded-2xl font-black text-sm bg-[#22c08c] text-[#06231a]"
      >
        {gz("הבנתי — אפשר להתחיל")}
      </button>
    </div>
  );
}
