// שכבת הצבעים פר-מסעדה — הבדיקה שמגנה על שלוש ההתחייבויות שלה.
import { buildTokens, THEME_BASE, THEME_SAFETY } from "../src/lib/theme.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("🔴", m); } };

const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  const [h, l] = x > y ? [x, y] : [y, x];
  return (h + 0.05) / (l + 0.05);
};

// 1. מסעדה בלי theme מקבלת **בדיוק** את הפלטה שהייתה קשיחה בקוד.
//    זו ההתחייבות שמאפשרת לשחרר את השכבה בלי לגעת באף מסעדה קיימת.
{
  const t = buildTokens(null);
  const want = {
    "--t-em": "#22c08c", "--t-em-ink": "#06231a", "--t-em-soft": "#15302b",
    "--t-bg": "#0c0d10", "--t-surface": "#16181c", "--t-line": "#22252b",
    "--t-ink": "#eef0f6", "--t-dim": "#8a8aa0", "--t-faint": "#5a5a6e",
    "--t-red": "#e0315a", "--t-red-soft": "#3a1d22",
    "--t-amber": "#f3c14b", "--t-amber-soft": "#33290f",
  };
  for (const [k, v] of Object.entries(want)) {
    ok(t[k] === v, `בלי theme ${k} = ${t[k]}, ציפינו ${v}`);
  }
  ok(buildTokens({}) ["--t-em"] === "#22c08c", "theme ריק = ברירת מחדל");
}

// 2. צבעי הבטיחות אינם ניתנים להחלפה — גם כשמנסים במפורש.
//    אדום=אלרגיה הוא ידע שהמלצר נבחן עליו, לא עיצוב.
{
  const t = buildTokens({ red: "#00ff00", "red-soft": "#00ff00", amber: "#00ff00", "amber-soft": "#00ff00" });
  ok(t["--t-red"] === THEME_SAFETY.red, "אדום האלרגיות זז");
  ok(t["--t-amber"] === THEME_SAFETY.amber, "ענבר המוקשים זז");
  ok(t["--t-red-soft"] === THEME_SAFETY.redSoft, "רקע האלרגיות זז");
}

// 3. הטקסט על צבע המותג תמיד קריא — גם על מותג בהיר, שבו "תמיד לבן" נכשל.
{
  const brands = ["#2563eb", "#facc15", "#7f1d1d", "#ffffff", "#000000", "#22c08c",
                  "#ff6ec7", "#00ffff", "#808080", "#f97316", "#4c1d95", "#84cc16"];
  for (const brand of brands) {
    const t = buildTokens({ brand });
    const r = ratio(t["--t-em"], t["--t-em-ink"]);
    ok(r >= 4.5, `מותג ${brand}: ניגודיות הטקסט עליו ${r.toFixed(2)} — מתחת ל-4.5`);
  }
}

// 4. ערך פגום לעולם לא מפיל ולא מדליף — נופל לברירת המחדל.
{
  for (const junk of [undefined, null, "", "זבל", "#12345", "#gggggg", 42, {}, []]) {
    const t = buildTokens({ brand: junk });
    ok(t["--t-em"] === THEME_BASE.brand, `קלט פגום ${JSON.stringify(junk)} לא נפל לברירת מחדל`);
  }
  ok(buildTokens("not an object")["--t-em"] === THEME_BASE.brand, "theme שאינו אובייקט");
}

// 5. כל טוקן נפלט גם כשלשת RGB — עליה נשענות 40 מחלקות עם שקיפות.
{
  const t = buildTokens({ brand: "#2563eb" });
  ok(t["--t-em-rgb"] === "37 99 235", `שלשת RGB שגויה: ${t["--t-em-rgb"]}`);
  for (const k of Object.keys(t).filter((k) => !k.endsWith("-rgb"))) {
    ok(typeof t[`${k}-rgb`] === "string", `חסרה שלשת RGB ל-${k}`);
  }
}

console.log(fail ? `\n🔴 ${fail} כשלים` : "theme.test: כל הבדיקות עברו");
process.exit(fail ? 1 : 0);
