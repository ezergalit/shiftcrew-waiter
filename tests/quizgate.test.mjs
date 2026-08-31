// The quiz's two time gates, end to end without a browser.
// Run: node tests/quizgate.test.mjs
//
// The spec (user, 2026-08-31, replacing the flat 5/15 of 30.8):
//   "בהתאם לכמות המנות והתיאור בכרטיסיות… 3 מנות דקה וחצי, עשר 3 דקות,
//    עשרים 5 דקות — והמקסימום 5 דקות, גם אחרי כישלון."
// One scaled requirement serves both the first gate and the retry cooldown.
// Study minutes, not wall-clock — waiting opens nothing.

import { bumpStudy, noteFail, gateFor, requiredStudyS, PRE_STUDY_S } from "../src/lib/quizGate.js";



let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name}`); failures++; }
};

console.log("scaling anchors:");
const dishes = (n, len = 0) => Array.from({ length: n }, () => ({ desc: "א".repeat(len) }));
const mins = (n, len = 0) => requiredStudyS(dishes(n, len)) / 60;
const near = (a, b) => Math.abs(a - b) <= 0.25;
check("3 dishes ≈ a minute and a half", near(mins(3), 1.5));
check("10 dishes ≈ 3 minutes", near(mins(10), 3));
check("20 dishes = 5 minutes", mins(20) === 5);
check("40 dishes still capped at 5", mins(40) === 5);
check("wordy cards weigh more than bare ones", requiredStudyS(dishes(6, 600)) > requiredStudyS(dishes(6, 0)));
check("no items falls back to the classic 5 minutes", requiredStudyS(null) === PRE_STUDY_S);

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
check("retry needs the same scaled amount (5m fallback here)", afterFail.needS === PRE_STUDY_S);
bumpStudy(M, C, PRE_STUDY_S - 60);
check("a minute short is still closed", gateFor(M, C, {}).open === false);
check("one minute left", gateFor(M, C, {}).needMin === 1);
bumpStudy(M, C, 60);
check("the full amount reopens it", gateFor(M, C, {}).open === true);

console.log("second failure re-arms:");
noteFail(M, C);
check("closed again after a second fail", gateFor(M, C, {}).open === false);
bumpStudy(M, C, PRE_STUDY_S);
check("and reopens after fresh scaled study", gateFor(M, C, {}).open === true);

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
