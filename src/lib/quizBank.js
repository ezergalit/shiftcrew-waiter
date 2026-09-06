// ══ הרכב הבוחן בכתיבה — כללי יותם (6.9) ══
//
// «בכל בוחן לוקחים 60-70% מהמנות באקראי; 12 ראשונות ⇒ 7 שאלות, 7 סלטים ⇒ 5; ככל שיש
// פחות מנות בוחנים על יותר; 4 ומטה ⇒ על כולן. שאלה על מנה = תיאור+מרכיבים+אלרגיה
// (מפרקים את השאלה). ועוד 1-2 שאלות "מלכודת" בלי תיאור: ציין את כל הראשונות שטבעוני
// יכול לאכול / שרגיש ללקטוז לא יכול לאכול — לזה לא צריך AI. ומלצר שנכשל לא מקבל
// את אותו הבוחן שוב.»
//
// מודול טהור (בלי React, נבדק ב-node): בנק פר-קטגוריה + הרכבת ישיבה + מחזור "נשאל".
// ⚠️ הכל דטרמיניסטי מהנתונים של המנה — אלרגיות/הריון/מוקשים/מרכיבים — אף פעם לא ניחוש.
import { askableIngredients } from "./questionEngine.js";
import { norm } from "./examEngine.js";

// ── גודל הישיבה: 4↓ הכל · 5-8 ⇒ 70% (7⇒5) · 9+ ⇒ 60% (12⇒7) ──────────────────
export function quizSize(n) {
  if (n <= 4) return n;
  if (n <= 8) return Math.ceil(n * 0.7);
  return Math.round(n * 0.6);
}

// כמה "מלכודות" (שאלות-סט בלי תיאור) בישיבה: 1-2, רבע מהישיבה
export function setCountFor(n, available) {
  if (!available) return 0;
  const want = n <= 4 ? 1 : Math.min(2, Math.max(1, Math.round(quizSize(n) * 0.25)));
  return Math.min(want, available);
}

// ── גלאי טבעוני — שמרני, מרשימה מפורשת של מילות בעל-חיים ─────────────────────
// מנה נחשבת «טבעונית» רק כשאין באף שדה שלה מילה מהרשימה, אין ביצים/לקטוז באלרגיות,
// ואין דגל הריון של דג/בשר/ביצה. מנה בלי רשימת מרכיבים ⇒ לא ידוע (null) — ואז
// השאלה כולה לא נבנית לקטגוריה (אסור להעניש מלצר על מנה שהנתון שלה חסר).
const ANIMAL = ["דג", "דגים", "סלמון", "טונה", "ילוטייל", "המאצי", "לברק", "בס", "דניס", "בקלה", "אנשובי", "סרדין", "סרדינים",
  "שרימפס", "שרימפ", "קלמארי", "תמנון", "סרטן", "צדפות", "מולים", "רכיכות", "טוביקו", "איקורה", "מסאגו", "ביצי דג", "אונאגי", "צלופח",
  "עוף", "חזה עוף", "כרעיים", "בקר", "אנטריקוט", "סינטה", "פילה בקר", "טלה", "כבש", "אסאדו", "קבב", "המבורגר", "נקניק", "בייקון",
  "ביצה", "ביצים", "חביתה", "מיונז", "איולי", "גבינה", "פרמזן", "פרמז'ן", "פטה", "מוצרלה", "בוראטה", "חלב", "שמנת", "חמאה", "יוגורט",
  "צזיקי", "לאבנה", "מסקרפונה", "גלידה", "דבש", "רוטב דגים", "רוטב צדפות", "בונטיו", "דאשי", "קרם ברולה"];
const ANIMAL_KEYS = ANIMAL.map(norm);
const hasAnimalWord = (text) => {
  const t = norm(String(text || ""));
  return ANIMAL_KEYS.some((k) => t === k || t.includes(k));
};
export function veganSafe(dish) {
  const ings = (dish.ingredients || []).filter(Boolean);
  if (!ings.length) return null;
  if ((dish.allergens || []).some((a) => /ביצים|לקטוז|חלב/.test(a))) return false;
  if ((dish.pregnancy || []).some((p) => /דג נא|בשר נא|ביצה/.test(p))) return false;
  for (const w of [dish.name, dish.desc, ...ings]) if (hasAnimalWord(w)) return false;
  return true;
}

// ── ניסוח שם הקטגוריה בתוך שאלה ────────────────────────────────────────────
// «ציין את כל הראשונות…» עובד למילה עברית אחת; שם באנגלית או ארוך («Greek Oven Breads»,
// «סלטי גינה מירקות מובחרים») מקבל «המנות ב״…״», ו«ילדים» אינו «הילדים».
const CAT_SPECIAL = { "ילדים": ["מנות הילדים", "ממנות הילדים"] };
export function catForms(cat) {
  if (CAT_SPECIAL[cat]) return { catIn: CAT_SPECIAL[cat][0], catFrom: CAT_SPECIAL[cat][1] };
  const words = cat.split(/\s+/).filter(Boolean);
  const latin = /[A-Za-z]/.test(cat);
  if (latin || words.length >= 3) return { catIn: `המנות ב״${cat}״`, catFrom: `מתוך ״${cat}״` };
  const catIn = /^ה/.test(cat) ? cat : `ה${cat}`;
  return { catIn, catFrom: `מ${catIn}` };
}

// ── חלוקת המבחן המלא (יותם, 6.9): ממוצע הבחנים — כל קטגוריה לפי מספר המנות שלה ──
// «12 ראשונות ו-6 עיקריות ⇒ פי 2 ראשונות מעיקריות, והכל נכנס ב-40 שאלות.»
// חלוקה יחסית עם שארית גדולה; קטגוריה מקבלת לפחות 1 כשיש מקום, ולא יותר ממה שיש בה.
export function examPlan(sizes, total = 40) {
  const entries = Object.entries(sizes).filter(([, n]) => n > 0);
  const sum = entries.reduce((a, [, n]) => a + n, 0);
  if (!sum) return {};
  const raw = entries.map(([cat, n]) => ({ cat, n, exact: (total * n) / sum }));
  const plan = Object.fromEntries(raw.map((r) => [r.cat, Math.min(r.n, Math.floor(r.exact))]));
  let left = total - Object.values(plan).reduce((a, b) => a + b, 0);
  // שארית: לפי החלק העשרוני, ורק לקטגוריה שעוד יש בה מקום (מנות שלא נבחרו)
  const order = raw.slice().sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (const r of order) { if (left <= 0) break; if (plan[r.cat] < r.n) { plan[r.cat]++; left--; } }
  // רצפה של 1 לקטגוריה כשהמבחן גדול מספיק (40 שאלות ⇒ אף קטגוריה לא נעלמת)
  for (const r of raw) if (plan[r.cat] === 0 && left <= 0) { const donor = order.find((o) => plan[o.cat] > 1 && o.cat !== r.cat); if (donor) { plan[donor.cat]--; plan[r.cat] = 1; } }
  return plan;
}

// ── בנק שאלות-סט לקטגוריה (בלי AI) ──────────────────────────────────────────
// כל שאלה: { id, kind: "list"|"rec", ask, answer: string[] (שמות מנות), why: {name: reason} }
// נבנית רק כשהתשובה היא **חלק** מהקטגוריה (לא כולן ולא אף אחת) — אחרת אין מה לדעת.
export function buildSetQuestions(items, catLabel) {
  const dishes = (items || []).filter((d) => !d.knowledge && d.name);
  const n = dishes.length;
  if (n < 2) return [];
  const cat = String(catLabel || dishes[0].category || "").trim() || "המנות";
  const { catIn, catFrom } = catForms(cat);
  const out = [];
  const partial = (S) => S.length >= 1 && S.length <= n - 1;
  const names = (S) => S.map((d) => d.name);
  const push = (id, kind, ask, S, why) => { if (partial(S)) out.push({ id, kind, ask, answer: names(S), why }); };

  // 1. אלרגיות — «לא יכול לאכול» (מכילה), ו«כן יכול» כשהקטגוריה מתויגת (≥70% מצהירות)
  const allergens = [...new Set(dishes.flatMap((d) => d.allergens || []))];
  const declared = dishes.filter((d) => (d.allergens || []).length).length;
  for (const a of allergens) {
    const has = dishes.filter((d) => (d.allergens || []).includes(a));
    push(`set:allergen-has:${a}`, "list", `ציין את כל ${catIn} שלקוח עם רגישות ל${a} לא יכול לאכול`, has,
      Object.fromEntries(has.map((d) => [d.name, `מכילה ${a}`])));
    if (declared >= Math.ceil(n * 0.7)) {
      const safe = dishes.filter((d) => !(d.allergens || []).includes(a));
      push(`set:allergen-safe:${a}`, "list", `ציין את כל ${catIn} שלקוח עם רגישות ל${a} כן יכול לאכול`, safe,
        Object.fromEntries(dishes.map((d) => [d.name, (d.allergens || []).includes(a) ? `מכילה ${a}` : `בלי ${a}`])));
    }
  }
  // 2. הריון — אסור / אפשר (רק כשיש דגלים בקטגוריה)
  const preg = dishes.filter((d) => (d.pregnancy || []).length);
  if (preg.length) {
    const whyP = Object.fromEntries(dishes.map((d) => [d.name, (d.pregnancy || []).length ? (d.pregnancy || []).join(", ") : "אין רגישות בהריון"]));
    push("set:pregnancy-no", "list", `ציין את כל ${catIn} שאסור להגיש לאורחת בהריון`, preg, whyP);
    push("set:pregnancy-ok", "list", `ציין את כל ${catIn} שאפשר להגיש לאורחת בהריון`, dishes.filter((d) => !(d.pregnancy || []).length), whyP);
  }
  // 3. מוקשים — «יש בהן X» (חריף ⇒ «חריפות»)
  const pits = [...new Set(dishes.flatMap((d) => d.pitfalls || []))];
  for (const p of pits) {
    const has = dishes.filter((d) => (d.pitfalls || []).includes(p));
    const ask = p === "חריף" ? `ציין את כל ${catIn} החריפות` : `ציין את כל ${catIn} שיש בהן ${p}`;
    push(`set:pitfall:${p}`, "list", ask, has, Object.fromEntries(has.map((d) => [d.name, `יש ${p}`])));
  }
  // 4. טבעוני — רק כשלכל המנות יש מרכיבים (הגלאי לא מנחש על מנה חסרה)
  const vs = dishes.map((d) => veganSafe(d));
  if (vs.every((v) => v !== null)) {
    const vegan = dishes.filter((_, i) => vs[i]);
    push("set:vegan", "list", `ציין את כל ${catIn} שלקוח טבעוני יכול לאכול`, vegan,
      Object.fromEntries(dishes.map((d, i) => [d.name, vs[i] ? "טבעונית" : "לא טבעונית"])));
  }
  // 5. המלצה מרומזת — מרכיב/דגל אחד או שניים שמצביעים על 1-2 מנות בלבד
  //    («לקוח רוצה דג נא ואבוקדו מהראשונות ⇒ סקוורס / סשימי ילוטייל»)
  const atomsOf = (d) => {
    const s = new Map();
    for (const x of askableIngredients(d)) s.set(norm(x), x);
    for (const x of d.pregnancy || []) s.set(norm(x), x);
    for (const x of d.pitfalls || []) s.set(norm(x), x);
    return s;
  };
  const dishAtoms = dishes.map(atomsOf);
  const index = new Map();                                     // atomKey → { label, set: dish[] }
  dishAtoms.forEach((m, i) => { for (const [k, label] of m) { const e = index.get(k) || { label, set: [] }; e.set.push(dishes[i]); index.set(k, e); } });
  const recs = [];
  const seenSets = new Set();
  const key = (S) => S.map((d) => d.name).sort().join("|");
  for (const [, e] of index) {
    if (e.set.length >= 1 && e.set.length <= 2 && !seenSets.has(key(e.set))) {
      seenSets.add(key(e.set));
      recs.push({ atoms: [e.label], S: e.set });
    }
  }
  const keys = [...index.keys()].filter((k) => index.get(k).set.length >= 2);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = index.get(keys[i]), B = index.get(keys[j]);
    const inter = A.set.filter((d) => B.set.includes(d));
    if (inter.length >= 1 && inter.length <= 2 && !seenSets.has(key(inter))) {
      seenSets.add(key(inter));
      recs.push({ atoms: [A.label, B.label], S: inter });
    }
  }
  // עדיפות לרמז שמכסה מנה שעוד לא כוסתה; עד 8 לקטגוריה
  const covered = new Set();
  recs.sort((a, b) => a.S.filter((d) => !covered.has(d.name)).length - b.S.filter((d) => !covered.has(d.name)).length).reverse();
  for (const r of recs) {
    if (out.filter((q) => q.kind === "rec").length >= 8) break;
    if (r.S.every((d) => covered.has(d.name)) && r.atoms.length === 1) continue;
    r.S.forEach((d) => covered.add(d.name));
    const what = r.atoms.length === 2 ? `${r.atoms[0]} ו${r.atoms[1]}` : r.atoms[0];
    push(`rec:${r.atoms.map(norm).join("+")}`, "rec", `לקוח מבקש משהו עם ${what} ${catFrom} — על מה תמליץ? ציין את כל האופציות`, r.S,
      Object.fromEntries(r.S.map((d) => [d.name, `יש ${what}`])));
  }
  return out;
}

// ── הרכבת ישיבה ──────────────────────────────────────────────────────────────
// dishes: [{ name, starred }] (המנות שהמנוע מוכן לשאול עליהן) · sets: הבנק מלמעלה
// seen: מזהי שאלות שכבר נשאלו במכשיר (ישן ⇒ חדש). מחזירה { cards, asked }.
// cards: [{ kind:"rec"|"list", set }, { kind:"dish", name }] בסדר: המלצה ⇒ המנות שלה ⇒
// שאר המנות ⇒ שאלות-הסט. מלצר שנכשל לא מקבל את אותה ישיבה: מה שנשאל שוקע לסוף.
export function composeQuiz({ dishes, sets, seen = [], rand = Math.random, size = null }) {
  const n = dishes.length;
  if (!n) return { cards: [], asked: [] };
  // size (מכסת מבחן) גובר על כלל הבוחן; ואז "4 ומטה ⇒ הכל" לא חל — המכסה קובעת
  const N = size ?? quizSize(n);
  const setN = size == null ? setCountFor(n, sets.length) : Math.min(sets.length, N >= 4 ? Math.min(2, Math.max(1, Math.round(N * 0.25))) : (N >= 2 ? 1 : 0));
  const dishN = size == null && n <= 4 ? n : Math.max(1, N - setN);
  const seenRank = new Map(seen.map((id, i) => [id, i]));          // לא נראה ⇒ -1
  const rank = (id) => (seenRank.has(id) ? seenRank.get(id) : -1);
  const shuffled = (arr) => arr.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const byFresh = (arr, idOf) => shuffled(arr).sort((a, b) => rank(idOf(a)) - rank(idOf(b)));

  // שאלות-סט: קודם «ציין את כל», ואז אם יש מקום — המלצה מרומזת; לא-נשאל קודם
  const lists = byFresh(sets.filter((q) => q.kind === "list"), (q) => q.id);
  const recs = byFresh(sets.filter((q) => q.kind === "rec"), (q) => q.id);
  const chosenSets = [];
  if (setN >= 1 && lists.length) chosenSets.push(lists[0]);
  if (chosenSets.length < setN && recs.length) chosenSets.push(recs[0]);
  while (chosenSets.length < setN) {
    const next = [...lists, ...recs].find((q) => !chosenSets.includes(q));
    if (!next) break; chosenSets.push(next);
  }
  // מנות: קודם המנות של ההמלצה המרומזת (בוחנים כל אחת בנפרד), אחר כך לא-נשאל, ⭐ קודם
  const rec = chosenSets.find((q) => q.kind === "rec");
  const must = rec ? rec.answer.filter((name) => dishes.some((d) => d.name === name)) : [];
  const rest = byFresh(dishes.filter((d) => !must.includes(d.name)), (d) => `dish:${d.name}`)
    .sort((a, b) => (rank(`dish:${b.name}`) === -1) - (rank(`dish:${a.name}`) === -1) || (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
  const dishNames = [...must, ...rest.map((d) => d.name)].slice(0, Math.max(dishN, must.length));
  const cards = [
    ...(rec ? [{ kind: "rec", set: rec }] : []),
    ...dishNames.map((name) => ({ kind: "dish", name })),
    ...chosenSets.filter((q) => q !== rec).map((q) => ({ kind: q.kind, set: q })),
  ];
  return { cards, asked: cards.map((c) => (c.kind === "dish" ? `dish:${c.name}` : c.set.id)) };
}

// עדכון מחזור ה"נשאל": אחרי ישיבה (עברה או נכשלה). כשהבנק כולו כבר נראה — מתחילים סבב
// חדש מהישיבה הזו (אחרת "לא נראה" לעולם לא מתרוקן ואין מה להעדיף).
export function nextSeen(seen, asked, bankIds) {
  const merged = [...seen.filter((id) => !asked.includes(id)), ...asked];
  const all = new Set(bankIds);
  const coveredAll = [...all].every((id) => merged.includes(id));
  return coveredAll ? [...asked] : merged.filter((id) => all.has(id));
}

// ── ניקוד שאלת-סט: סט מדויק, בחירה שגויה יקרה מפספוס (FP_COST כמו בוחן הקטגוריה) ──
export function scoreSet(answer, selected, FP_COST = 1.5) {
  const S = new Set(answer), sel = new Set(selected);
  const correct = [...sel].filter((x) => S.has(x)).length;
  const missed = [...S].filter((x) => !sel.has(x)).length;
  const wrong = [...sel].filter((x) => !S.has(x)).length;
  const denom = correct + missed + FP_COST * wrong;
  const score = denom ? correct / denom : (S.size === 0 ? 1 : 0);
  const lvl = score >= 0.999 ? 2 : score >= 0.5 ? 1 : 0;
  return { score, lvl, correct, missed, wrong };
}
