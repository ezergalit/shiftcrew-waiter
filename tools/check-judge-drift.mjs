// שער דריפט: ה-SYSTEM של השופט חייב להיות זהה בלקוח (judge-contract.js) ובפונקציה
// (exam-judge/index.ts, SYSTEM_V5). הדריפט ריפו↔פרוס כבר קרה ב-menu-ai-parse — כאן
// לפחות מוודאים שהמקור בריפו עקבי. רץ ב-`npm run check` ⇒ גם ב-Vercel prebuild.
import { readFileSync } from "node:fs";
const contract = readFileSync(new URL("../src/lib/judge-contract.js", import.meta.url), "utf8");
const fn = readFileSync(new URL("../supabase/functions/exam-judge/index.ts", import.meta.url), "utf8");

const grab = (src, marker) => {
  const i = src.indexOf(marker); if (i < 0) return null;
  const open = src.indexOf("`", i); if (open < 0) return null;
  const close = src.indexOf("`", open + 1); if (close < 0) return null;
  return src.slice(open + 1, close);
};
const a = grab(contract, "export const SYSTEM =");
const b = grab(fn, "const SYSTEM_V5 =");
if (!a || !b) { console.error("🔴 check-judge-drift: could not locate a SYSTEM block"); process.exit(1); }
const normLines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
if (normLines(a) !== normLines(b)) {
  console.error("🔴 check-judge-drift: SYSTEM differs between src/lib/judge-contract.js and supabase/functions/exam-judge/index.ts");
  const la = normLines(a).split("\n"), lb = normLines(b).split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { console.error(`  line ${i + 1}:\n   contract: ${la[i] || "—"}\n   function: ${lb[i] || "—"}`); break; }
  process.exit(1);
}
console.log("check-judge-drift: SYSTEM זהה בלקוח ובפונקציה ✓");
