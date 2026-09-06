// ══ קופסאות האזהרה בגב הכרטיסייה — עם הסבר בהקשה (יותם, 6.9) ══
//
// «כשאני נכנס לכרטיסיות בסטודיו אין שם רגישות — זה פשוט נכנס במוקשים. תפריד את זה, ותוסיף
// אופציה שכשלוחצים על אחת מהם זה מראה מה זה אומר (רגישות = משהו שאישה בהריון עדיף שלא תאכל,
// לא סכנת חיים אבל רגישות). בעיקרון הסברים פשוט.»
//   · ההפרדה היא לפי אותה החלטה פר-מסעדה של עמוד התפריט: `features.warnings === "merged"`
//     (סלון: דג נא = מוקש להריון, שתי קבוצות) — אחרת שלוש קבוצות (סטודיו). קודם הגב מיזג תמיד.
//   · הקשה על קופסה פותחת שורת הסבר פשוטה לקבוצה, ומילה על כל פריט שמוכר לנו.
import { useState } from "react";
import { mokshim, pregnancyOnly, pitfallsOnly } from "./shared";

export const GROUP_NOTES = {
  allergens: "אלרגיה יכולה לסכן אורח — לא מאשרים בלי לוודא במטבח.",
  pregnancy: "לא סכנת חיים — משהו שאישה בהריון עדיף שלא תאכל. כדאי להזכיר לאורחת.",
  pitfalls: "לא מסוכן — טעם שהרבה אורחים מבקשים בלעדיו. שווה לשאול לפני.",
  mokshim: "מה שאורחים מבקשים בלעדיו (כוסברה, חריף, שום), ומה שלא מתאים לאורחת בהריון — מסומן 🤰.",
};
// מילה על פריט מוכר — כשאין, מסתפקים בהסבר הקבוצה
export const ITEM_NOTES = {
  "דג נא": "הדג לא עבר בישול",
  "בשר נא": "הבשר לא עבר בישול (או מדיום רייר)",
  "ביצה חיה": "ביצה שלא בושלה — למשל ברוטב או בקצפת",
  "נבטים חיים": "נבטים טריים בלי בישול",
  "גבינה לא מפוסטרת": "גבינה מחלב שלא פוסטר",
  "דגים עתירי כספית": "טונה וכדומה — לא בכמות בהריון",
  "אלכוהול": "מכיל אלכוהול",
  "כוסברה": "יש אורחים שממש לא סובלים את הטעם",
  "חריף": "חריפות שאורחים רבים מבקשים להוריד",
  "שום": "טעם דומיננטי — לשאול לפני",
  "בצל": "הרבה מבקשים בלי",
  "ג'ינג'ר": "חריפות עדינה שלא כולם אוהבים",
  "וסאבי": "חריף מאוד — לשאול לפני",
  "מיונז": "יש אורחים שנמנעים ממנו",
  "גבינה כחולה": "טעם חזק — לא לכולם",
  "לא כשר": "המנה אינה כשרה",
  "בשר וחלב יחד": "בשר וחלב באותה מנה",
  "פירות ים": "רכיכות — לא כשר, ואלרגן",
  "חזיר": "מכיל חזיר",
};
const STYLE = {
  allergens: { bg: "bg-[#3a1d22]", fg: "text-[#e0315a]" },
  pregnancy: { bg: "bg-[#2a1d3a]", fg: "text-[#b48cff]" },
  pitfalls: { bg: "bg-[#3a2f1d]", fg: "text-[#f3c14b]" },
  mokshim: { bg: "bg-[#3a2f1d]", fg: "text-[#f3c14b]" },
};

/** הקבוצות שיש למנה, לפי מדיניות המסעדה (merged ⇒ שתיים, אחרת שלוש). ריקות לא נכללות. */
export function warningGroups(it, merged) {
  const groups = [{ key: "allergens", title: "אלרגיות", items: it?.allergens || [] }];
  if (merged) groups.push({ key: "mokshim", title: "מוקשים", items: mokshim(it) });
  else groups.push(
    { key: "pregnancy", title: "רגישות בהריון", items: pregnancyOnly(it) },
    { key: "pitfalls", title: "מוקשים", items: pitfallsOnly(it) },
  );
  return groups.filter((g) => g.items.length > 0);
}

export default function WarningBoxes({ it, merged = false }) {
  const [open, setOpen] = useState(null);
  const groups = warningGroups(it, merged);
  if (!groups.length) return null;
  return groups.map((g) => {
    const s = STYLE[g.key];
    const isOpen = open === g.key;
    return (
      <button
        key={g.key} type="button" aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : g.key)}
        className={`w-full text-right ${s.bg} p-2 rounded-lg active:scale-[0.99] transition-transform`}
      >
        <p className={`text-xs font-bold ${s.fg}`}>
          {g.title}: {g.items.join(", ")}
          <span className="opacity-60 font-normal"> · {isOpen ? "סגירה" : "מה זה?"}</span>
        </p>
        {isOpen && (
          <div className="mt-1.5 space-y-0.5 border-t border-white/10 pt-1.5">
            <p className="text-[11px] text-[#c4c4d4] leading-snug">{GROUP_NOTES[g.key]}</p>
            {g.items.map((x) => { const k = x.replace(/^🤰\s*/, ""); return ITEM_NOTES[k] ? <p key={x} className="text-[11px] text-[#8a8aa0] leading-snug">{x} — {ITEM_NOTES[k]}</p> : null; })}
          </div>
        )}
      </button>
    );
  });
}
