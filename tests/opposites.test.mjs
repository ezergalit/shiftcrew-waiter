// Run: node tests/opposites.test.mjs — a contradictory taste guess costs the mark.
import { grade, setMenuVocab } from "../src/lib/examEngine.js";
const q = {
  k: "recall", sit: "describe", dish: "רומן יווני",
  targets: [{ t: "וודקה" }, { t: "מתקתק", alt: ["מתוק"] }, { t: "פסיפלורה" }],
  free: ["קוקטייל", "פירותי", "לימון"],
  minOk: 2, maxInv: 1,
};
setMenuVocab([{ name: "רומן יווני", category: "קוקטיילים", desc: "מתקתק", ingredients: ["וודקה", "פסיפלורה"], }]);
let failures = 0;
const check = (n, c) => { if (c) console.log("  ✓ " + n); else { console.error("  ✗ " + n); failures++; } };
check("truth passes clean", grade(q, "וודקה, מתוק, פסיפלורה").lvl === 2);
check("adding a contradicting guess costs the mark", grade(q, "וודקה, מתוק מר, פסיפלורה").lvl < 2);
check("guess as its own chip also costs", grade(q, "וודקה, מתוק, מר").lvl < 2);
check("a true descriptor pair is not punished", grade(q, "וודקה, מתוק, פירותי").lvl === 2);
if (failures) process.exit(1);
console.log("all green");
