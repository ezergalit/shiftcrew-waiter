import { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import { shortCat } from "./shared";
import { categoryVisual } from "../lib/categoryVisual";

// Group flashcards for thin categories (user request, 2026-08-20). A per-item card is
// useless there — "קולה" on the front flips to "קולה" on the back. The unit of knowledge
// is the carry list itself, so the card front is a GROUP ("משקאות מוגזים") and the back
// is the answer: every drink in it, with its price (prices matter here — it's the one
// fact the waiter is asked at the table; the games-wide "no prices" rule was about dish
// knowledge, not carry lists).
//
// Grouping is presentational keyword clustering, not safety data — a drink that matches
// nothing lands in "עוד", never dropped. Order matters: "תה קר" must resolve cold
// before the hot-drinks rule sees "תה".
const GROUPS = [
  { key: "hot", title: "שתייה חמה", test: (n) => !/קר/.test(n) && /קפה|אספרסו|הפוך|מקיאטו|אמריקנו|קורטדו|תה|שוקו/.test(n) },
  { key: "fizzy", title: "שתייה קלה מוגזת", test: (n) => /קולה|ספרייט|סודה|טוניק|ג'ינג'ר ביר|פלגרינו|מוגז/.test(n) },
  { key: "still", title: "שתייה קרה לא מוגזת", test: (n) => /מים|מיץ|לימונדה|תה קר|אקווה|ענבים|תפוזים|תפוחים/.test(n) },
];

const price = (it) => (Number(it.price) > 0 ? `${Number(it.price)} ₪` : null);

export default function GroupFlashcards({ items, onRate, onDone }) {
  const catName = items?.[0]?.category || "";
  const groups = useMemo(() => {
    const used = new Set();
    const out = [];
    for (const g of GROUPS) {
      const members = (items || []).filter((it) => !used.has(it.id) && g.test(it.name));
      if (members.length >= 2) {
        members.forEach((m) => used.add(m.id));
        out.push({ ...g, members });
      }
    }
    const rest = (items || []).filter((it) => !used.has(it.id));
    if (rest.length) out.push({ key: "rest", title: out.length ? "עוד בקטגוריה" : shortCat(catName), members: rest });
    return out;
  }, [items, catName]);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!groups.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl"><p>אין פריטים</p></div>;
  if (i >= groups.length) return (
    <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <Trophy size={40} className="text-[#f3c14b]" />
      <p className="font-black text-lg">עברתם על כל {shortCat(catName)}!</p>
      <button onClick={onDone} className="px-4 py-3 min-h-[44px] rounded-lg bg-[#6d5efc] text-white font-bold text-sm">חזור</button>
    </div>
  );
  const g = groups[i];
  const vis = categoryVisual(catName);
  // One rating covers the whole group — the card IS the group. It feeds the same
  // self-report path as regular flashcards (objective: false upstream).
  const rate = (v) => { g.members.forEach((m) => onRate(m.id, v)); setRevealed(false); setI(i + 1); };
  const RATING_STYLE = { 1: "bg-[#3a1d22] text-[#e0315a]", 2: "bg-[#3a1d22] text-[#e0315a]", 3: "bg-[#33290f] text-[#f3a712]", 4: "bg-[#15302b] text-[#22c08c]", 5: "bg-[#15302b] text-[#22c08c]" };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">← חזרה</button>
        <p className="text-[11px] font-black text-[#22c08c]">{shortCat(catName)}</p>
        <p className="text-xs font-bold">{i + 1}/{groups.length}</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 overflow-y-auto">
        <div className="flip-scene w-full" key={g.key}>
          <div className={`flip-card ${revealed ? "flipped" : ""}`}>

            {/* front — the group is the question: what do we carry here? */}
            <button
              onClick={() => setRevealed(true)}
              className="flip-face bg-[#16181c] border border-[#22252b] rounded-2xl p-6 w-full text-center space-y-3 min-h-[240px] flex flex-col items-center justify-center active:scale-[0.99] transition-transform"
            >
              <span className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
                style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }} aria-hidden>
                {vis.emoji}
              </span>
              <p className="text-2xl font-black text-[#eef0f6]">{g.title}</p>
              <p className="text-xs font-bold text-[#8a8aa0]">מה אנחנו מגישים כאן, ובאיזה מחיר?</p>
              <span className="text-xs font-bold text-[#6d5efc] mt-1">הקישו להפוך את הכרטיס ↻</span>
            </button>

            {/* back — the carry list with prices: this is the answer being memorised */}
            <div className="flip-face flip-back bg-[#16181c] border border-[#6d5efc]/40 rounded-2xl p-5 w-full text-center space-y-2.5 min-h-[240px] flex flex-col justify-center">
              <p className="text-base font-black text-[#eef0f6]">{g.title}</p>
              <div className="space-y-1 text-right">
                {g.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 bg-[#0c0d10] rounded-lg px-2.5 py-1.5">
                    <span className="text-xs font-bold text-[#eef0f6] flex-1 leading-snug">{m.name}</span>
                    {price(m) && <span className="text-xs font-black text-[#22c08c] flex-shrink-0">{price(m)}</span>}
                  </div>
                ))}
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold text-[#8a8aa0] mb-1.5">כמה טוב הכרתם את הרשימה?</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} onClick={() => rate(v)} className={`py-3 min-h-[44px] rounded-lg font-black text-base ${RATING_STYLE[v]}`}>{v}</button>
                  ))}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[11px] text-[#8a8aa0]">לא הכרתי</span>
                  <span className="text-[11px] text-[#8a8aa0]">הכרתי מצוין</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
