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
  // שתי מילים ומעלה ⇒ ציטוט: «מהרולים מיוחדים» / «מהאינסייד אאוט» אינם עברית
  if (latin || words.length >= 2) return { catIn: `המנות ב״${cat}״`, catFrom: `מתוך ״${cat}״` };
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

// ── מה לקוח באמת מבקש (יותם, 6.9): «אף אחד לא יבקש מנה ראשונה עם אטריות זכוכית — לפחות לא
// בתדירות ששווה ללמוד». רמז = משפחת חלבון (טונה/סלמון/דג/בשר/עוף/פירות ים…) או מרכיב-בקשה
// נפוץ (אבוקדו/בטטה/פטריות/טופו/חציל), לבד או עם סגנון (חריף · אפוי · בגריל · מטוגן · נא):
// «רול מיוחד עם טונה», «סלמון אפוי», «משהו חריף מהראשונות». לא כמהין, לא פיסטוק, לא אטריות.
// ⚠️ `norm` מקפל אותיות סופיות — כל הרשימות עוברות דרכו.
// ⚠️ ספציפי לפני כללי: סט שנתפס כ«סלמון» לא ייקרא «דג» (דדופ לפי הסט)
const FAMILIES = [
  ["טונה", ["טונה"]], ["סלמון", ["סלמון"]], ["ילוטייל", ["ילוטייל", "המאצ"]], ["לברק", ["לברק"]], ["דניס", ["דניס"]],
  ["שרימפס", ["שרימפס", "שרימפ"]],
  ["טופו", ["טופו"]], ["אבוקדו", ["אבוקדו"]], ["בטטה", ["בטטה"]], ["פטריות", ["פטרי", "שיטאקי", "שימג"]], ["חציל", ["חציל"]],
  ["עוף", ["עוף", "פרגית"]],
  ["בשר", ["בקר", "סינטה", "אנטריקוט", "פילה בקר", "אסאדו", "טלה", "כבש", "המבורגר", "קבב", "בשר", "עגל", "ברווז"]],
  ["פירות ים", ["שרימפס", "שרימפ", "קלמארי", "תמנון", "סרטן", "צדפ", "מולים", "פירות ים", "סקאלופ"]],
  ["דג", ["דג", "דגים", "טונה", "סלמון", "ילוטייל", "המאצ", "לברק", "דניס", "מוסר", "בקלה", "אנשובי", "סרדינ", "פילה דג", "דג לבן"]],
].map(([label, words]) => [label, words.map(norm)]);
const EXACT_ONLY = new Set(["בס", "דג"].map(norm));                       // «בס» ≠ בסיס · «דג» ≠ דגן
const FISH_EXACT = ["בס"].map(norm);
const PROTEIN = new Set(["טונה", "סלמון", "ילוטייל", "לברק", "דניס", "דג", "שרימפס", "פירות ים", "בשר", "עוף"]);
// «קרם חציל», «רוטב צדפות», «ציר בקר» — נושא, לא המנה: לא מכניסים למשפחה
const CARRIER = /^(קרם|רוטב|ממרח|קציפת|ציר|אבקת|שמן|מרק|שבבי|פירורי)\b/;
const wordHits = (tokens, words) => words.some((w) => tokens.some((t) => (EXACT_ONLY.has(w) ? t === w : t.startsWith(w))));
// המנה שייכת למשפחה לפי המרכיבים השאילים והשם (לא לפי התיאור — «מוגש לצד דג» אינו מנת דג)
function inFamily(d, words) {
  const toksOf = (s) => norm(String(s || "")).split(/[\s,/]+/).filter(Boolean);
  const ings = askableIngredients(d).filter((x) => !CARRIER.test(norm(x)));
  const pool = [...ings.flatMap(toksOf), ...toksOf(d.name)];
  return wordHits(pool, words) || (words === FAMILY_FISH && wordHits(pool, FISH_EXACT));
}
const FAMILY_FISH = FAMILIES.find(([l]) => l === "דג")[1];
// סגנון: מהדגלים או ממילות ההכנה שבתיאור של המסעדה
// ⚠️ מילות ההכנה עוברות norm (אותיות סופיות) לפני שנעשות regex — /מטוגן/ מילולי לא תופס «מטוגנ»
const descHas = (d, words) => { const t = norm(String(d.desc || "")); return words.map(norm).some((w) => t.includes(w)); };
const STYLES = [
  { key: "חריף", test: (d) => (d.pitfalls || []).includes("חריף"), phrase: (unit, atom) => atom ? `ל${unit} חריף עם ${atom}` : `משהו חריף` },
  { key: "אפוי", test: (d) => descHas(d, ["אפוי", "בתנור", "אפויה", "אפויים", "אפייה"]), phrase: (unit, atom) => atom ? `ל${unit} עם ${atom} אפוי` : `משהו אפוי` },
  { key: "בגריל", test: (d) => descHas(d, ["גריל", "צלוי", "צלויה", "על האש", "פחמים", "צלייה"]), phrase: (unit, atom) => atom ? `ל${unit} עם ${atom} מהגריל` : `משהו מהגריל` },
  { key: "מטוגן", test: (d) => descHas(d, ["מטוגן", "מטוגנת", "מטוגנים", "טמפורה", "טיגון"]), phrase: (unit, atom) => atom ? `ל${unit} עם ${atom} מטוגן` : `משהו מטוגן` },
  { key: "נא", test: (d) => (d.pregnancy || []).some((p) => /נא/.test(p)), phrase: (unit, atom) => atom ? `ל${unit} עם ${atom} נא` : null },
];

// ── בנק שאלות-סט לקטגוריה (בלי AI) ──────────────────────────────────────────
// כל שאלה: { id, kind: "list"|"rec", ask, answer: string[] (שמות מנות), why: {name: reason} }
// נבנית רק כשהתשובה היא **חלק** מהקטגוריה (לא כולן ולא אף אחת) — אחרת אין מה לדעת.
export function buildSetQuestions(items, catLabel, opts = {}) {
  // כרטיסי ידע ומסלולי אירוע (המרכיבים שלהם הם מנות) אינם מנות — אין עליהם שאלות-סט
  const dishes = (items || []).filter((d) => !d.knowledge && !d.event && d.name);
  const n = dishes.length;
  if (n < 2) return [];
  if (dishes.every((d) => d.drink)) return [];                    // משקאות: ההרכב של 31.8, לא כאן
  const cat = String(catLabel || dishes[0].category || "").trim() || "המנות";
  const { catIn, catFrom } = catForms(cat);
  const out = [];
  const partial = (S) => S.length >= 1 && S.length <= n - 1;
  const names = (S) => S.map((d) => d.name);
  // need: null = «ציין את כולן» (סט קטן), 3 = «תמליץ על 3» (סט גדול) — יותם: «תמליץ ללקוח על 3 ראשונות בלי לקטוז»
  const push = (id, kind, ask, S, why, need = null) => { if (partial(S)) out.push({ id, kind, ask, answer: names(S), why, need }); };

  // ── 1-4. סיטואציות לקהל הרחב (יותם, 6.9): «רוב הלקוחות לא אכפת להם מסויה ברוטב —
  // לכוון לצליאק, לקטוז, טבעוני, ומי שלא/כן אוכל דג נא». המלצר ממליץ (הרשימה הבטוחה),
  // חוץ מ«רוצה דג נא» שהיא הרשימה שמכילה. סט של יותר מ-4 ⇒ «תמליץ על 3», אחרת «ציין את כולן».
  const declared = dishes.filter((d) => (d.allergens || []).length).length;
  const tagged = declared >= Math.ceil(n * 0.7);          // בלי תיוג אין «בטוח» — לא ממליצים על מנה שהאלרגיות שלה לא מולאו
  const hasA = (d, a) => (d.allergens || []).includes(a);
  const rawFish = (d) => (d.pregnancy || []).some((p) => /דג נא/.test(p));
  const vs = dishes.map((d) => veganSafe(d));
  // כשרות (יותם, 6.9): «תמליץ על המנות הראשונות הכשרות / על 3 עיקריות כשרות» — רק כשהקטגוריה
  // מתויגת (≥70%) ויש בה מנה לא-כשרה; מסעדה שכולה כשרה (סלון) לא מקבלת את השאלה מעצמה.
  const NOT_KOSHER = /לא כשר|פירות ים|בשר וחלב/;
  const kTag = (d) => (d.kashrut || []).length > 0;
  const kosher = (d) => kTag(d) && !(d.kashrut || []).some((k) => NOT_KOSHER.test(k));
  const kTagged = dishes.filter(kTag).length >= Math.ceil(n * 0.7);
  const meatOrFish = (d) => inFamily(d, FAMILY_FISH) || inFamily(d, FAMILIES.find(([l]) => l === "פירות ים")[1]) || inFamily(d, FAMILIES.find(([l]) => l === "בשר")[1]) || inFamily(d, FAMILIES.find(([l]) => l === "עוף")[1]);
  const AUDIENCE = [
    { id: "kosher", who: "לקוח ששומר כשרות", on: kTagged && dishes.some((d) => (d.kashrut || []).some((k) => NOT_KOSHER.test(k))), ok: kosher, why: (d) => (kosher(d) ? `כשרה${(d.kashrut || []).length ? ` (${(d.kashrut || []).join(", ")})` : ""}` : kTag(d) ? `לא כשרה — ${(d.kashrut || []).filter((k) => NOT_KOSHER.test(k)).join(", ")}` : "כשרות לא מסומנת") },
    { id: "celiac", who: "לקוח צליאקי (שלא אוכל גלוטן)", on: tagged && dishes.some((d) => hasA(d, "גלוטן")), ok: (d) => !hasA(d, "גלוטן"), why: (d) => (hasA(d, "גלוטן") ? "מכילה גלוטן" : "בלי גלוטן") },
    { id: "lactose", who: "לקוח שרגיש ללקטוז", on: tagged && dishes.some((d) => hasA(d, "לקטוז")), ok: (d) => !hasA(d, "לקטוז"), why: (d) => (hasA(d, "לקטוז") ? "מכילה לקטוז" : "בלי לקטוז") },
    { id: "vegan", who: "לקוח טבעוני", on: vs.every((v) => v !== null), ok: (_, i) => vs[i], why: (_, i) => (vs[i] ? "טבעונית" : "לא טבעונית") },
    { id: "veggie", who: "לקוח צמחוני", on: dishes.every((d) => (d.ingredients || []).length), ok: (d) => !meatOrFish(d), why: (d) => (meatOrFish(d) ? "יש בה בשר/דג" : "צמחונית") },
    { id: "no-raw", who: "לקוח שלא אוכל דג נא", on: dishes.some(rawFish), ok: (d) => !rawFish(d), why: (d) => (rawFish(d) ? "יש דג נא" : "בלי דג נא") },
    { id: "raw", who: "לקוח שרוצה דג נא", on: dishes.some(rawFish), ok: rawFish, why: (d) => (rawFish(d) ? "יש דג נא" : "אין דג נא") },
  ];
  // ⚠️ ההתאמה למסעדה היא מהנתונים: שאלה נבנית רק כשבקטגוריה יש גם «כן» וגם «לא» (`partial`),
  // ולכן מסעדה כשרה לא תראה שאלת כשרות ומסעדה בשרית לא תראה לקטוז — בלי הגדרה. `opts.off`
  // (features.quiz_off) הוא המתג הידני מעל זה.
  const off = new Set(opts.off || []);
  for (const a of AUDIENCE) {
    if (!a.on || off.has(a.id)) continue;
    const S = dishes.filter((d, i) => a.ok(d, i));
    const why = Object.fromEntries(dishes.map((d, i) => [d.name, a.why(d, i)]));
    const big = S.length > 4;
    const ask = big ? `תמליץ ל${a.who} על 3 מנות ${catFrom}` : `אילו מנות ${catFrom} תמליץ ל${a.who}? ציין את כל המנות שאתה מכיר`;
    push(`set:${a.id}`, "list", ask, S, why, big ? 3 : null);
  }
  // 5. שיתוף (יותם: «בסלון יבקשו המלצה ל-5 מאזטים»): קטגוריה שנאכלת יחד ⇒ «תמליץ על 5» — כל 5
  //    מנות מהקטגוריה נכונות; הידע הוא השמות. לא עובר דרך `partial` — התשובה היא כל הקטגוריה.
  if (!off.has("share") && /מאזט|מזה|מזטים|טאפס|לשיתוף|meze|mezze|tapas/i.test(cat) && n >= 6) {
    out.push({ id: "set:share5", kind: "list", ask: `שולחן מבקש שתמליץ על 5 מנות ${catFrom} — על אילו תמליץ?`, answer: names(dishes), why: Object.fromEntries(dishes.map((d) => [d.name, "מהקטגוריה"])), need: 5 });
  }
  // 6. המלצה מרומזת — משפחת חלבון / מרכיב-בקשה נפוץ, לבד או עם סגנון; 1-4 מנות (5-8 ⇒ «תמליץ על 3»)
  const unit = /קוקטייל/.test(cat) ? "קוקטייל" : /מיוחד/.test(cat) ? "רול מיוחד" : /רול|מאקי|אינסייד/.test(cat) ? "רול" : "מנה";
  const extra = (opts.guestAsks || []).map((w) => [w, [norm(w)]]);
  const recs = [];
  const seen = new Set();
  const key = (S) => S.map((d) => d.name).sort().join("|");
  const consider = (atom, style, S) => {
    if (!S.length || S.length > 8 || seen.has(key(S))) return;
    seen.add(key(S));
    recs.push({ atom, style, S });
  };
  const roll = /רול/.test(unit);
  // סגנון הכנה (אפוי/גריל/מטוגן/נא) רק על חלבון ורק מחוץ לרולים — «רול עם טונה מטוגן» ו«אבוקדו אפוי» אינם בקשה
  const styleFits = (st, atom) => !off.has(`style:${st.key}`) && (st.key === "חריף" || (!roll && (atom == null || PROTEIN.has(atom))));
  const obviousSingle = (S, atom) => S.length === 1 && atom && norm(S[0].name).includes(norm(atom));   // «מנה עם ילוטייל» ⇒ סשימי ילוטייל
  for (const [atom, words] of [...FAMILIES, ...extra]) {
    const S = dishes.filter((d) => inFamily(d, words));
    if (!S.length || obviousSingle(S, atom)) continue;
    if (S.length <= 4) { consider(atom, null, S); continue; }
    // סגנון מוסיף ידע (איזה סלמון אפוי) — לכן «סלמון אפוי ⇒ סלמון מיסו» נשאר גם כשהשם מכיל סלמון
    for (const st of STYLES) { if (!styleFits(st, atom) || (st.key === "נא" && atom === "דג")) continue; const S2 = S.filter(st.test); if (S2.length >= 1 && S2.length <= 4) consider(atom, st, S2); }
    if (S.length <= 8) consider(atom, null, S);                 // רחב ⇒ «תמליץ על 3»
  }
  for (const st of STYLES) {                                     // סגנון בלבד: «משהו חריף מהראשונות»
    if (!st.phrase(unit, null) || !styleFits(st, null)) continue;
    const S = dishes.filter(st.test);
    if (S.length >= 1 && S.length <= 8 && S.length < n) consider(null, st, S);
  }
  // עד 8 לקטגוריה; קודם רמזים ממוקדים (1-4), אחר כך רחבים
  recs.sort((a, b) => (a.S.length <= 4 ? 0 : 1) - (b.S.length <= 4 ? 0 : 1) || b.S.length - a.S.length);
  for (const r of recs) {
    if (out.filter((q) => q.kind === "rec").length >= 8) break;
    const what = r.atom ? (r.style ? r.style.phrase(unit, r.atom) : `ל${unit} עם ${r.atom}`) : r.style.phrase(unit, null);
    const lead = r.atom ? `לקוח מבקש המלצה ${what}` : `לקוח מבקש ${what}`;                     // «לקוח מבקש משהו חריף מהראשונות»
    const big = r.S.length > 4;
    const ask = big ? `${lead} ${catFrom} — תמליץ על 3` : `${lead} ${catFrom} — על מה תמליץ?${r.S.length >= 2 ? " ציין את כל המנות שאתה מכיר" : ""}`;
    const why = Object.fromEntries(r.S.map((d) => [d.name, `${r.atom ? `יש ${r.atom}` : ""}${r.atom && r.style ? " · " : ""}${r.style ? r.style.key : ""}`]));
    push(`rec:${r.atom ? norm(r.atom) : ""}${r.style ? "+" + r.style.key : ""}`, "rec", ask, r.S, why, big ? 3 : null);
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
  // במכסת מבחן רמז נבחר רק אם הוא והמנות שלו נכנסים בה (רמז של 2 מנות במכסה של 1 ⇒ 41)
  const recFits = (q) => size == null || 1 + q.answer.filter((name) => dishes.some((d) => d.name === name)).length <= N;
  const recsFit = recs.filter(recFits);
  const chosenSets = [];
  if (setN >= 1 && lists.length) chosenSets.push(lists[0]);
  if (chosenSets.length < setN && recsFit.length) chosenSets.push(recsFit[0]);
  while (chosenSets.length < setN) {
    const next = [...lists, ...recsFit].find((q) => !chosenSets.includes(q));
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
  // מכסת מבחן היא קשיחה («שהכל ייכנס ב-40»): הרמז מוסיף את המנות שלו מעבר ל-dishN, אז
  // מורידים קודם שאלת-סט מהסוף, ואז את המנה האחרונה שאינה של הרמז
  if (size != null) while (cards.length > N && cards.length > 1) {
    const li = cards.map((c) => c.kind).lastIndexOf("list");
    if (li > 0) { cards.splice(li, 1); continue; }
    const di = cards.map((c, k) => (c.kind === "dish" && !must.includes(c.name) ? k : -1)).filter((k) => k >= 0).pop();
    if (di == null) break;
    cards.splice(di, 1);
  }
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

// ── שאלת-סט בכתיבה חופשית (יותם, 6.9): «הוא צריך לכתוב אותן בעצמו בחיפוש חופשי; בחיפוש
// רק מנות מהקטגוריה, ורק אם הוא ממש קרוב למנה — «ס» לא משלים לסשימי ילוטייל, «סשימי ילוו» כן» ──
const nk = (s) => norm(String(s || "")).replace(/[״"'׳]/g, "").replace(/\s+/g, " ").trim();
const squash = (s) => nk(s).replace(/ /g, "");
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// «קרוב למנה» = תחילית (עם טעות אחת מ-8 אותיות) שמכסה לפחות חצי מהשם. פחות מ-4 אותיות ⇒ כלום.
const closePrefix = (query, name) => {
  const q = squash(query), nn = squash(name);
  if (q.length < 4 || !nn) return false;
  if (q.length / nn.length < 0.5) return false;
  return lev(q, nn.slice(0, q.length)) <= (q.length >= 8 ? 1 : 0);
};
export function suggestDish(pool, query, limit = 3) {
  return (pool || []).filter((name) => closePrefix(query, name)).slice(0, limit);
}
// פענוח מה שנכתב לשם מנה מהקטגוריה: מדויק ⇒ תחילית קרובה (יחידה) ⇒ מילים שלמות מתוך השם
// (יחידה, ≥4 אותיות) ⇒ כל השם עם עד 2 טעויות. דו-משמעי או רחוק ⇒ null (נספר כטעות).
export function resolveDish(pool, text, dishes = null) {
  const names = pool || [];
  const t = nk(text); if (!t) return null;
  const byCard = () => {
    // «פסטה שמנת» ⇒ «פסטה ילדים» (הכרטיס מונה שמנת/רוזה/עגבניות): מילה אחת מהשם + השאר מהכרטיס
    // (יותם, 6.9: «האלגוריתם צריך לזהות תשובה דומה או משמעות»). רק כשההתאמה יחידה.
    if (!dishes?.length) return null;
    const tw = t.split(" ").filter((w) => w.length >= 2 && !/^(או|עם|של|את|ה)$/.test(w));
    if (tw.length < 2) return null;
    const sim = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1);
    const hits = dishes.filter((d) => {
      const nw = nk(d.name).split(" ").filter(Boolean);
      const cw = nk(`${d.desc || ""} ${(d.ingredients || []).join(" ")}`).split(" ").filter(Boolean);
      return tw.some((w) => nw.some((n) => sim(n, w))) && tw.every((w) => nw.some((n) => sim(n, w)) || cw.some((c) => sim(c, w)));
    });
    return hits.length === 1 ? hits[0].name : null;
  };
  const exact = names.find((n) => nk(n) === t); if (exact) return exact;
  const pre = names.filter((n) => closePrefix(t, n)); if (pre.length === 1) return pre[0];
  const tw = t.split(" ").filter((w) => w.length >= 2);
  if (tw.length && t.replace(/ /g, "").length >= 4) {
    // מילה «דומה»: זהה · תחילית (≥4) · טעות אחת במילה של ≥5 אותיות («ילווטייל» ⇒ «ילוטייל»)
    const similar = (x, w) => x === w || (w.length >= 4 && x.startsWith(w)) || (w.length >= 5 && lev(x, w) <= 1);
    const inner = names.filter((n) => { const ws = nk(n).split(" "); return tw.every((w) => ws.some((x) => similar(x, w))); });
    if (inner.length === 1) return inner[0];
  }
  const q = squash(text);
  if (q.length >= 8) { const near = names.filter((n) => lev(q, squash(n)) <= 2); if (near.length === 1) return near[0]; }
  return byCard();
}
// ניקוד: need=null ⇒ סט מדויק (scoreSet); need=3 ⇒ 3 מנות מתוך הסט — כל שם שלא מתוך הסט
// (או שלא זוהה) מוריד כמו בחירה שגויה. שם שחוזר על עצמו נספר פעם אחת.
export function scoreNamed(answer, resolved, need = null, FP_COST = 1.5) {
  const S = new Set(answer);
  const hits = [...new Set(resolved.filter((r) => r && S.has(r)))];
  const wrong = resolved.filter((r) => !r || !S.has(r)).length;
  const correct = need == null ? hits.length : Math.min(hits.length, need);
  const missed = need == null ? S.size - hits.length : Math.max(0, need - hits.length);
  const denom = correct + missed + FP_COST * wrong;
  const score = denom ? correct / denom : 1;
  return { score, lvl: score >= 0.999 ? 2 : score >= 0.5 ? 1 : 0, correct: hits.length, missed, wrong, need };
}

// ── המרכיב שבשם המנה (יותם, 6.9): «אנשובי במלח» — אם המלצר כותב «אנשובי» ומקבל «לא הצלחת», יש
// בעיה. השם לא מזכה ולא מוריד (free), אבל השאלה חייבת להגיד את זה בקול: «תאר את המנה ואת כל
// המרכיבים שיש בה — מעבר לאנשובי שבשם». המרכיב הראשון שכל מילותיו יושבות בשם. ──────────────
export function nameIngredient(dish) {
  const nameT = new Set(String(dish?.name || "").split(/[\s,/״"']+/).map(norm).filter((w) => w.length >= 2));
  for (const ing of dish?.ingredients || []) {
    const ws = String(ing).split(/[\s,/]+/).map(norm).filter((w) => w.length >= 2);
    if (ws.length && ws.every((w) => nameT.has(w) || [...nameT].some((n) => n.length >= 4 && (n.startsWith(w) || w.startsWith(n))))) return ing;
  }
  return null;
}

// ── «איך מטובלת המנה?» (יותם, 6.9): כשמה שנשאר מעבר לשם הוא תיבול/רוטב/קישוט («אנשובי במלח»:
// שמן זית, בצל, צ'ילי, צלפים) — השאלה היא איך מטבלים ומגישים, לא «מה יש בה». ─────────────
const DRESSING = ["שמן", "לימון", "ליים", "שום", "בצל", "צ'ילי", "צילי", "צלפים", "עשבי", "פטרוזיליה", "כוסברה", "נענע", "שמיר", "בזיליקום",
  "אורגנו", "זעתר", "סומק", "פפריקה", "כמון", "פלפל", "מלח", "חומץ", "חרדל", "סחוג", "אריסה", "צנונית", "צנוניות", "שומשום", "ג'ינג'ר",
  "גינגר", "וסאבי", "טחינה", "יוגורט", "סויה", "פונזו", "טריאקי", "דבש", "סילאן", "רוטב", "תיבול", "תבלין", "קונפי", "לבנה", "מיונז", "איולי"].map(norm);
const isDressing = (ing) => String(ing || "").split(/[\s,/]+/).map(norm).some((w) => DRESSING.some((d) => w === d || (d.length >= 4 && w.startsWith(d))));
/** { nameIng, dressing } — dressing = יש מרכיב בשם וכל היעדים שנשארו הם תיבול/רוטב/קישוט */
export function questionStyle(dish, targets = null) {
  const nameIng = nameIngredient(dish);
  const rest = (targets ? targets.map((t) => t.t) : (dish?.ingredients || [])).filter((x) => norm(x) !== norm(nameIng || ""));
  return { nameIng, dressing: !!nameIng && rest.length > 0 && rest.every(isDressing) };
}
