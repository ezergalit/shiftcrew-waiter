// ══ שאלות על המסעדה (יותם, 16.9, GDB) ══   node tests/houseQuestions.test.mjs
import { houseFor, gradeHouse, validHouse } from "../src/lib/houseQuestions.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("🔴", m); } };

// השאלות כפי שנכתבו ל-features.house_questions של GDB
const dairy = { id: "dairy-burger", cat: "המבורגר", ask: "איזה המבורגר אצלנו חלבי — ולמה?",
  points: [
    { t: "המבורגר GBD", any: ["GBD", "GDB", "ג'י בי די", "גיבידי"] },
    { t: "כיפת השום השחורה חלבית, ויש בו צ'דר וגאודה", any: ["כיפה", "כיפת שום", "שום שחור", "בריוש", "לחמניה", "לחמנייה", "צ'דר", "גאודה", "גבינה", "גבינות"] },
  ],
  bad: ["קלאסי", "פליאו", "RAYS", "רייז"] };
const vegan = { id: "vegan-meal", cat: "ארוחות", ask: "לקוח טבעוני רוצה ארוחה. על מה תמליץ לו?", need: 1,
  points: [{ t: "ארוחת RAYS או הארוחה הטבעונית", any: ["RAYS", "רייז", "ארוחה טבעונית", "המבורגר טבעוני", "בטטה", "בשר חדש", "בשר מהצומח"] }],
  bad: ["GBD", "GDB", "קלאסי", "פליאו", "כנפיים", "מח עצם", "קיסר"] };
const doneness = { id: "doneness", cat: "המבורגר", ask: "באיזו מידת עשייה מגיעים ה-GBD והקלאסי?",
  points: [{ t: "M — מדיום", any: ["M", "מדיום", "medium"] }] };
const noFries = { id: "gbd-fries", cat: "המבורגר", ask: "לקוח מזמין המבורגר GBD לבד. הוא מגיע עם צ'יפס?", need: 1,
  points: [{ t: "לא", any: ["לא", "בלי", "ללא"] }, { t: "מי שרוצה צ'יפס מזמין ארוחה", any: ["ארוחה", "ארוחת"] }] };
const bank = [dairy, vegan, doneness, noFries, { ask: "", points: [] }, null];

ok(houseFor(bank).length === 4, "שאלה ריקה/null מסוננות");
ok(houseFor(bank, { cat: "המבורגר" }).length === 3 && houseFor(bank, { cat: "קינוחים" }).length === 0, "סינון לפי קטגוריה");
ok(!validHouse({ ask: "x", points: [{ t: "y", any: [] }] }), "נקודה בלי ניסוחים אינה שאלה");

// איזה המבורגר חלבי ולמה
ok(gradeHouse(dairy, "GBD כי כיפת השום השחורה חלבית").lvl === 2, "שם + סיבה ⇒ מלא");
ok(gradeHouse(dairy, "המבורגר ג'י בי די, יש בו גבינת צ'דר וגאודה").lvl === 2, "תעתיק עברי + גבינות ⇒ מלא");
ok(gradeHouse(dairy, "gbd").lvl === 1, "רק השם ⇒ חלקי");
ok(gradeHouse(dairy, "הלחמנייה שלו חלבית").lvl === 1, "רק הסיבה ⇒ חלקי");
ok(gradeHouse(dairy, "הקלאסי").lvl === 0, "המבורגר שגוי ⇒ לא נכון");
ok(gradeHouse(dairy, "GBD בגלל הגבינות, והקלאסי גם").lvl === 1, "נכון + טעות בביטחון ⇒ חלקי");
ok(gradeHouse(dairy, "GBD בגלל הבריוש עם כיפת השום, ולא הקלאסי").lvl === 2, "«ולא הקלאסי» אינו טעות");
ok(gradeHouse(dairy, "").lvl === 0, "ריק ⇒ 0");

// ארוחה לטבעוני
ok(gradeHouse(vegan, "ארוחת RAYS עם צ'יפס").lvl === 2, "RAYS ⇒ מלא");
ok(gradeHouse(vegan, "הארוחה הטבעונית עם קציצת בטטה").lvl === 2, "הארוחה הטבעונית ⇒ מלא");
ok(gradeHouse(vegan, "רייז עם צ'יפס ולא סלט קיסר").lvl === 2, "«ולא סלט קיסר» ⇒ מלא");
ok(gradeHouse(vegan, "רייז עם סלט קיסר").lvl === 1, "סלט קיסר (פרמזן) ⇒ חלקי");
ok(gradeHouse(vegan, "משהו טבעוני").lvl === 0, "הד של השאלה ⇒ 0");
ok(gradeHouse(vegan, "ארוחה קלאסית").lvl === 0, "ארוחה קלאסית ⇒ 0");

// אות בודדת ומספר
ok(gradeHouse(doneness, "M").lvl === 2 && gradeHouse(doneness, "מדיום").lvl === 2, "«M» לבד נספר (toks מסנן אות אחת)");
ok(gradeHouse(doneness, "וול דאן").lvl === 0, "מידה אחרת ⇒ 0");

// need=1 — הנקודה השנייה היא בונוס
const nf = gradeHouse(noFries, "לא, רק בארוחה");
ok(nf.lvl === 2 && nf.hits.join() === "1,1", `«לא, רק בארוחה» ⇒ מלא (${nf.hits})`);
ok(gradeHouse(noFries, "לא").lvl === 2, "«לא» מספיק");
ok(gradeHouse(noFries, "כן").lvl === 0, "«כן» ⇒ 0");

console.log(fail ? `\n🔴 ${fail} כשלים` : "houseQuestions.test: כל הבדיקות עברו");
if (fail && typeof process !== "undefined") process.exitCode = 1;
