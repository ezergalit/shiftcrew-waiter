// The quiz's two time gates, end to end without a browser.
// Run: node tests/quizgate.test.mjs
//
// The spec (user, 2026-08-30):
//   "מראש הוא צריך ללמוד 5 דקות כרטיסיות על מנת לפתוח בוחן"
//   "כאשר מלצר לא עבר את הבוחן הוא צריך ללמוד לפחות רבע שעה עד שיוכל לגשת שוב"
// Both are STUDY minutes, not wall-clock — waiting opens nothing.

import { bumpStudy, noteFail, gateFor, PRE_STUDY_S, RETRY_STUDY_S } from "../src/lib/quizGate.js";

let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name}`); failures++; }
};

const M = "member-1";
const C = "ראשונות";

console.log("fresh member:");
check("quiz closed before any study", gateFor(M, C, {}).open === false);
check("closed with reason 'pre'", gateFor(M, C, {}).reason === "pre");
check("needs the full 5 minutes", gateFor(M, C, {}).needS === PRE_STUDY_S);
check("a passed category is never gated", gateFor(M, C, { passed: true }).open === true);
check("no member id ⇒ open (gate cannot clock anyone)", gateFor(null, C, {}).open === true);

console.log("pre-study accrual:");
bumpStudy(M, C, PRE_STUDY_S - 1);
check("4:59 is not 5 minutes", gateFor(M, C, {}).open === false);
check("rounded minutes shown, not seconds", gateFor(M, C, {}).needMin === 1);
bumpStudy(M, C, 1);
check("5 full minutes open the quiz", gateFor(M, C, {}).open === true);

console.log("study is per category:");
check("another category still needs its own 5 minutes", gateFor(M, "עיקריות", {}).open === false);

console.log("failure cooldown:");
noteFail(M, C);
const afterFail = gateFor(M, C, {});
check("a fail closes the quiz again", afterFail.open === false);
check("with reason 'cooldown'", afterFail.reason === "cooldown");
check("needs the full 15 minutes", afterFail.needS === RETRY_STUDY_S);
bumpStudy(M, C, RETRY_STUDY_S - 60);
check("14 minutes later still closed", gateFor(M, C, {}).open === false);
check("one minute left", gateFor(M, C, {}).needMin === 1);
bumpStudy(M, C, 60);
check("15 study-minutes reopen it", gateFor(M, C, {}).open === true);

console.log("second failure re-arms:");
noteFail(M, C);
check("closed again after a second fail", gateFor(M, C, {}).open === false);
bumpStudy(M, C, RETRY_STUDY_S);
check("and reopens after 15 fresh minutes", gateFor(M, C, {}).open === true);

console.log("cooldown outranks pre-study:");
const M2 = "member-2";
bumpStudy(M2, C, 30);            // barely studied
noteFail(M2, C);                 // then failed (e.g. quiz unlocked by mastery on another device)
const g2 = gateFor(M2, C, {});
check("reason is cooldown, not pre", g2.reason === "cooldown");

console.log("members do not share clocks:");
check("member-1 stays open", gateFor(M, C, {}).open === true);
check("member-3 starts closed", gateFor("member-3", C, {}).open === false);

if (failures) { console.error(`\n${failures} failures`); process.exit(1); }
console.log("\nall green");
