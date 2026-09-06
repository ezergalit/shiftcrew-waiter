// ══ ציון תשובות הבוטים — מלצרים-פרסונות שכתבו תשובות אמיתיות לשני התפריטים (יותם, 6.9) ══
//   node tools/grade-bots.mjs <answers-*.json …>
// לכל תשובה: תיאור (describeLeaf, mode desc — בלי שופט) · צ'יפי מרכיבים (grade) · אלרגיות (grade).
// תשובה הוגנת שקיבלה 0 = כשל · תשובה שגויה (bad) שקיבלה מלא = דליפה. הפלט מפורט כדי לקרוא בעין.
import { readFileSync } from "node:fs";
import { generate, grade, setMenuVocab } from "../src/lib/examEngine.js";
import { menuFromCards } from "../src/lib/examMenu.js";
import { buildRows, markRows, scoreRows } from "../src/lib/describeLeaf.js";

const files = process.argv.slice(2).filter((f) => !f.startsWith("-"));
const verbose = process.argv.includes("-v");
const menus = {};
for (const code of ["S26TLV", "95F245"]) {
  const fx = JSON.parse(readFileSync(new URL(`../tests/fixtures/menu-${code}.json`, import.meta.url), "utf8"));
  const menu = menuFromCards(fx.cards); setMenuVocab(menu);
  const bank = generate(menu);
  menus[code] = { cards: fx.cards, menu, bank };
}
const lvlName = ["✗", "◐", "✓"];
const tally = { fair: { desc: [0, 0, 0], ings: [0, 0, 0], alls: [0, 0, 0] }, bad: { desc: [0, 0, 0], ings: [0, 0, 0] } };
const issues = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(f, "utf8"));
  console.log(`\n══ ${data.persona} (${data.answers.length} תשובות)`);
  for (const a of data.answers) {
    const m = menus[a.code]; if (!m) continue;
    setMenuVocab(m.menu);
    const dish = m.cards.find((c) => c.name === a.dish);
    const q = m.bank.find((x) => x.sit === "describe" && x.dish === a.dish);
    const aq = m.bank.find((x) => x.sit === "allergens" && x.dish === a.dish);
    if (!dish || !q) { issues.push(`? ${a.code} ${a.dish}: לא נמצאה מנה/שאלה`); continue; }
    const descOf = (text) => scoreRows(markRows(buildRows(dish, null, { mode: "desc" }), text));
    const fairD = descOf(a.desc), fairI = grade(q, a.ings || []);
    const fairA = aq ? grade(aq, a.alls || []) : null;
    tally.fair.desc[fairD.lvl]++; tally.fair.ings[fairI.lvl]++; if (fairA) tally.fair.alls[fairA.lvl]++;
    const line = `${lvlName[fairD.lvl]}תיאור ${lvlName[fairI.lvl]}מרכיבים${fairA ? ` ${lvlName[fairA.lvl]}אלרגיות` : ""}`;
    const bad = a.bad || {};
    const badD = bad.desc ? descOf(bad.desc) : null, badI = bad.ings ? grade(q, bad.ings) : null;
    if (badD) tally.bad.desc[badD.lvl]++; if (badI) tally.bad.ings[badI.lvl]++;
    const flags = [];
    if (fairD.lvl === 0) flags.push(`תיאור הוגן ⇒ 0${fairD.safety ? " (בטיחות)" : ""}`);
    if (fairI.lvl === 0) flags.push("מרכיבים הוגנים ⇒ 0");
    if (fairI.wrong) flags.push(`מרכיב הוגן נחשב שגוי: ${fairI.detail.filter((d) => d.status === "wrong").map((d) => d.chip).join("/")}`);
    if (fairA && fairA.lvl === 0) flags.push("אלרגיות הוגנות ⇒ 0");
    if (badD && badD.lvl === 2) flags.push(`תיאור שגוי ⇒ מלא (${bad.why})`);
    if (badI && badI.lvl === 2) flags.push(`מרכיבים שגויים ⇒ מלא (${bad.why})`);
    if (flags.length || verbose) {
      console.log(`\n· ${a.dish} — ${line}${flags.length ? "   ⚠️ " + flags.join(" · ") : ""}`);
      if (flags.length || verbose) {
        console.log(`  תיאור: «${a.desc}»`);
        console.log(`  שורות: ${fairD.n ? markRows(buildRows(dish, null, { mode: "desc" }), a.desc).filter((r) => !r.crit).map((r) => `${r.canonical[0]}:${r.status}`).join(" · ") : "—"}${fairD.safety ? " · ⚠️ בטיחות חסרה" : ""}`);
        console.log(`  מרכיבים: ${fairI.detail.map((d) => `${d.chip}=${d.status}${d.credited?.length ? "→" + d.credited.join("/") : ""}`).join(" · ")} (יעדים: ${q.targets.map((t) => t.t).join(", ")})`);
        if (fairA) console.log(`  אלרגיות: ${fairA.detail.map((d) => `${d.chip}=${d.status}`).join(" · ")} (אמת: ${dish.allergens.join(", ")})`);
        if (badD) console.log(`  שגוי: «${bad.desc}» ⇒ ${lvlName[badD.lvl]} (${bad.why}) · מרכיבים שגויים ⇒ ${badI ? lvlName[badI.lvl] : "—"}`);
      }
    }
  }
}
const pct = (arr) => { const n = arr.reduce((a, b) => a + b, 0); return n ? `מלא ${Math.round(100 * arr[2] / n)}% · חלקי ${Math.round(100 * arr[1] / n)}% · אפס ${Math.round(100 * arr[0] / n)}% (${n})` : "—"; };
console.log(`\n══ סיכום`);
console.log(`הוגן — תיאור: ${pct(tally.fair.desc)}\nהוגן — מרכיבים: ${pct(tally.fair.ings)}\nהוגן — אלרגיות: ${pct(tally.fair.alls)}`);
console.log(`שגוי — תיאור: ${pct(tally.bad.desc)}\nשגוי — מרכיבים: ${pct(tally.bad.ings)}`);
for (const i of issues) console.log(i);
