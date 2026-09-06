// ══ בסיס/נושא ניטרלי (יותם, 6.9): «לחם» בפינרלי, «אורז ואצה» בסושי — לא מזכה, לא מוריד ══
import { generate, grade, setMenuVocab } from "../src/lib/examEngine.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("🔴", m); } };
const menu = [
  { name: "פינרלי", category: "Greek Oven Breads", desc: "מאפה סירה יווני עם תרד, מנגולד, בצל מטוגן, פטה ואורגנו.", ingredients: ["תרד", "מנגולד", "בצל מטוגן", "גבינת פטה", "אורגנו"], allergens: ["גלוטן", "לקטוז"], pregnancy: [], pitfalls: [] },
  { name: "בייגל קולורי", category: "Greek Oven Breads", desc: "פריך ולוהט מוגש עם קציפת פטה וזעתר.", ingredients: ["קציפת פטה", "זעתר", "קרם לימונים כבושים", "קרם חציל מעושן"], allergens: ["גלוטן"], pregnancy: [], pitfalls: [] },
  { name: "מאקי סלמון ואבוקדו", category: "מאקי", desc: "רול קלאסי", ingredients: ["סלמון", "אבוקדו", "שומשום"], allergens: ["דגים"], pregnancy: ["דג נא"], pitfalls: [] },
  { name: "מאקי בטטה חם", category: "מאקי", desc: "רול חם", ingredients: ["בטטה", "טמפורה", "טריאקי"], allergens: ["גלוטן"], pregnancy: [], pitfalls: [] },
];
setMenuVocab(menu);
const bank = generate(menu);
const q = (name) => bank.find((x) => x.sit === "describe" && x.dish === name);
const truth = (x) => x.targets.map((t) => t.t);
for (const [name, extra] of [["פינרלי", ["לחם", "בצק"]], ["מאקי סלמון ואבוקדו", ["אורז", "אצה"]], ["מאקי בטטה חם", ["אורז", "נורי", "שמן"]]]) {
  const qq = q(name); if (!qq) { console.log("(אין שאלת תיאור ל", name, ")"); continue; }
  const a = grade(qq, truth(qq)), b = grade(qq, [...truth(qq), ...extra]);
  ok(a.lvl === b.lvl && b.wrong === a.wrong, `${name}: ${extra.join("+")} לא מוריד (${a.lvl}⇒${b.lvl}, wrong ${b.wrong})`);
  ok(b.detail.filter((d) => extra.includes(d.chip)).every((d) => d.status === "free"), `${name}: ${extra.join("+")} מסומנים «לא נספר ולא הוריד»`);
  const c = grade(qq, extra);
  ok(c.lvl === 0, `${name}: רק ${extra.join("+")} ⇒ 0 (לא מזכה)`);
}
console.log(fail ? `\n🔴 ${fail} כשלים` : "baseFree.test: כל הבדיקות עברו");
process.exit(fail ? 1 : 0);
