// ══ בדיקת המאפיין של חוזה השופט (§3.4) ══
//   node tests/judge-contract.test.mjs
// הערובה: על 5000 תשובות-מודל אקראיות (כולל פסקי crit, id כפולים/חסרים, ראיה מומצאת),
//   1. שורות crit אחרי המיזוג **זהות** (אותה רפרנס, אותו status) לשורות crit שנשלחו.
//   2. פסק הבטיחות של הכרטיס אחרי המיזוג **זהה** לזה שלפני — המודל לעולם לא מבטל/מוסיף כשל בטיחות.
//   3. כל ראיה בפסק מאומת **מעוגנת** בתשובה או בצ'יפ (אפס הזיה שורדת).
//   4. כל foreign ⊂ (תשובה ∪ unknown).
import { verifyReply, mergeRows, safetyVerdict, evidenceGrounded } from "../src/lib/judge-contract.js";
import { toks } from "../src/lib/examEngine.js";

// --- מחולל דטרמיניסטי (בלי Math.random — seed מפורש) ---
let seed = 20260906;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const ING = ["ילוטייל", "פונזו כמהין", "אבוקדו", "מלפפון", "טמפורה", "סלמון", "טונה", "יוזו", "צ'ילי ירוק"];
const FLAGS = ["דג נא", "בשר נא", "גלוטן", "בוטנים"];
const WORDS = ["דג", "לבן", "נא", "חתוך", "דק", "רוטב", "הדרים", "יפני", "המאצ'י", "אבוקדו", "קרם", "מלפפון", "חריף"];
const FOREIGN = ["אסאדו", "פיסטוק", "בשר", "כמהין", "ריזוטו"];

function makeCase() {
  const nRows = 2 + Math.floor(rnd() * 6);
  const rows = [];
  for (let i = 0; i < nRows; i++) {
    const crit = chance(0.35);
    rows.push({
      id: (crit ? "safety:" : "row:") + i + ":" + pick(ING).slice(0, 4),
      label: "L" + i, kind: crit ? "desc" : pick(["desc", "ing"]),
      canonical: [crit ? pick(FLAGS) : pick(ING)], alt: chance(0.5) ? [pick(WORDS)] : [],
      status: pick(["miss", "part", "ok", "wrong"]), crit,
    });
  }
  const answer = Array.from({ length: 4 + Math.floor(rnd() * 10) }, () => pick(WORDS)).join(" ");
  const unknown = chance(0.5) ? [pick(["לימון יפני", "רוטב הדרים יפני", "דג לבן"])] : [];
  // תשובת-מודל אקראית — כולל id כפולים, id שלא נשלח, ראיה מומצאת, פסקים על crit
  const reply = { rows: [], foreign: [], flags: { abusive: chance(0.05), offtopic: chance(0.05) }, note: chance(0.5) ? "תגיד את זה בשם" : "" };
  const rowChoices = [...rows.map((r) => r.id), "ghost:99", rows.length ? rows[0].id : "x"];
  const nReply = Math.floor(rnd() * (nRows + 3));
  for (let i = 0; i < nReply; i++) {
    reply.rows.push({
      id: pick(rowChoices),
      verdict: pick(["supports", "contradicts", "neutral", "SUPPORTS", "bogus"]),
      // ראיה: לפעמים מתוך התשובה (מעוגנת), לפעמים מומצאת
      evidence: chance(0.5) ? answer.split(" ").slice(0, 2 + Math.floor(rnd() * 3)).join(" ") : pick([...FOREIGN, "מילה מומצאת לגמרי", ...unknown, ""]),
    });
  }
  for (let i = 0; i < Math.floor(rnd() * 3); i++) reply.foreign.push({ claim: chance(0.5) ? pick(FOREIGN) : pick(answer.split(" ")), why: "לא בכרטיס" });
  return { rows, answer, unknown, reply };
}

let fail = 0, n = 0;
const eqRow = (a, b) => a === b || (a.id === b.id && a.status === b.status && a.crit === b.crit);
for (let t = 0; t < 5000; t++) {
  const { rows, answer, unknown, reply } = makeCase();
  const verified = verifyReply({ rows, unknown, answer }, reply);
  const merged = mergeRows(rows, verified);
  n++;
  // 1. שורות crit זהות (רפרנס + status)
  const critBefore = rows.filter((r) => r.crit), critAfter = merged.filter((r) => r.crit);
  if (critBefore.length !== critAfter.length || !critBefore.every((r, i) => critAfter.includes(r) && eqRow(r, critAfter[i]))) { if (fail++ < 3) console.log("🔴 crit rows changed", t); }
  // 2. פסק הבטיחות זהה
  if (safetyVerdict(merged) !== safetyVerdict(rows)) { if (fail++ < 3) console.log("🔴 safety verdict changed", t, safetyVerdict(rows), "→", safetyVerdict(merged)); }
  // 3. כל ראיה מאומתת מעוגנת בתשובה או בצ'יפ
  for (const r of verified.rows) if (r.verdict !== "neutral" && !evidenceGrounded(r.evidence, toks(answer), unknown)) { if (fail++ < 3) console.log("🔴 ungrounded evidence survived:", r.evidence); }
  // 4. foreign מעוגן
  for (const f of verified.foreign) if (!evidenceGrounded(f.claim, toks(answer), unknown)) { if (fail++ < 3) console.log("🔴 ungrounded foreign:", f.claim); }
  // 5. אף פסק על crit לא הוחל (הכל ב-advisory)
  for (const r of verified.rows) { const row = rows.find((x) => x.id === r.id); if (row?.crit && r.verdict !== "neutral") { if (fail++ < 3) console.log("🔴 crit verdict applied", r.id); } }
}
console.log(fail ? `\n🔴 ${fail} כשלים ב-${n} מקרים` : `judge-contract.test: ${n} מקרים אקראיים — crit ובטיחות נשמרים תמיד, אפס ראיה מומצאת שרדה`);
process.exit(fail ? 1 : 0);
