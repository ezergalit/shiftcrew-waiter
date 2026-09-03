import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { categoryVisual } from "../lib/categoryVisual";
import { shortCat, nLabel, ingLabel } from "../games/shared";

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
const ALLERGEN_GROUP = { key: "allergens", title: "אלרגיות", cls: "bg-[#3a1d22] text-[#ff8098]",
  note: "מרכיב שעלול לסכן אורח עם אלרגיה — תמיד לוודא במטבח לפני שמאשרים." };
const FLAG_GROUPS = [
  ALLERGEN_GROUP,
  { key: "pregnancy", title: "רגישות בהריון", cls: "bg-[#2a2140] text-[#c4b5fd]",
    note: "לא אלרגיה, אבל לא מתאים לאורחת בהריון — כדאי להזכיר." },
  { key: "pitfalls", title: "מוקשים והעדפות", cls: "bg-[#33290f] text-[#f3c14b]",
    note: "לא מסוכן — פשוט טעם שאורחים רבים מבקשים בלעדיו (כוסברה, חריף, שום)." },
];
// ⚠️ Whether pregnancy is its own group is a PER-RESTAURANT decision, not a global one.
// `features.warnings === "merged"` folds it into the amber list with a 🤰 marker.
//   · Studio keeps three groups: its dishes carry both, and a two-chip key would be
//     describing something the dish screens do not do.
//   · Salon merges: there, raw fish is understood as a pregnancy PITFALL rather than a
//     separate sensitivity, so two colours match how that kitchen actually talks
//     (user, 29.8: "דג נא במסעדה הזאת נחשב מוקש להריון ולא רגישות").
// Getting this wrong in either direction shows a waiter a colour the key never explains.
const MERGED_GROUPS = [
  ALLERGEN_GROUP,
  { key: "mokshim", title: "מוקשים", cls: "bg-[#33290f] text-[#f3c14b]",
    note: "מה שאורחים מבקשים בלעדיו (כוסברה, חריף, שום), ומה שלא מתאים לאורחת בהריון — מסומן ב-🤰." },
];

// Pregnancy items keep the 🤰 inside the merged list, so they stay identifiable even
// though they no longer have a colour of their own.
export const mokshimOf = (d) => [
  ...(d?.pregnancy || []).map((t) => `🤰 ${t}`),
  ...(d?.pitfalls || []),
];

// ℹ️ The FLASHCARD back merges them everywhere — that was its own explicit request
// (28.8), and a card being revealed is a different surface from a menu being browsed.
// See `mokshim` in games/shared.js.

// The service tile is a menu-level destination, not a menu group — a sentinel keeps it
// in the same `menu` state as the real menus so back/forward behave identically.
const SERVICE = "\u0000service";

// One category row, used by both the door and the inside-a-menu list. Module scope so
// level 2 (an early return) can reach it — a helper defined further down the component
// body is not in scope up here, which is the same class of bug as a hook after a return.
// A category is a GUIDE only when every item in it is a knowledge card. Categories like
// סלטים carry one "מה חשוב לדעת" card at the top and are still food — matching on "has a
// knowledge card" put סלטים, מרקים and ווק inside the service box.
function guideCategories(cards) {
  const byCat = new Map();
  for (const c of cards || []) {
    if (!c.category) continue;
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }
  return [...byCat.entries()].filter(([, v]) => v.every((x) => x.knowledge)).map(([k]) => k);
}

// The service box holds only the guide categories whose menu_group serves no food —
// the standalone "הדרכות שירות" group. A guide that lives inside a dish menu (הדרכת
// סושי in תפריט סושי, הדרכת בר in the bar menu) belongs to that menu, not here (user,
// 30.8: "ההדרכת סושי ואלכוהול צריך להיות בתוך התפריט סושי ואלכוהול"). Driven by the
// data: move a guide's menu_group and it moves box, no code change.
function serviceGuideCategories(cards) {
  const gCats = guideCategories(cards);
  const dishGroups = new Set((cards || []).filter((c) => !gCats.includes(c.category))
    .map((c) => c.menuGroup).filter(Boolean));
  return gCats.filter((g) => {
    const grp = (cards || []).find((c) => c.category === g)?.menuGroup;
    return !grp || !dishGroups.has(grp);
  });
}

function catRowFor(cards, c, onOpen) {
  const inCat = (cards || []).filter((x) => x.category === c);
  const vis = categoryVisual(c);
  const photo = inCat.find((x) => x.imageUrl)?.imageUrl;
  const knowledge = inCat.length > 0 && inCat.every((x) => x.knowledge);
  const nWord = knowledge ? nLabel(inCat.length, "נושא", "נושאים") : nLabel(inCat.length, "מנה", "מנות");
  return (
    <button key={c} className="glass cat" data-tour="browse-category" onClick={() => onOpen(c)}>
      <span className="icon" aria-hidden>{photo ? <img src={photo} alt="" loading="lazy" /> : vis.emoji}</span>
      <span className="flex-1 min-w-0"><h3 className="line-clamp-1">{shortCat(c)}</h3><p>{nWord}</p></span>
      <ChevronLeft size={16} className="chev" />
    </button>
  );
}


// 🔴 Full-screen screens are PORTALLED to <body>, never rendered in place.
//
// `.aurora-skin` (the app root) carries `isolation:isolate` + `overflow:hidden`, so an
// overlay rendered inside it is sealed into the root's stacking context — and the bottom
// nav, which comes later in that same context and paints its own backdrop-filter layer,
// covered the overlay's lower edge. On a phone that is exactly where the prev/next bar
// lives, so the dish screen looked like it had no way forward (user, 30.8: "there is
// still no next dish button"). It reproduced only on a device: in a desktop browser the
// nav is ~34px shorter (no safe-area inset) and left the bar just visible, which is why
// measuring in the browser kept saying it was fine.
function Overlay({ children }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#0c0d10] flex justify-center" dir="rtl">{children}</div>,
    document.body,
  );
}

export default function MenuBrowser({ cards, onPractice, topSlot = null, bottomSlot = null, aurora = false, merged = false, onDepth, examableFor, onExam, examOpenFor, walkCountFor, noteWalk }) {
  // ⚠️ Not `groups` — that name already means the restaurant's MENU groups in this file.
  const warnGroups = merged ? MERGED_GROUPS : FLAG_GROUPS;
  // Search on the menu door (the handoff page's dynamic): a query matches a category by
  // its name, or by any dish name / ingredient inside it — a waiter looking for "כמהין"
  // should land on the categories that serve it.
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(null);
  const [cat, setCat] = useState(null);
  const [idx, setIdx] = useState(null);
  const [zoom, setZoom] = useState(null); // full-screen photo overlay   // index into the open category, or null

  const groups = [...new Set((cards || []).map((c) => c.menuGroup).filter(Boolean))];
  const firstPos = (g) => Math.min(...(cards || []).filter((c) => c.menuGroup === g).map((c) => c.menuPosition ?? 1e9));
  const menus = groups.sort((a, b) => firstPos(a) - firstPos(b));
  // The shell hides its floating exit button once the waiter is past the door — inside a
  // menu, a category or a dish it is chrome over someone's reading (user, 30.8: "when i
  // enter into a dish the button show disappear and reappear when im back in the
  // mainpage").
  useEffect(() => { onDepth?.(menu !== null || cat !== null || idx !== null); },
            [menu, cat, idx, onDepth]);
  const flat = menus.length <= 1;
  const serviceCats = serviceGuideCategories(cards);
  // ⚠️ The service box is a destination, not a menu_group — filtering dishes by it would
  // match nothing and every guide category would open empty.
  const inMenu = (c) => (!menu || menu === SERVICE ? true : c.menuGroup === menu);
  const menuLabel = menu === SERVICE ? "הדרכות שירות" : menu;

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
  // The last category of a menu chains into the NEXT menu's first category (user, 31.8:
  // "שזה באמת יעביר אותך אליה") — door order: the menus, then the service box. When
  // nothing is left anywhere, the chain simply ends and practice takes the stage.
  const boxOrder = [...menus, ...(serviceCats.length ? [SERVICE] : [])];
  const nextBox = !nextCat && cat && menu !== undefined
    ? boxOrder[boxOrder.indexOf(menu ?? menus[0]) + 1] || null : null;
  const nextBoxCat = nextBox === SERVICE
    ? serviceCats[0] || null
    : nextBox
      ? [...new Set((cards || []).filter((c) => c.menuGroup === nextBox)
          .sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0))
          .map((c) => c.category).filter(Boolean))][0] || null
      : null;

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

  // 🔴 Three groups, three colours, everywhere — including under the skin. The merged
  // version showed pregnancy in the amber list while the colour key above listed only two
  // chips, so Studio's waiters saw a colour the key never explained (user, 29.8).
  const Tags = ({ d, size = "sm" }) => {
    const cls = size === "lg" ? "text-[13px] px-3 py-1.5" : "text-[11px] px-2 py-1";
    const pitfalls = merged ? mokshimOf(d) : (d.pitfalls || []);
    const pregnancy = merged ? [] : (d.pregnancy || []);
    if (!(d.allergens?.length || pitfalls.length || pregnancy.length)) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {d.allergens?.map((t) => (
          <span key={`a${t}`} className={`${cls} font-black rounded-md bg-[#3a1d22] text-[#ff8098]`}>{t}</span>
        ))}
        {pregnancy.map((t) => (
          <span key={`g${t}`} className={`${cls} font-black rounded-md bg-[#2a2140] text-[#c4b5fd]`}>🤰 {t}</span>
        ))}
        {pitfalls.map((t) => (
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
      <Overlay>
        <div className="w-full max-w-md h-full flex flex-col border-x border-[#1a1d23]">
          <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between flex-shrink-0">
            <button onClick={() => setIdx(null)}
              className="min-h-[44px] px-3.5 py-2 -mr-1.5 rounded-xl bg-[#20232b] border border-[#2a2e37] text-[#c4c4d4] flex items-center gap-1.5 text-[13px] font-black active:scale-95 transition-transform"
              aria-label="סגירה">
              <X size={19} /> סגירה
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
              {/* Order and highlight (user, 31.8, superseding the progressive
                  highlight from earlier the same day): 1. CONTINUE to the next
                  category — first in line and always highlighted green («תדגיש
                  בירוק מעכשיו להמשיך לקטגוריה הבאה») · 2. flashcards · 3. read
                  again. The quiz CTA still takes the very top once it is open. */}
              {(() => {
                const walked = walkCountFor?.(cat) ?? 0;
                const quizReady = walked >= 2 && examOpenFor?.(cat) && !!onExam;
                const hasNext = !!(nextCat || nextBoxCat);
                return (
                  <>
                    {quizReady && (
                      <Choice n="★" primary onClick={() => { const c = cat; setIdx(null); setCat(null); onExam(c); }}>
                        עברת פעמיים — מוכנים? לבוחן {shortCat(cat)}
                      </Choice>
                    )}

                    {nextCat && (
                      <Choice n="1" primary onClick={() => { setCat(nextCat); setIdx(0); }}>
                        להמשיך ל{shortCat(nextCat)}
                      </Choice>
                    )}
                    {!nextCat && nextBoxCat && (
                      <Choice n="1" primary onClick={() => { setMenu(nextBox); setCat(nextBoxCat); setIdx(0); }}>
                        להמשיך ל{shortCat(nextBoxCat)}
                      </Choice>
                    )}

                    {onPractice && (
                      <Choice n="2" primary={!hasNext && !quizReady}
                        onClick={() => { const c = cat; setIdx(null); setCat(null); onPractice(c); }}>
                        {/* Never promise a quiz a category can't run (user, 31.8) — soft
                            drinks and the like still practise, they just aren't examined. */}
                        {!examableFor || examableFor(cat)
                          ? `לתרגול מנות ${shortCat(cat)} לקראת הבוחן`
                          : `לתרגול מנות ${shortCat(cat)} בכרטיסיות`}
                      </Choice>
                    )}

                    <Choice n="3" onClick={() => setIdx(0)}>
                      לעבור שוב על {shortCat(cat)}
                    </Choice>
                  </>
                );
              })()}
              <button
                onClick={() => setIdx(dishes.length - 1)}
                className="w-full py-2.5 text-[12px] font-bold text-[#8a8aa0]"
              >
                חזרה למנה האחרונה
              </button>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  // ---- full-screen dish, with arrows to walk the category ----
  if (idx !== null && dishes[idx]) {
    const d = dishes[idx];
    const vis = categoryVisual(d.category);
    // The photos the waiter is ABOUT to see, fetched while they read this one. Two in
    // the walking direction, one behind — a 900px webp lands well inside one dish's
    // reading time, so the next screen paints with its photo already in cache instead
    // of flashing empty (user, 30.8: "התמונות של המנות יתעדכנו מהר יותר").
    [idx + 1, idx + 2, idx - 1].forEach((n) => {
      const u = dishes[n]?.imageUrl;
      if (u) { const im = new Image(); im.src = u; }
    });
    return (
      <Overlay>
        <div className="w-full max-w-md h-full flex flex-col border-x border-[#1a1d23]">
        <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setIdx(null)}
            className="min-h-[44px] px-3.5 py-2 -mr-1.5 rounded-xl bg-[#20232b] border border-[#2a2e37] text-[#c4c4d4] flex items-center gap-1.5 text-[13px] font-black active:scale-95 transition-transform"
            aria-label="סגירה" data-tour="dish-close">
            <X size={19} /> סגירה
          </button>
          <p className="text-[11px] font-black text-[#8a8aa0]">{shortCat(d.category)} · {idx + 1}/{dishes.length}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="max-w-md mx-auto space-y-5">
            <div className="text-center space-y-3">
              {d.imageUrl ? (
                <button onClick={() => setZoom(d.imageUrl)} className="block w-full" aria-label="הגדלת התמונה">
                  <img src={d.imageUrl} alt={d.name} fetchPriority="high" decoding="async"
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
                <p className="text-[11px] font-black text-[#5a5a6e] tracking-wide mb-2.5">{ingLabel(d)}</p>
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
            {warnGroups.map(({ key, title, note, cls }) => {
              const vals = key === "mokshim" ? mokshimOf(d) : d[key];
              return vals?.length ? (
                <div key={key} className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
                  <p className="text-[11px] font-black text-[#5a5a6e] tracking-wide">{title}</p>
                  <p className="text-[10.5px] text-[#5a5a6e] mt-0.5 mb-2.5 leading-snug">{note}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {vals.map((t) => (
                      <span key={t} className={`text-[13px] px-3 py-1.5 font-black rounded-md ${cls}`}>{t}</span>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
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
            onClick={() => { if (idx === dishes.length - 1) noteWalk?.(cat); setIdx(idx + 1); }}
            className="flex-1 py-3 min-h-[48px] rounded-xl font-black text-sm text-white flex items-center justify-center gap-1.5"
            style={{ background: "linear-gradient(135deg,#22c08c,#17805d)" }}
          >
            {idx === dishes.length - 1 ? "סיימתי את הקטגוריה" : <>הבא <ChevronLeft size={17} /></>}
          </button>
        </div>
        </div>
      </Overlay>
    );
  }

  // ---- level 3: the dishes of a category, one airy card each ----
  if (cat) {
    return (
      <div className="space-y-3.5">
        <Crumb over={menu ? menuLabel : (flat ? null : menu)} title={`${categoryVisual(cat).emoji} ${shortCat(cat)}`} onBack={() => setCat(null)} />
        <p className="text-[11.5px] text-[#5a5a6e] px-1">{cat.startsWith("הדרכת") ? `${nLabel(dishes.length, "נושא", "נושאים")} · הקשה על נושא פותחת אותו במלואו` : `${nLabel(dishes.length, "מנה", "מנות")} · הקשה על מנה פותחת אותה במלואה`}</p>
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
  if (menu || (flat && !aurora)) {
    // A real menu holds everything in its group — dishes AND its own guide categories
    // (הדרכת סושי opens inside תפריט סושי, first, by menu_position). The service box
    // holds only the guides whose group serves no food.
    const svcCats = serviceGuideCategories(cards);
    const pool = menu === SERVICE
      ? (cards || []).filter((c) => svcCats.includes(c.category))
      : (cards || []).filter((c) => (flat && !aurora ? true : c.menuGroup === menu && !svcCats.includes(c.category)));
    const byFirstPos = pool.slice().sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0));
    const list = [...new Set(byFirstPos.map((c) => c.category).filter(Boolean))];
    const title = menu === SERVICE ? "הדרכות שירות" : menu;

    // Under the skin the categories are the same glass rows the door uses, so stepping
    // in feels like the same surface rather than a different screen.
    if (aurora) {
      return (
        <div className="flex flex-col gap-3">
          <Crumb over="התפריטים" title={title} onBack={() => setMenu(null)} />
          {list.map((c) => catRowFor(cards, c, setCat))}
        </div>
      );
    }
    return (
      <div className="space-y-2.5">
        {flat && topSlot}
        {!flat && <Crumb over="התפריטים" title={title} onBack={() => setMenu(null)} />}
        {list.map((c) => {
          const vis = categoryVisual(c);
          const inCat = pool.filter((x) => x.category === c);
          const n = inCat.length;
          // A real dish photo from the category beats the generic emoji tile (user,
          // 2026-08-27) — the emoji stays only for categories with no photos at all.
          const photo = inCat.find((x) => x.imageUrl)?.imageUrl;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              data-tour="browse-category"
              className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
            >
              {photo ? (
                <img src={photo} alt="" loading="lazy"
                  className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border border-[#22252b]" />
              ) : (
              <span
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${vis.from}, ${vis.to}44)` }}
                aria-hidden
              >
                {vis.emoji}
              </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-[18px] font-black text-[#eef0f6] line-clamp-1">{shortCat(c)}</span>
                <span className="block text-[12px] text-[#8a8aa0] mt-1.5">{c.startsWith("הדרכת") ? nLabel(n, "נושא", "נושאים") : nLabel(n, "מנה", "מנות")}</span>
              </span>
              <ChevronLeft size={18} className="text-[#5a5a6e] flex-shrink-0" />
            </button>
          );
        })}
      </div>
    );
  }


  // Unskinned restaurants keep the two-level browser they already had: menus, then
  // categories. Nothing about their app changed.
  if (!aurora) {
    return (
      <div className="space-y-2.5">
        {topSlot}
        <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">התפריט של המסעדה — אפשר לפתוח כל תפריט ולעיין בו.</p>
        {menus.map((m2) => {
          const inG = (cards || []).filter((c) => c.menuGroup === m2);
          const catCount = new Set(inG.map((c) => c.category)).size;
          return (
            <button key={m2} onClick={() => setMenu(m2)} data-tour="browse-menu"
              className="w-full text-right bg-[#16181c] border border-[#22252b] rounded-2xl p-5 flex items-center gap-3 active:scale-[0.99] transition-transform">
              <span className="flex-1 min-w-0">
                <span className="block text-[18px] font-black text-[#eef0f6]">{m2}</span>
                <span className="block text-[11px] text-[#8a8aa0] mt-1">{nLabel(catCount, "קטגוריה", "קטגוריות")} · {nLabel(inG.length, "פריט", "פריטים")}</span>
              </span>
              <ChevronLeft size={18} className="text-[#5a5a6e] flex-shrink-0" />
            </button>
          );
        })}
        {bottomSlot}
      </div>
    );
  }
  // ---- level 1: the menus themselves ----
  // ⚠️ Menus are BOXES, not chip rows (user, 30.8: "remove the 2 rows of menu… just put
  // at the bottom like resturant menu / sushi menu in those boxes"). Two filter rows
  // above a list of every category meant a Studio waiter read 19 categories from five
  // different menus at once. Now: pick a menu, then its categories, then a dish — and
  // service training is its own box, because it is not a menu.
  const gCats = serviceGuideCategories(cards);
  const dishCards = (cards || []).filter((c) => !gCats.includes(c.category));
  const guideCards = (cards || []).filter((c) => gCats.includes(c.category));
  const menuTiles = [...new Set(dishCards.map((c) => c.menuGroup).filter(Boolean))]
    .sort((a, b) => Math.min(...dishCards.filter((c) => c.menuGroup === a).map((c) => c.menuPosition ?? 1e9))
                  - Math.min(...dishCards.filter((c) => c.menuGroup === b).map((c) => c.menuPosition ?? 1e9)));
  const nq = q.trim();
  const openDish = (d) => {
    const items = (cards || []).filter((x) => x.category === d.category)
      .sort((a, b) => (a.menuPosition ?? 0) - (b.menuPosition ?? 0));
    setCat(d.category);
    setIdx(Math.max(0, items.findIndex((x) => x.id === d.id)));
  };
  const dishRow = (d) => {
    const vis = categoryVisual(d.category);
    return (
      <button key={d.id} className="glass cat" onClick={() => openDish(d)}>
        <span className="icon" aria-hidden>{d.imageUrl ? <img src={d.imageUrl} alt="" loading="lazy" /> : vis.emoji}</span>
        <span className="flex-1 min-w-0">
          <h3 className="line-clamp-1">{d.name}</h3>
          <p className="line-clamp-1">{shortCat(d.category)}{Number(d.price) > 0 ? ` · ${Number(d.price)} ₪` : ""}</p>
        </span>
        <ChevronLeft size={16} className="chev" />
      </button>
    );
  };
  const catRow = (c) => catRowFor(cards, c, setCat);
  const menuTile = (m2) => {
    const inG = dishCards.filter((c) => c.menuGroup === m2);
    const nCats = new Set(inG.map((c) => c.category)).size;
    // ⚠️ Count dishes, not items. A food category carries a "מה חשוב לדעת" card at the
    // top, and calling it a dish overstates every menu by the number of its guides.
    const nDishes = inG.filter((c) => !c.knowledge).length;
    const photo = inG.find((x) => x.imageUrl)?.imageUrl;
    const vis = categoryVisual(inG[0]?.category || m2);
    return (
      <button key={m2} className="glass cat" data-tour="browse-menu" onClick={() => setMenu(m2)}>
        <span className="icon" aria-hidden>{photo ? <img src={photo} alt="" loading="lazy" /> : vis.emoji}</span>
        <span className="flex-1 min-w-0">
          <h3 className="line-clamp-1">{m2}</h3>
          <p>{nLabel(nCats, "קטגוריה", "קטגוריות")} · {nLabel(nDishes, "מנה", "מנות")}</p>
        </span>
        <ChevronLeft size={16} className="chev" />
      </button>
    );
  };
  const nameCats = nq
    ? [...new Set((cards || []).map((c) => c.category).filter(Boolean))].filter((c) => c.includes(nq))
    : [];
  const dishMatches = nq
    ? (cards || []).filter((d) => (d.name || "").includes(nq) || (d.ingredients || []).some((i) => String(i).includes(nq))).slice(0, 40)
    : [];
  return (
    <div className="flex flex-col gap-3.5 min-h-full">
      {topSlot}
      <label className="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מנה או מרכיב..." />
      </label>
      {/* One chip per group, in the same colours the dish screens use. */}
      <div className="flex flex-wrap gap-[7px]">
        <span className="chip red"><i className="dot" />אלרגיות</span>
        {!merged && <span className="chip purple"><i className="dot" />🤰 רגישות</span>}
        <span className="chip amber"><i className="dot" />{merged ? "מוקשים 🤰" : "מוקשים"}</span>
      </div>
      {!nq ? (
        // ⚠️ `flex-1` + `mt-auto` on About: with three menus the door left ~255px of dead
        // background above the tab bar (user, 30.8). Rather than stretch a tile to an
        // arbitrary height, the menus group at the top and "אודות המסעדה" sits on the
        // bottom edge — the space between them then reads as separation, not as a page
        // that ran out. A long menu list pushes About back down and it scrolls normally.
        <div className="flex flex-col gap-3 flex-1">
          {menuTiles.map(menuTile)}
          {/* Service training gets a box of its own, level with the menus — it is what
              the team has to know, but it is not something a guest can order. */}
          {guideCards.length > 0 && (
            <button className="glass cat" onClick={() => setMenu(SERVICE)}>
              <span className="icon" aria-hidden>🎓</span>
              <span className="flex-1 min-w-0">
                <h3 className="line-clamp-1">הדרכות שירות</h3>
                <p>{nLabel(guideCards.length, "נושא", "נושאים")} · איך מארחים כאן</p>
              </span>
              <ChevronLeft size={16} className="chev" />
            </button>
          )}
          <div className="mt-auto">{bottomSlot}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {nameCats.map(catRow)}
          {dishMatches.length > 0 && <p className="au-label px-1">{nLabel(dishMatches.length, "מנה", "מנות")} שנמצאו</p>}
          {dishMatches.map(dishRow)}
          {nameCats.length === 0 && dishMatches.length === 0 && (
            <p className="au-label px-1">לא נמצא כלום עבור ״{nq}״ — נסו שם מנה, מרכיב או קטגוריה.</p>
          )}
        </div>
      )}
    </div>
  );
}
