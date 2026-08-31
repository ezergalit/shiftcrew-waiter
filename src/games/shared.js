// Shared UI helpers and vocabulary for the game screens and MainApp.
//
// Everything here used to live at the top of MainApp.jsx. It moved out with the game
// extraction (2026-08-13) because sibling components kept reaching for helpers that were
// accidentally function-scoped — that exact mistake shipped a ReferenceError twice in one
// day. One module, imported explicitly, makes the dependency visible.

// Legacy seeded menus store these English keys. Menus built in the owner app (paste/AI
// import) use free-text Hebrew category names instead, which need no translation — hence
// `catLabel` below rather than a bare lookup. Never filter on this list: see `cats`.
export const CAT_LABELS = { starters: "ראשונות", mains: "עיקריות", desserts: "קינוחים", drinks: "קוקטיילים" };
export const CAT_ORDER = ["starters", "mains", "desserts", "drinks"];
export const catLabel = (c) => CAT_LABELS[c] || c;

export const shortCat = (c) => catLabel(c || "").split(/\s*[—–]\s*/)[0].trim();

// How long the red/green answer feedback stays before advancing. Long enough to read
// which option was right — the previous ~1s read as a flash, especially since the deck
// used to reshuffle at the same moment.

export const FEEDBACK_MS = 1800;

// Hebrew has no "1 items" — a count of one takes the singular noun.
export const countLabel = (arr, one, many) =>
  arr?.length > 0 ? `${arr.length} ${arr.length === 1 ? one : many}` : null;

// Same rule when what you have is already a number rather than the list. Kept separate
// rather than overloading countLabel: `[...Array(n)]` at every call site is a real array
// allocation for a string, and it reads like a trick.
export const nLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const COLORS = ["#22c08c", "#ff7a59", "#e0315a", "#f3a712", "#3a86ff", "#6d5efc", "#9b7bff", "#1aa376"];
export const colorFor = name => COLORS[String(name).charCodeAt(0) % COLORS.length];

// Challenges — persisted locally per team member (device-scoped, not synced across devices).
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const loadDaily = (id) => {
  if (!id) return { date: todayStr(), count: 0, bonusAwarded: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(`menu-app-daily-${id}`));
    if (parsed?.date === todayStr()) return parsed;
  } catch {}
  return { date: todayStr(), count: 0, bonusAwarded: false };
};
export const saveDaily = (id, obj) => id && localStorage.setItem(`menu-app-daily-${id}`, JSON.stringify(obj));
export const loadNum = (key, id) => id ? Number(localStorage.getItem(`${key}-${id}`)) || 0 : 0;
export const saveNum = (key, id, val) => id && localStorage.setItem(`${key}-${id}`, String(val));

export const shuffle = a => [...a].sort(() => Math.random() - 0.5);


// The same nine the owner app offers and the AI import is allowed to return. "סולפיטים"
// used to be a tenth option here — an allergen no owner could ever tag, so selecting it
// was always wrong for a reason the trainee had no way to learn.
export const ALLERGENS = ["גלוטן", "לקטוז", "ביצים", "אגוזים", "בוטנים", "רכיכות", "סויה", "שומשום"];
// "מוקשים" — what a guest often asks to avoid by preference, not by safety. Separate from
// ALLERGENS on purpose: folding a preference into the allergen list makes the allergen
// list less trustworthy, and a waiter reads the two for different reasons. Free text, so
// these are only a starting palette — any restaurant adds its own.
export const PITFALLS = ["כוסברה", "חריף", "דג נא", "שום", "בצל", "ג'ינג'ר", "וסאבי", "מיונז", "אלכוהול", "טחינה"];

// The study card teaches three things and only three: ingredients, allergies, and
// "mokshim" — everything else a guest may care about, folded into one yellow list
// (user, 2026-08-27: "מוקש ורגישות — תקרא להם מוקשים פשוט"). Pregnancy warnings and the
// problematic-kashrut facts live here; the plain kashrut classification (בשרי/חלבי/פרווה)
// is menu-reference detail, not a card fact. The full four-group split stays in the menu.
const KASHRUT_WARN = new Set(["לא כשר", "בשר וחלב יחד", "פירות ים", "חזיר"]);
// "דגים עתירי כספית" is a real pregnancy fact but reads as noise on a study card
// (user, 2026-08-27) — the menu's full detail view still shows it.
const MOKSHIM_SKIP = new Set(["דגים עתירי כספית"]);
export const mokshim = (it) => [...new Set([
  ...(it?.pitfalls || []),
  // Pregnancy warnings carry 🤰 so they stay identifiable inside the merged list
  // (user, 2026-08-28) — two colours at a table beat three.
  ...(it?.pregnancy || []).filter((m) => !MOKSHIM_SKIP.has(m)).map((m) => `🤰 ${m}`),
  ...(it?.kashrut || []).filter((k) => KASHRUT_WARN.has(k)),
])].filter((m) => !MOKSHIM_SKIP.has(m));

// A wine's description follows one fixed shape we author ourselves:
// "<סוג> · <מוצא>. <אופי וטעמים>. זנים: … פתיחה: <הוראות>".
// Splitting on the פתיחה: marker gives the card a tasting-notes paragraph and a
// separate "how to open" box — both of which the waiter is expected to know.
export const wineParts = (it) => {
  if (!it?.drink || !it.desc) return null;
  const i = it.desc.indexOf("פתיחה:");
  return {
    notes: (i < 0 ? it.desc : it.desc.slice(0, i)).trim(),
    opening: i < 0 ? "" : it.desc.slice(i + "פתיחה:".length).trim(),
  };
};
