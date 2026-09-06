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

// ── מרכיב-כותרת: מה שלקוח באמת מבקש בשולחן (יותם, 6.9) ─────────────────────────
// דגים, בשר, עיקריים צמחיים — או מרכיב שהמסעדה עצמה שמה בשם של מנה בקטגוריה. תיבול/רוטב/
// ציפוי לעולם לא («ספייסי מיונז» הוא המרכיב האמיתי, אבל אף אחד לא מבקש רול עם מיונז).
// ⚠️ `norm` מקפל אותיות סופיות (ם⇒מ, ן⇒נ) — לכן כל הרשימות עוברות דרכו, אחרת «קרם» לא תופס «קרמ».
const HEADLINE = ["טונה", "סלמון", "ילוטייל", "המאצ", "לברק", "דניס", "מוסר", "דג לבן", "שרימפס", "קלמארי", "תמנון", "סרטן", "צלופח",
  "אונאגי", "סקאלופ", "צדפ", "עוף", "פרגית", "בקר", "סינטה", "אנטריקוט", "פילה", "טלה", "כבש", "אסאדו", "ברווז", "המבורגר",
  "טופו", "אבוקדו", "פטרי", "שיטאקי", "חציל", "בטטה", "כמהין", "ארטישוק", "קינואה", "עדשים", "חומוס", "גבינ", "פטה", "בוראטה",
  "מוצרלה", "חלומי", "ביצה", "אננס", "תות", "שוקולד", "נודלס", "אטריות", "ראמן",
  "עגל", "ניוקי", "ריזוטו", "שעועית", "יוגורט", "אנשובי", "סרדינ", "קדאיף", "פיסטוק"].map(norm);
// מילה שלמה בלבד: «בס» (בסיס/בסגנון), «כבד» (כבדי = וויסקי כבד), «מנגו» (מנגולד)
const HEADLINE_EXACT = ["בס", "כבד", "מנגו"].map(norm);
const CONDIMENT_WORDS = ["מיונז", "רוטב", "סויה", "טריאקי", "פונזו", "שומשום", "שמן", "מלח", "פלפל", "סוכר", "לימון", "ליים", "בצל", "שום",
  "ג'ינג'ר", "גינגר", "וסאבי", "כוסברה", "פטרוזיליה", "נענע", "אורז", "אצה", "נורי", "טמפורה", "שבבי", "קראמבל", "ציפוי", "רסק", "חמאה",
  "שמנת", "קרם", "סילאן", "דבש", "חרדל", "קטשופ", "צ'ילי", "צילי", "יוזו", "טוביקו", "מסאגו", "איקורה", "תבלין", "עשבי", "ציר", "בסיס", "אבקת"].map(norm);
const isCondiment = (k) => CONDIMENT_WORDS.some((c) => k === c || k.startsWith(c + " ") || k.endsWith(" " + c) || k.includes(" " + c + " ") || k.startsWith(c) && c.length >= 4);
const headlineWord = (w) => HEADLINE.some((h) => w.startsWith(h)) || HEADLINE_EXACT.includes(w);
function isHeadline(ing) {
  const raw = String(ing || ""); if (/[()]|אופצי/.test(raw)) return false;          // «שרימפס בטמפורה (אופציה)»
  const k = norm(raw); if (k.length < 3 || isCondiment(k)) return false;
  return k.split(" ").filter(Boolean).some(headlineWord);
}

// ── בנק שאלות-סט לקטגוריה (בלי AI) ──────────────────────────────────────────
// כל שאלה: { id, kind: "list"|"rec", ask, answer: string[] (שמות מנות), why: {name: reason} }
// נבנית רק כשהתשובה היא **חלק** מהקטגוריה (לא כולן ולא אף אחת) — אחרת אין מה לדעת.
export function buildSetQuestions(items, catLabel) {
  // כרטיסי ידע ומסלולי אירוע (המרכיבים שלהם הם מנות) אינם מנות — אין עליהם שאלות-סט
  const dishes = (items || []).filter((d) => !d.knowledge && !d.event && d.name);
  const n = dishes.length;
  if (n < 2) return [];
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
  const AUDIENCE = [
    { id: "kosher", who: "לקוח ששומר כשרות", on: kTagged && dishes.some((d) => (d.kashrut || []).some((k) => NOT_KOSHER.test(k))), ok: kosher, why: (d) => (kosher(d) ? `כשרה${(d.kashrut || []).length ? ` (${(d.kashrut || []).join(", ")})` : ""}` : kTag(d) ? `לא כשרה — ${(d.kashrut || []).filter((k) => NOT_KOSHER.test(k)).join(", ")}` : "כשרות לא מסומנת") },
    { id: "celiac", who: "לקוח צליאקי (שלא אוכל גלוטן)", on: tagged && dishes.some((d) => hasA(d, "גלוטן")), ok: (d) => !hasA(d, "גלוטן"), why: (d) => (hasA(d, "גלוטן") ? "מכילה גלוטן" : "בלי גלוטן") },
    { id: "lactose", who: "לקוח שרגיש ללקטוז", on: tagged && dishes.some((d) => hasA(d, "לקטוז")), ok: (d) => !hasA(d, "לקטוז"), why: (d) => (hasA(d, "לקטוז") ? "מכילה לקטוז" : "בלי לקטוז") },
    { id: "vegan", who: "לקוח טבעוני", on: vs.every((v) => v !== null), ok: (_, i) => vs[i], why: (_, i) => (vs[i] ? "טבעונית" : "לא טבעונית") },
    { id: "no-raw", who: "לקוח שלא אוכל דג נא", on: dishes.some(rawFish), ok: (d) => !rawFish(d), why: (d) => (rawFish(d) ? "יש דג נא" : "בלי דג נא") },
    { id: "raw", who: "לקוח שרוצה דג נא", on: dishes.some(rawFish), ok: rawFish, why: (d) => (rawFish(d) ? "יש דג נא" : "אין דג נא") },
  ];
  for (const a of AUDIENCE) {
    if (!a.on) continue;
    const S = dishes.filter((d, i) => a.ok(d, i));
    const why = Object.fromEntries(dishes.map((d, i) => [d.name, a.why(d, i)]));
    const big = S.length > 4;
    const ask = big ? `תמליץ ל${a.who} על 3 מנות ${catFrom}` : `אילו מנות ${catFrom} תמליץ ל${a.who}? ציין את כל המנות שאתה מכיר`;
    push(`set:${a.id}`, "list", ask, S, why, big ? 3 : null);
  }
  // 5. המלצה מרומזת (יותם, 6.9): «לקוח מבקש המלצה לרול מיוחד עם טונה אדומה, או ספייסי טונה —
  //    אף אחד לא יבקש רול עם טונה וספייסי מיונז». רמז = **מרכיב-כותרת אחד** (דג/בשר/עיקרי, או
  //    מרכיב שמופיע בשם של מנה בקטגוריה) שמצביע על 1-4 מנות. רוטב/תיבול לעולם לא רמז, שני
  //    מרכיבים לעולם לא. «חריף» מצטרף רק כדי לצמצם רמז רחב מדי («רול חריף עם סלמון»).
  const unit = /קוקטייל/.test(cat) ? "קוקטייל" : /מיוחד/.test(cat) ? "רול מיוחד" : /רול|מאקי|אינסייד/.test(cat) ? "רול" : "מנה";
  const headlineOf = (d) => askableIngredients(d).filter(isHeadline);
  const index = new Map();                                     // atomKey → { label, set: dish[] }
  dishes.forEach((d) => { for (const x of headlineOf(d)) { const k = norm(x); const e = index.get(k) || { label: x, set: [] }; if (!e.set.includes(d)) e.set.push(d); index.set(k, e); } });
  const recs = [];
  for (const [, e] of index) {
    if (e.set.length <= 4) { recs.push({ atom: e.label, S: e.set, hot: false }); continue; }
    const hot = e.set.filter((d) => (d.pitfalls || []).includes("חריף"));
    if (hot.length >= 1 && hot.length <= 4) recs.push({ atom: e.label, S: hot, hot: true });
  }
  // רמז ששם המנה מסגיר («ילוטייל» ⇒ סשימי ילוטייל) אינו ידע — נשמר רק כשלפחות מנה אחת
  // בסט לא נושאת אותו בשם. סטים גדולים קודם (2 מנות > מנה אחת), ורק רמז שמכסה מנה חדשה; עד 8.
  // מסגיר = השם מכיל את הרמז, או את מילת-הכותרת שבו («פילה סלמון» ⇒ «סלמון מיסו» מסגיר)
  const obvious = (d, atom) => { const n = norm(d.name); const a = norm(atom); return n.includes(a) || a.split(" ").some((w) => headlineWord(w) && n.split(" ").some((nw) => nw.startsWith(w) || w.startsWith(nw) && nw.length >= 3)); };
  const covered = new Set();
  recs.sort((a, b) => b.S.length - a.S.length);
  for (const r of recs) {
    if (out.filter((q) => q.kind === "rec").length >= 8) break;
    if (r.S.every((d) => obvious(d, r.atom))) continue;
    if (r.S.every((d) => covered.has(d.name))) continue;
    r.S.forEach((d) => covered.add(d.name));
    const ask = `לקוח מבקש המלצה ל${unit}${r.hot ? " חריף" : ""} עם ${r.atom} ${catFrom} — על מה תמליץ?${r.S.length >= 2 ? " ציין את כל המנות שאתה מכיר" : ""}`;
    push(`rec:${norm(r.atom)}${r.hot ? "+חריף" : ""}`, "rec", ask, r.S, Object.fromEntries(r.S.map((d) => [d.name, `יש ${r.atom}${r.hot ? " וחריף" : ""}`])));
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
export function resolveDish(pool, text) {
  const names = pool || [];
  const t = nk(text); if (!t) return null;
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
  return null;
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
