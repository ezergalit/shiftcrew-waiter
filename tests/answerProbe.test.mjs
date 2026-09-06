// ══ בודק התשובות על שני התפריטים החיים (פיקסצ'רים) — 0 כשלים, 0 דליפות (יותם, 6.9) ══
//   node tests/answerProbe.test.mjs        רענון: node tools/menu-snapshot.mjs S26TLV 95F245
import { readFileSync } from "node:fs";
import { probeMenu } from "../tools/answer-probe.mjs";
let bad = 0;
for (const code of ["S26TLV", "95F245"]) {
  const fx = JSON.parse(readFileSync(new URL(`./fixtures/menu-${code}.json`, import.meta.url), "utf8"));
  const r = probeMenu(fx.cards, { code });
  console.log(`${code}: ${r.targets} מרכיבים · ${r.variants} ניסוחים · כשלים ${r.fails.length} · דליפות ${r.leaks.length} · דו-משמעי ${r.ambiguous.length}`);
  for (const f of [...r.fails, ...r.leaks].slice(0, 10)) console.log(`  🔴 [${f.path}] ${f.dish} · «${f.target || f.cat}» ⇐ «${f.answer}» ⇒ ${f.got}`);
  bad += r.fails.length + r.leaks.length;
}
console.log(bad ? `\n🔴 ${bad} כשלים` : "answerProbe.test: שני התפריטים נקיים");
process.exit(bad ? 1 : 0);
