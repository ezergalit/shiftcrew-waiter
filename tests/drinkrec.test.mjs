// ══ שאלות ההמלצה של הבר — קטגוריה ממוזגת ══   node tests/drinkrec.test.mjs
//
// `kind` נגזר משם הקטגוריה, ולכן בקטגוריה שאיחדה כמה משקאות (יותם, 31.8: «קטן מ-5
// מתאחד עם קרובים») הוא שם אחד לכמה משקאות שונים. הצמדתו לפרט של משקה אחר יצרה
// «אורח אוהב וודקה ים-תיכוני» (הפרט של ג'ין מארה), «קוניאק רום לבן» ו«ערק או אוזו
// אוזו יווני». השער היה קיים לשאלה האחות («אילו X יש») ומעולם לא הוחל כאן.
import { readFileSync } from "node:fs";
import { generate } from "../src/lib/examEngine.js";
import { menuFromCards } from "../src/lib/examMenu.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("🔴", m); } };

for (const [label, f] of [["סלון", "menu-95F245"], ["סטודיו", "menu-S26TLV"]]) {
  const cards = JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`, import.meta.url), "utf8")).cards;
  const qs = generate(menuFromCards(cards));
  const recs = qs.filter((q) => q.sit === "drinkrec");

  // מילה שחוזרת פעמיים ברצף — «ערק או אוזו **אוזו** יווני»
  const doubled = recs.filter((q) => { const m = q.ask.match(/אוהב (\S+) (\S+)/); return m && m[1] === m[2]; });
  ok(doubled.length === 0, `${label}: מילה כפולה בניסוח — ${doubled.map((q) => q.ask).join(" | ")}`);

  // שם סוג שהודבק לפרט של משקה אחר
  const glued = [/וודקה ים-תיכוני/, /וודקה לונדון דריי/, /וודקה ג['׳]ין/, /קוניאק רום/, /קוניאק ליקר/];
  const bad = recs.filter((q) => glued.some((r) => r.test(q.ask)));
  ok(bad.length === 0, `${label}: סוג משקה שגוי בניסוח — ${bad.map((q) => q.ask).join(" | ")}`);

  // ולא נסגר יותר מדי: הקטגוריות הממוזגות עדיין נשאלות
  const merged = recs.filter((q) => /אילו .+ יש/.test(q.ask));
  if (label === "סלון") ok(merged.length >= 3, `סלון: הקטגוריות הממוזגות נשאלות בשם המלא (${merged.length})`);
  ok(recs.length > 20, `${label}: שאלות בר נבנות (${recs.length})`);
}

console.log(fail ? `\n🔴 ${fail} כשלים` : "drinkrec.test: כל הבדיקות עברו");
process.exit(fail ? 1 : 0);
