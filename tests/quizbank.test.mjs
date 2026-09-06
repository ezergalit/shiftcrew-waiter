// ══ הרכב הבוחן (יותם, 6.9) — הכללים שאסור שיישברו ══
//   node tests/quizbank.test.mjs
import { quizSize, setCountFor, buildSetQuestions, composeQuiz, nextSeen, scoreSet, examPlan, catForms, veganSafe, suggestDish, resolveDish, scoreNamed } from "../src/lib/quizBank.js";

let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log("🔴", msg); } };

// 1. גודל הישיבה — הדוגמאות המילוליות של יותם
ok(quizSize(12) === 7, "12 ראשונות ⇒ 7");
ok(quizSize(7) === 5, "7 סלטים ⇒ 5");
ok(quizSize(4) === 4 && quizSize(3) === 3 && quizSize(2) === 2, "4 ומטה ⇒ הכל");
ok(quizSize(9) === 5 && quizSize(10) === 6 && quizSize(16) === 10, "9⇒5 · 10⇒6 · 16⇒10 (60%)");
ok(quizSize(5) === 4 && quizSize(8) === 6, "5⇒4 · 8⇒6 (70%)");
ok(setCountFor(12, 5) === 2 && setCountFor(7, 5) === 1 && setCountFor(4, 5) === 1 && setCountFor(12, 0) === 0, "1-2 שאלות-סט, 0 כשאין בנק");

// 2. בנק שאלות-סט על קטגוריה סינתטית
const D = (name, o = {}) => ({ name, category: "ראשונות", ingredients: ["אורז"], allergens: [], pregnancy: [], pitfalls: [], ...o });
const cat = [
  D("סשימי ילוטייל", { ingredients: ["ילוטייל", "אבוקדו", "פונזו"], allergens: ["סויה"], pregnancy: ["דג נא"] }),
  D("סקוורס", { ingredients: ["סלמון", "אבוקדו", "טוביקו"], allergens: ["סויה"], pregnancy: ["דג נא"] }),
  D("שרימפס טמפורה", { ingredients: ["שרימפס", "טמפורה", "איולי"], allergens: ["גלוטן", "ביצים", "רכיכות"], pitfalls: ["מיונז"] }),
  D("נאמס צמחוני", { ingredients: ["ירקות", "אטריות אורז"], allergens: [], pitfalls: ["כוסברה"] }),
  D("אדממה", { ingredients: ["אדממה", "מלח"], allergens: ["סויה"] }),
];
const sets = buildSetQuestions(cat, "ראשונות");
const byId = Object.fromEntries(sets.map((q) => [q.id, q]));
// קהל רחב (יותם, 6.9): צליאק · לקטוז · טבעוני · לא/כן דג נא — ולא סויה/שומשום
ok(!sets.some((q) => /סויה|שומשום|ביצים|רכיכות/.test(q.ask)), "אין שאלת סט על סויה/שומשום/ביצים/רכיכות");
ok(byId["set:celiac"]?.answer.length === 4 && /צליאקי \(שלא אוכל גלוטן\)/.test(byId["set:celiac"].ask) && /ציין את כל המנות שאתה מכיר/.test(byId["set:celiac"].ask), "צליאק ⇒ 4 מנות בלי גלוטן, «ציין את כל המנות שאתה מכיר»");
ok(byId["set:vegan"]?.answer.join() === ["נאמס צמחוני", "אדממה"].join() && /טבעוני/.test(byId["set:vegan"].ask), "טבעוני: נאמס + אדממה בלבד");
ok(byId["set:no-raw"]?.answer.length === 3 && byId["set:raw"]?.answer.length === 2 && /שלא אוכל דג נא/.test(byId["set:no-raw"].ask) && /שרוצה דג נא/.test(byId["set:raw"].ask), "דג נא: לא אוכל 3 / רוצה 2");
ok(!byId["set:lactose"], "אין לקטוז בקטגוריה ⇒ אין שאלת לקטוז");
ok(!sets.some((q) => q.answer.length === cat.length || q.answer.length === 0), "אין שאלה שהתשובה שלה הכל/כלום");
ok(sets.filter((q) => q.kind === "list").every((q) => q.need === null), "סט ≤4 ⇒ ציין את כל המנות שאתה מכיר (need=null)");
// הרמז מצביע על סקוורס + סשימי ילוטייל (בנתונים האלה «אבוקדו» לבדו כבר מצמצם לשתיים — הזוג נשמר לתפריט שבו אבוקדו נפוץ)
const hinted = sets.find((q) => q.kind === "rec" && q.answer.length === 2 && q.answer.includes("סקוורס") && q.answer.includes("סשימי ילוטייל"));
ok(!!hinted && hinted.ask === "לקוח מבקש המלצה למנה עם אבוקדו מהראשונות — על מה תמליץ? ציין את כל המנות שאתה מכיר", `רמז ⇒ סקוורס + סשימי ילוטייל, ניסוח לקוח (${hinted?.ask})`);
// רמז = מרכיב-כותרת אחד (יותם): לא רוטב, לא צמד מרכיבים
ok(!sets.some((q) => q.kind === "rec" && /פונזו|איולי|טוביקו|מיונז| ו[א-ת]/.test(q.ask.replace(/ על מה תמליץ.*/, ""))), "אין רמז על רוטב ואין רמז של שני מרכיבים");
ok(!sets.some((q) => q.id === "rec:שרימפס") && !sets.some((q) => q.id === "rec:ילוטייל"), "רמז ששם המנה מסגיר («ילוטייל» ⇒ סשימי ילוטייל) לא נשאל");
const rolls = buildSetQuestions([
  D("רול וולקנו", { category: "רולים מיוחדים", ingredients: ["טונה אדומה", "ספייסי מיונז", "מלפפון"], allergens: ["ביצים"], pitfalls: ["חריף"] }),
  D("רול הבית", { category: "רולים מיוחדים", ingredients: ["טונה אדומה", "אבוקדו"], allergens: [] }),
  D("ספייסי טונה רול", { category: "רולים מיוחדים", ingredients: ["ספייסי טונה", "מלפפון"], allergens: [] }),
  D("סלמון קריספי", { category: "רולים מיוחדים", ingredients: ["סלמון", "שבבי טמפורה", "ספייסי מיונז"], allergens: ["גלוטן", "ביצים"] }),
  D("ירקות", { category: "רולים מיוחדים", ingredients: ["מלפפון", "גזר", "אבוקדו"], allergens: [] }),
], "רולים מיוחדים");
const tuna = rolls.find((q) => q.id === "rec:טונה");
ok(tuna && tuna.answer.length === 3 && tuna.ask === "לקוח מבקש המלצה לרול מיוחד עם טונה מתוך ״רולים מיוחדים״ — על מה תמליץ? ציין את כל המנות שאתה מכיר", `«רול מיוחד עם טונה» ⇒ 3 רולים (${tuna?.ask})`);
ok(!rolls.some((q) => /מטוגן|אפוי|מהגריל/.test(q.ask)), "ברולים אין סגנון הכנה («רול עם טונה מטוגן» אינו בקשה)");
const mains = buildSetQuestions([
  D("סלמון מיסו", { category: "עיקריות", ingredients: ["פילה סלמון", "מיסו"], desc: "פילה סלמון אפוי בתנור עם מיסו" }),
  D("סלמון בגריל", { category: "עיקריות", ingredients: ["פילה סלמון", "לימון"], desc: "פילה סלמון צלוי על הגריל" }),
  D("סלמון קריספי", { category: "עיקריות", ingredients: ["פילה סלמון", "פנקו"], desc: "סלמון מטוגן בציפוי פנקו" }),
  D("סלמון טרטר", { category: "עיקריות", ingredients: ["סלמון", "אבוקדו"], desc: "סלמון נא קצוץ", pregnancy: ["דג נא"] }),
  D("סלמון בשמנת", { category: "עיקריות", ingredients: ["סלמון", "שמנת"], desc: "פסטה עם סלמון ושמנת" }),
  D("שניצל", { category: "עיקריות", ingredients: ["חזה עוף", "פנקו"], desc: "חזה עוף מטוגן" }),
  D("צ'יפס", { category: "עיקריות", ingredients: ["תפוחי אדמה"], desc: "צ'יפס מטוגן" }),
], "עיקריות");
ok(mains.some((q) => /עם סלמון אפוי/.test(q.ask) && q.answer.join() === "סלמון מיסו") && mains.some((q) => /עם סלמון מהגריל/.test(q.ask)), `סלמון רחב (5) ⇒ מצומצם בסגנון: «סלמון אפוי», «סלמון מהגריל» (${mains.filter((q) => q.kind === "rec").map((q) => q.ask.replace(/ מהעיקריות.*/, "")).join(" | ")})`);
ok(mains.some((q) => /^לקוח מבקש משהו מטוגן מהעיקריות/.test(q.ask) && q.answer.length === 3), "«לקוח מבקש משהו מטוגן מהעיקריות» ⇒ 3 (סגנון בלבד, ניסוח לקוח)");
ok(!mains.some((q) => /עם עוף מטוגן|צ'יפס/.test(q.ask)), "אין «עוף מטוגן» כשיש עוף אחד (הרמז הפשוט «עם עוף» מספיק)");
ok(!rolls.some((q) => /מיונז|מלפפון|טמפורה/.test(q.ask)), "מיונז/מלפפון/טמפורה לעולם לא רמז");
ok(!rolls.some((q) => q.id === "rec:ספייסי טונה"), "«ספייסי טונה» ⇒ «ספייסי טונה רול» — השם מסגיר, לא נשאל");
// מילים קצרות שלמות בלבד: «כבדי» (וויסקי כבד) אינו «כבד אווז»; «מנגולד» אינו «מנגו»
const wl = buildSetQuestions([
  D("ארדבג", { category: "וויסקי", ingredients: ["כבדי", "מעושן"] }), D("גלנליווט", { category: "וויסקי", ingredients: ["קליל", "פירותי"] }),
  D("מגורו ניגירי", { category: "וויסקי", ingredients: ["כבד אווז", "אורז"] }), D("סלט הגינה", { category: "וויסקי", ingredients: ["מנגולד", "לימון"] }),
], "וויסקי");
ok(!wl.some((q) => /כבדי|מנגולד|כבד/.test(q.ask)), "«כבדי»/«מנגולד»/«כבד אווז» אינם בקשות של לקוח — אין רמז");
ok(sets.every((q) => !q.ask.includes("הGreek")), "ניסוח");
ok(catForms("Greek Oven Breads").catIn === "המנות ב״Greek Oven Breads״" && catForms("ראשונות").catIn === "הראשונות" && catForms("ילדים").catIn === "מנות הילדים" && catForms("אינסייד אאוט").catFrom === "מתוך ״אינסייד אאוט״", "צורות קטגוריה (שתי מילים ⇒ ציטוט)");
ok(veganSafe({ name: "טופו", ingredients: ["טופו"], allergens: [] }) === true && veganSafe({ name: "x", ingredients: [] }) === null, "גלאי טבעוני: כן / לא-ידוע");

// 3. הרכבה: 12 מנות ⇒ 7 כרטיסים (5 מנות + 2 סט), המנות של הרמז נכנסות
const twelve = Array.from({ length: 12 }, (_, i) => D(`מנה ${i + 1}`, { ingredients: [`מרכיב${i}`, "אבוקדו"], allergens: i % 2 ? ["גלוטן"] : ["סויה"], pregnancy: i < 2 ? ["דג נא"] : [] }));
const sets12 = buildSetQuestions(twelve, "ראשונות");
const celiac12 = sets12.find((q) => q.id === "set:celiac");
ok(celiac12 && celiac12.need === 3 && celiac12.answer.length === 6 && /תמליץ ללקוח צליאקי \(שלא אוכל גלוטן\) על 3 מנות מהראשונות/.test(celiac12.ask), "סט גדול ⇒ «תמליץ על 3 מנות מהראשונות»");
const seeded = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const q1 = composeQuiz({ dishes: twelve.map((d) => ({ name: d.name })), sets: sets12, seen: [], rand: seeded });
ok(q1.cards.length === 7, `12 מנות ⇒ 7 כרטיסים (יצא ${q1.cards.length})`);
ok(q1.cards.filter((c) => c.kind === "dish").length === 5 && q1.cards.filter((c) => c.kind !== "dish").length === 2, "5 מנות + 2 סט");
const recCard = q1.cards.find((c) => c.kind === "rec");
if (recCard) ok(recCard.set.answer.every((name) => q1.cards.some((c) => c.kind === "dish" && c.name === name)), "המנות של הרמז נבחנות בנפרד באותה ישיבה");
// 4. בלי חזרה: הישיבה הבאה שונה
const bankIds = [...twelve.map((d) => `dish:${d.name}`), ...sets12.map((s) => s.id)];
const seen = nextSeen([], q1.asked, bankIds);
const q2 = composeQuiz({ dishes: twelve.map((d) => ({ name: d.name })), sets: sets12, seen, rand: seeded });
ok(!sets12.some((q) => /מרכיב\d|אבוקדו ו/.test(q.ask)), "מרכיב שאינו בקשה של לקוח אינו רמז");
// מנות של הרמז המרומז חייבות להיבחן איתו — הן החריג היחיד לחזרה
const rec2 = q2.cards.find((c) => c.kind === "rec");
ok(q2.cards.filter((c) => c.kind === "dish" && !(rec2 && rec2.set.answer.includes(c.name))).every((c) => !q1.asked.includes(`dish:${c.name}`)), "מלצר שנכשל לא מקבל את אותן מנות בישיבה הבאה");
ok(q2.cards.filter((c) => c.kind !== "dish").every((c) => !q1.asked.includes(c.set.id)), "וגם לא את אותן שאלות-סט");
// מחזור: אחרי שכל הבנק נראה — מתחילים מחדש (לא נתקעים בלי «לא נראה»)
const full = nextSeen(bankIds.slice(0, -1), bankIds, bankIds);
ok(full.length === bankIds.length && bankIds.every((id) => full.includes(id)), "כיסוי מלא ⇒ סבב חדש מהישיבה האחרונה");
// 5. ניקוד סט: מדויק = מלא; לסמן הכל = חלקי/כלום
ok(scoreSet(["א", "ב"], ["א", "ב"]).lvl === 2, "סט מדויק ⇒ מלא");
ok(scoreSet(["א", "ב"], ["א"]).lvl === 1, "פספוס אחד ⇒ חלקי");
ok(scoreSet(["א", "ב"], ["א", "ב", "ג", "ד", "ה", "ו"]).lvl === 0, "לסמן הכל ⇒ 0 (בחירה שגויה יקרה)");
// 5א. כתיבה חופשית (יותם, 6.9): השלמה רק כשקרובים למנה; פענוח סלחני לטעות אות; «3 מתוך»
const pool = ["סשימי ילוטייל כמהין", "שרימפס טמפורה טוגראשי", "סקוורס", "נאמס צמחוני", "נאמס פרגית", "גיוזה פרגית", "אדממה"];
ok(suggestDish(pool, "ס").length === 0 && suggestDish(pool, "סשימי").length === 0, "«ס»/«סשימי» לא משלימים לסשימי ילוטייל");
ok(suggestDish(pool, "סשימי ילוו")[0] === "סשימי ילוטייל כמהין", "«סשימי ילוו» ⇒ סשימי ילוטייל כמהין");
ok(suggestDish(pool, "נאמס").length === 0 && suggestDish(pool, "נאמס צמ")[0] === "נאמס צמחוני", "«נאמס» דו-משמעי ⇒ כלום; «נאמס צמ» ⇒ נאמס צמחוני");
ok(resolveDish(pool, "ילווטייל") === "סשימי ילוטייל כמהין" && resolveDish(pool, "סקוורס") === "סקוורס" && resolveDish(pool, "שרימפס טמפורה") === "שרימפס טמפורה טוגראשי", "פענוח: מילה מהשם עם טעות אות · מדויק · בלי המילה האחרונה");
ok(resolveDish(pool, "נאמס") === null && resolveDish(pool, "פיצה") === null, "דו-משמעי / לא קיים ⇒ null");
ok(scoreNamed(["א", "ב", "ג", "ד", "ה"], ["א", "ב", "ג"], 3).lvl === 2, "3 מתוך 5 נכונות ⇒ מלא");
ok(scoreNamed(["א", "ב", "ג", "ד", "ה"], ["א", "ב", null], 3).lvl === 0 && scoreNamed(["א", "ב", "ג", "ד", "ה"], ["א", "ב", "ג", "ז"], 3).lvl === 1, "שם לא מזוהה / שם מחוץ לסט מורידים");
ok(scoreNamed(["א", "ב"], ["א", "ב"]).lvl === 2 && scoreNamed(["א", "ב"], ["א", "ב", "ב"]).lvl === 2, "ציין את כל המנות שאתה מכיר: מדויק ⇒ מלא, כפילות לא מענישה");
// 6. המבחן המלא: 12 ראשונות + 6 עיקריות ⇒ פי 2, סה"כ 40
const plan = examPlan({ "ראשונות": 12, "עיקריות": 6, "סלטים": 6, "מרקים": 4, "ווק": 4, "ילדים": 5, "מאקי": 7 }, 40);
const tot = Object.values(plan).reduce((a, b) => a + b, 0);
ok(tot === 40, `סה"כ 40 (יצא ${tot})`);
ok(Math.abs(plan["ראשונות"] - 2 * plan["עיקריות"]) <= 1, `ראשונות פי 2 מעיקריות, עד עיגול (${plan["ראשונות"]} מול ${plan["עיקריות"]})`);
ok(Object.entries(plan).every(([c, k]) => k <= ({ "ראשונות": 12, "עיקריות": 6, "סלטים": 6, "מרקים": 4, "ווק": 4, "ילדים": 5, "מאקי": 7 })[c]), "אף קטגוריה לא מקבלת יותר ממה שיש בה");
// מכסה קשיחה: size=1 עם רמז של 2 מנות ⇒ עדיין כרטיס אחד; size=3 ⇒ בדיוק 3
const capped = composeQuiz({ dishes: twelve.map((d) => ({ name: d.name })), sets: sets12, seen: [], rand: seeded, size: 3 });
ok(capped.cards.length === 3, `מכסת מבחן קשיחה (size 3 ⇒ ${capped.cards.length})`);
const one = composeQuiz({ dishes: twelve.map((d) => ({ name: d.name })), sets: sets12, seen: [], rand: seeded, size: 1 });
ok(one.cards.length === 1, `size 1 ⇒ כרטיס אחד (יצא ${one.cards.length})`);
const small = examPlan({ "א": 2, "ב": 2 }, 40);
ok(small["א"] === 2 && small["ב"] === 2, "תפריט קטן ממכסה ⇒ כל המנות, לא יותר");

console.log(fail ? `\n🔴 ${fail} כשלים` : "quizbank.test: כל הבדיקות עברו");
process.exit(fail ? 1 : 0);
