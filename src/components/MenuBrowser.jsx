import { useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { categoryVisual } from "../lib/categoryVisual";
import { shortCat, nLabel } from "../games/shared";

// The menu, as a menu (user, 2026-08-20). Not progress, not exams — the thing a waiter
// opens mid-shift to check what is actually in a dish. Three levels, the same shape the
// restaurant's own menu has: menu → category → dishes.
//
// Two things make it learnable rather than a wall of text (user, 2026-08-20):
//   • Each dish is its own card with air around it, so the eye lands on one dish at a
//     time instead of scanning a paragraph.
//   • Tapping a dish opens it FULL SCREEN, with arrows to walk to the next one. Reading
//     a dish properly and moving through a category is the actual study loop here, and
//     it shouldn't cost a trip back to the list.
//
// Read-only by design: nothing here scores the waiter, so looking something up during
// service never affects their progress.
// The three warning groups, each with a sentence saying what it actually means. The
// colours match the chips everywhere else in the app (see ColorKey.jsx).
const FLAG_GROUPS = [
  { key: "allergens", title: "אלרגיות", cls: "bg-[#3a1d22] text-[#ff8098]",
    note: "מרכיב שעלול לסכן אורח עם אלרגיה — תמיד לוודא במטבח לפני שמאשרים." },
  { key: "pregnancy", title: "רגישות בהריון", cls: "bg-[#2a2140] text-[#c4b5fd]",
    note: "לא אלרגיה, אבל לא מתאים לאורחת בהריון — כדאי להזכיר." },
  { key: "pitfalls", title: "מוקשים והעדפות", cls: "bg-[#33290f] text-[#f3c14b]",
    note: "לא מסוכן — פשוט טעם שאורחים רבים מבקשים בלעדיו (כוסברה, חריף, שום)." },
];

export default function MenuBrowser({ cards, onPractice }) {
  const [menu, setMenu] = useState(null);
  const [cat, setCat] = useState(null);
  const [idx, setIdx] = useState(null);
  const [zoom, setZoom] = useState(null); // full-screen photo overlay   // index into the open category, or null

  const groups = [...new Set((cards || []).map((c) => c.menuGroup).filter(Boolean))];
  const firstPos = (g) => Math.min(...(cards || []).filter((c) => c.menuGroup === g).map((c) => c.menuPosition ?? 1e9));
  const menus = groups.sort((a, b) => firstPos(a) - firstPos(b));
  const flat = menus.length <= 1;
  const inMenu = (c) => (flat ? true : c.menuGroup === menu);

  const dishes = cat
    ? (cards || []).filter((c) => c.category === cat && inMenu(c))
        .sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0))
    : [];

  // Categories of the open menu, in menu order — this is what makes "the next category"
  // a real thing and lets the reader walk the whole menu without returning to a list.
  const catList = [...new Set((cards || []).filter(inMenu)
    .slice()
    .sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0))
    .map((c) => c.category).filter(Boolean))];
  const nextCat = cat ? catList[catList.indexOf(cat) + 1] || null : null;

  // Arrow keys walk the category on a desktop the same way the on-screen arrows do.
  useEffect(() => {
    if (idx === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setIdx(null);
      if (e.key === "ArrowLeft") setIdx((i) => Math.min(i + 1, dishes.length));
      if (e.key === "ArrowRight") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, dishes.length]);

  const Choice = ({ n, onClick, primary, children }) => (
    <button
      onClick={onClick}
      className={`w-full py-3.5 min-h-[52px] rounded-xl font-black text-[15px] flex items-center gap-3 px-4 text-right active:scale-[0.99] transition-transform ${
        primary ? "text-white" : "bg-[#20232b] text-[#eef0f6]"
      }`}
      style={primary ? { background: "linear-gradient(135deg,#22c08c,#17805d)" } : undefined}
    >
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-black flex-shrink-0 tabular-nums ${
          primary ? "bg-white/25 text-white" : "bg-[#2c303a] text-[#8a8aa0]"
        }`}
      >
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );

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

  const Tags = ({ d, size = "sm" }) => {
    const cls = size === "lg" ? "text-[13px] px-3 py-1.5" : "text-[11px] px-2 py-1";
    if (!(d.allergens?.length || d.pregnancy?.length || d.pitfalls?.length)) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {d.allergens?.map((t) => (
          <span key={`a${t}`} className={`${cls} font-black rounded-md bg-[#3a1d22] text-[#ff8098]`}>{t}</span>
        ))}
        {d.pregnancy?.map((t) => (
          <span key={`g${t}`} className={`${cls} font-black rounded-md bg-[#2a2140] text-[#c4b5fd]`}>{t}</span>
        ))}
        {d.pitfalls?.map((t) => (
          <span key={`p${t}`} className={`${cls} font-black rounded-md bg-[#33290f] text-[#f3c14b]`}>{t}</span>
        ))}
      </div>
    );
  };

  // ---- end of a category: loop back, or walk on to the next one ----
  // Reaching the last dish used to be a dead end (a disabled arrow). Finishing a category
  // is the moment a waiter decides what to do next, so it gets a screen: read it again
  // from the top, or continue into the next category — which chains through the whole
  // menu without ever returning to a list.
  if (idx !== null && cat && idx >= dishes.length) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0c0d10] flex justify-center" dir="rtl">
        <div className="w-full max-w-md h-full flex flex-col border-x border-[#1a1d23]">
          <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between flex-shrink-0">
            <button onClick={() => setIdx(null)} className="text-[#8a8aa0] flex items-center gap-1 text-xs font-bold" aria-label="סגירה">
              <X size={16} /> סגירה
            </button>
            <p className="text-[11px] font-black text-[#8a8aa0]">{shortCat(cat)} · הושלם</p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col items-center justify-center text-center gap-5">
            <span className="w-20 h-20 rounded-full bg-[#15302b] border border-[#22c08c]/40 flex items-center justify-center text-4xl">✓</span>
            <div className="space-y-2">
              <h2 className="text-[24px] font-black text-[#eef0f6] leading-tight">עברת על כל {shortCat(cat)}</h2>
              <p className="text-[14px] text-[#8a8aa0] leading-relaxed">
                {nLabel(dishes.length, "מנה", "מנות")}. לחזור עליהן שוב מההתחלה, או להמשיך הלאה?
              </p>
            </div>

            {/* Three named choices, numbered so the decision reads as a short list rather
                than a stack of similar buttons. Third one hands over to the real practice
                screen — reading the category is what makes a waiter ready to be tested. */}
            <div className="w-full space-y-2.5 pt-2">
              <Choice n="1" onClick={() => setIdx(0)} primary>
                לעבור שוב על {shortCat(cat)}
              </Choice>

              {nextCat ? (
                <Choice n="2" onClick={() => { setCat(nextCat); setIdx(0); }}>
                  להמשיך ל{shortCat(nextCat)}
                </Choice>
              ) : (
                <Choice n="2" onClick={() => { setCat(null); setIdx(null); }}>
                  {flat ? "לחזור לרשימת הקטגוריות" : `סיימת את ${menu} — לקטגוריות`}
                </Choice>
              )}

              {onPractice && (
                <Choice n="3" onClick={() => { const c = cat; setIdx(null); setCat(null); onPractice(c); }}>
                  לתרגול מנות {shortCat(cat)} לקראת הבוחן
                </Choice>
              )}

              <button
                onClick={() => setIdx(dishes.length - 1)}
                className="w-full py-2.5 text-[12px] font-bold text-[#8a8aa0]"
              >
                חזרה למנה האחרונה
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- full-screen dish, with arrows to walk the category ----
  if (idx !== null && dishes[idx]) {
    const d = dishes[idx];
    const vis = categoryVisual(d.category);
    return (
      <div className="fixed inset-0 z-50 bg-[#0c0d10] flex justify-center" dir="rtl">
        <div className="w-full max-w-md h-full flex flex-col border-x border-[#1a1d23]">
        <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setIdx(null)} className="text-[#8a8aa0] flex items-center gap-1 text-xs font-bold" aria-label="סגירה">
            <X size={16} /> סגירה
          </button>
          <p className="text-[11px] font-black text-[#8a8aa0]">{shortCat(d.category)} · {idx + 1}/{dishes.length}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="max-w-md mx-auto space-y-5">
            <div className="text-center space-y-3">
              {d.imageUrl ? (
                <button onClick={() => setZoom(d.imageUrl)} className="block w-full" aria-label="הגדלת התמונה">
                  <img src={d.imageUrl} alt={d.name}
                    className="w-full max-h-64 rounded-3xl object-contain bg-[#16181c] border border-[#22252b]" />
                </button>
              ) : (
              <span
                className="w-20 h-20 rounded-3xl inline-flex items-center justify-center text-5xl"
                style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
                aria-hidden
              >
                {vis.emoji}
              </span>
              )}
              <h2 className="text-[28px] font-black text-[#eef0f6] leading-tight text-balance">{d.name}</h2>
              {Number(d.price) > 0 && (
                <p className="text-[22px] font-black text-[#22c08c] tabular-nums">{Number(d.price)} ₪</p>
              )}
            </div>

            {d.desc && (
              <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
                <p className="text-[11px] font-black text-[#5a5a6e] tracking-wide mb-2.5">התיאור</p>
                <p className="text-[17px] text-[#c4c4d4] leading-[1.9]">{d.desc}</p>
              </div>
            )}

            {d.ingredients?.length > 0 && (
              <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
                <p className="text-[11px] font-black text-[#5a5a6e] tracking-wide mb-2.5">מרכיבים</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.ingredients.map((i) => (
                    <span key={i} className="text-[13px] font-bold px-3 py-1.5 rounded-lg bg-[#20232b] text-[#c4c4d4]">{i}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Split by group, each under its own heading (user, 2026-08-23). One block
                called "מה חשוב לדעת" put an allergy and a "contains coriander" side by
                side in identical chips — three warnings of equal weight, which they are
                not. "מוקש" also needs saying out loud: it is not a danger, it is the
                thing guests ask to leave out. */}
            {FLAG_GROUPS.map(({ key, title, note, cls }) =>
              d[key]?.length ? (
                <div key={key} className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
                  <p className="text-[11px] font-black text-[#5a5a6e] tracking-wide">{title}</p>
                  <p className="text-[10.5px] text-[#5a5a6e] mt-0.5 mb-2.5 leading-snug">{note}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d[key].map((t) => (
                      <span key={t} className={`text-[13px] px-3 py-1.5 font-black rounded-md ${cls}`}>{t}</span>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>

        {zoom && (
          <button
            onClick={() => setZoom(null)}
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3"
            aria-label="סגירת התמונה"
          >
            <img src={zoom} alt="" className="max-w-full max-h-full rounded-2xl object-contain" />
          </button>
        )}

        {/* Walking the category is the study loop — the arrows are the main control here,
            not an afterthought, so they get a full bar of their own. */}
        <div className="flex-shrink-0 border-t border-[#22252b] bg-[#16181c] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
          <button
            onClick={() => setIdx(idx - 1)}
            disabled={idx === 0}
            className="flex-1 py-3 min-h-[48px] rounded-xl font-black text-sm bg-[#20232b] text-[#eef0f6] disabled:opacity-30 flex items-center justify-center gap-1.5"
          >
            <ChevronRight size={17} /> הקודם
          </button>
          <button
            onClick={() => setIdx(idx + 1)}
            className="flex-1 py-3 min-h-[48px] rounded-xl font-black text-sm text-white flex items-center justify-center gap-1.5"
            style={{ background: "linear-gradient(135deg,#22c08c,#17805d)" }}
          >
            {idx === dishes.length - 1 ? "סיימתי את הקטגוריה" : <>הבא <ChevronLeft size={17} /></>}
          </button>
        </div>
        </div>
      </div>
    );
  }

  // ---- level 3: the dishes of a category, one airy card each ----
  if (cat) {
    return (
      <div className="space-y-3.5">
        <Crumb over={flat ? null : menu} title={`${categoryVisual(cat).emoji} ${shortCat(cat)}`} onBack={() => setCat(null)} />
        <p className="text-[11.5px] text-[#5a5a6e] px-1">{nLabel(dishes.length, "מנה", "מנות")} · הקשה על מנה פותחת אותה במלואה</p>
        {dishes.map((d, i) => (
          <button
            key={d.id}
            data-tour={i === 0 ? "browse-dish" : undefined}
            onClick={() => setIdx(i)}
            className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-5 space-y-2.5 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-3">
              {d.imageUrl && (
                <img src={d.imageUrl} alt="" loading="lazy"
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-[#22252b]" />
              )}
              <p className="flex-1 text-[22px] font-black text-[#eef0f6] leading-snug">{d.name}</p>
              {Number(d.price) > 0 && (
                <p className="text-[19px] font-black text-[#22c08c] tabular-nums flex-shrink-0">{Number(d.price)} ₪</p>
              )}
            </div>
            {d.desc && <p className="text-[14.5px] text-[#a4a4b8] leading-[1.75] line-clamp-2">{d.desc}</p>}
            <Tags d={d} />
          </button>
        ))}
      </div>
    );
  }

  // ---- level 2: categories inside a menu ----
  if (menu || flat) {
    const pool = (cards || []).filter((c) => (flat ? true : c.menuGroup === menu));
    const list = [...new Set(pool.map((c) => c.category).filter(Boolean))];
    return (
      <div className="space-y-2.5">
        {!flat && <Crumb over="התפריטים" title={menu} onBack={() => setMenu(null)} />}
        {list.map((c) => {
          const vis = categoryVisual(c);
          const n = pool.filter((x) => x.category === c).length;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              data-tour="browse-category"
              className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
            >
              <span
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
                aria-hidden
              >
                {vis.emoji}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[18px] font-black text-[#eef0f6] line-clamp-1">{shortCat(c)}</span>
                <span className="block text-[12px] text-[#8a8aa0] mt-1.5">{nLabel(n, "מנה", "מנות")}</span>
              </span>
              <ChevronLeft size={18} className="text-[#5a5a6e] flex-shrink-0" />
            </button>
          );
        })}
      </div>
    );
  }

  // ---- level 1: the restaurant's menus ----
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">התפריט של המסעדה — אפשר לפתוח כל תפריט ולעיין בו.</p>
      {menus.map((m) => {
        const inG = (cards || []).filter((c) => c.menuGroup === m);
        const catCount = new Set(inG.map((c) => c.category)).size;
        return (
          <button
            key={m}
            onClick={() => setMenu(m)}
            data-tour="browse-menu"
            className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-5 flex items-center gap-3 active:scale-[0.99] transition-transform"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[18px] font-black text-[#eef0f6]">{m}</span>
              <span className="block text-[11px] text-[#8a8aa0] mt-1">{nLabel(catCount, "קטגוריה", "קטגוריות")} · {nLabel(inG.length, "פריט", "פריטים")}</span>
            </span>
            <ChevronLeft size={18} className="text-[#5a5a6e] flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
