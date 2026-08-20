import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { categoryVisual } from "../lib/categoryVisual";
import { shortCat } from "../games/shared";

// The menu, as a menu (user, 2026-08-20). Not progress, not exams — the thing a waiter
// opens mid-shift to check what is actually in a dish. Three levels, the same shape the
// restaurant's own menu has: menu → category → dishes with their descriptions.
//
// Deliberately read-only: nothing here scores the waiter or changes their progress.
// Practice and exams live in their own tab, so looking something up during service never
// costs anything.
export default function MenuBrowser({ cards }) {
  const [menu, setMenu] = useState(null);
  const [cat, setCat] = useState(null);

  const groups = [...new Set((cards || []).map((c) => c.menuGroup).filter(Boolean))];
  const firstPos = (g) => Math.min(...(cards || []).filter((c) => c.menuGroup === g).map((c) => c.menuPosition ?? 1e9));
  const menus = groups.sort((a, b) => firstPos(a) - firstPos(b));
  // A menu with no groups set behaves as one bucket, exactly as it did before the column.
  const flat = menus.length <= 1;

  const inMenu = (c) => (flat ? true : c.menuGroup === menu);
  const catsOf = (m) => {
    const pool = (cards || []).filter((c) => (flat ? true : c.menuGroup === m));
    return [...new Set(pool.map((c) => c.category).filter(Boolean))];
  };

  const Crumb = ({ over, title, onBack }) => (
    <div className="flex items-center gap-2.5 mb-1">
      <button
        onClick={onBack}
        title="חזרה"
        className="w-10 h-10 rounded-xl bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-shrink-0 active:scale-95 transition-transform"
      >
        <ChevronRight size={19} />
      </button>
      <div className="min-w-0">
        {over && <p className="text-[10px] font-bold text-[#5a5a6e]">{over}</p>}
        <p className="text-sm font-black text-[#eef0f6] line-clamp-1">{title}</p>
      </div>
    </div>
  );

  // ---- level 3: the dishes themselves ----
  if (cat) {
    const dishes = (cards || [])
      .filter((c) => c.category === cat && inMenu(c))
      .sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0));
    return (
      <div className="space-y-2">
        <Crumb over={flat ? null : menu} title={`${categoryVisual(cat).emoji} ${shortCat(cat)}`} onBack={() => setCat(null)} />
        <div className="bg-[#16181c] border border-[#22252b] rounded-2xl px-3.5 divide-y divide-[#1e2128]">
          {dishes.map((d) => (
            <div key={d.id} className="py-3">
              <div className="flex items-baseline gap-2.5">
                <p className="flex-1 text-[13.5px] font-black text-[#eef0f6] leading-snug">{d.name}</p>
                {Number(d.price) > 0 && (
                  <p className="text-[13px] font-black text-[#22c08c] tabular-nums flex-shrink-0">{Number(d.price)} ₪</p>
                )}
              </div>
              {d.desc && <p className="text-[11.5px] text-[#8a8aa0] leading-relaxed mt-1">{d.desc}</p>}
              {(d.allergens?.length > 0 || d.pregnancy?.length > 0 || d.pitfalls?.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {d.allergens?.map((t) => (
                    <span key={`a${t}`} className="text-[9.5px] font-black px-1.5 py-0.5 rounded-md bg-[#3a1d22] text-[#ff8098]">{t}</span>
                  ))}
                  {d.pregnancy?.map((t) => (
                    <span key={`g${t}`} className="text-[9.5px] font-black px-1.5 py-0.5 rounded-md bg-[#2a2140] text-[#c4b5fd]">{t}</span>
                  ))}
                  {d.pitfalls?.map((t) => (
                    <span key={`p${t}`} className="text-[9.5px] font-black px-1.5 py-0.5 rounded-md bg-[#33290f] text-[#f3c14b]">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- level 2: categories inside a menu ----
  if (menu || flat) {
    const list = catsOf(menu);
    return (
      <div className="space-y-2">
        {!flat && <Crumb over="התפריטים" title={menu} onBack={() => setMenu(null)} />}
        {list.map((c) => {
          const vis = categoryVisual(c);
          const n = (cards || []).filter((x) => x.category === c && inMenu(x)).length;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
                aria-hidden
              >
                {vis.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-black text-[#eef0f6] line-clamp-1">{shortCat(c)}</span>
                <span className="block text-[11px] text-[#8a8aa0] mt-0.5">{n} מנות</span>
              </span>
              <ChevronRight size={17} className="text-[#5a5a6e] flex-shrink-0 rotate-180" />
            </button>
          );
        })}
      </div>
    );
  }

  // ---- level 1: the restaurant's menus ----
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">התפריט של המסעדה — בחרו תפריט כדי לעיין בו.</p>
      {menus.map((m) => {
        const inG = (cards || []).filter((c) => c.menuGroup === m);
        const catCount = new Set(inG.map((c) => c.category)).size;
        return (
          <button
            key={m}
            onClick={() => setMenu(m)}
            className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-black text-[#eef0f6]">{m}</span>
              <span className="block text-[11px] text-[#8a8aa0] mt-1">{catCount} קטגוריות · {inG.length} פריטים</span>
            </span>
            <ChevronRight size={18} className="text-[#5a5a6e] flex-shrink-0 rotate-180" />
          </button>
        );
      })}
    </div>
  );
}
