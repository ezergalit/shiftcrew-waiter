#!/usr/bin/env node
// מייצר את src/theme.css — מיפוי כל מחלקת Tailwind עם הקס קשיח אל טוקן המסעדה.
//
// למה מחולל ולא קובץ כתוב ביד: יש ~1,000 מופעים ב-40+ צירופים של תחילית×צבע×
// שקיפות. רשימה שנכתבת ביד מתיישנת ברגע שמישהו מוסיף `bg-[#22c08c]/25`, והכשל
// שקט לגמרי — הצבע פשוט לא יתחלף אצל מסעדה עם theme. הרצה מחדש תופסת את זה.
//
// שימוש:  node tools/gen-theme-css.mjs          (כותב)
//         node tools/gen-theme-css.mjs --check  (נכשל אם הקובץ לא מעודכן — שער CI)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "theme.css");

// הקס ⇒ טוקן. רק צבעים שהם באמת חלק מהשפה; גוונים חד-פעמיים נשארים קשיחים.
const MAP = {
  "#22c08c": "em",
  "#06231a": "em-ink",
  "#15302b": "em-soft",
  "#e0315a": "red",
  "#3a1d22": "red-soft",
  "#f3c14b": "amber",
  "#33290f": "amber-soft",
  "#0c0d10": "bg",
  "#16181c": "surface",
  "#22252b": "line",
  "#eef0f6": "ink",
  "#8a8aa0": "dim",
  "#5a5a6e": "faint",
};

// תחילית Tailwind ⇒ המאפיין שהיא כותבת.
const PROP = {
  bg: "background-color",
  text: "color",
  border: "border-color",
  fill: "fill",
  ring: "--tw-ring-color",
  stroke: "stroke",
  from: "--tw-gradient-from",
  to: "--tw-gradient-to",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "src"));
const found = new Map(); // "bg|#22c08c|40" ⇒ true

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const re = /\b([a-z]+)-\[(#[0-9a-fA-F]{6})\](?:\/(\d{1,3}))?/g;
  let m;
  while ((m = re.exec(src))) {
    const [, prefix, rawHex, alpha] = m;
    const hex = rawHex.toLowerCase();
    if (!MAP[hex] || !PROP[prefix]) continue;
    // 🔴 בורר מחלקה ב-CSS הוא case-sensitive, ובקוד יש גם `text-[#EEF0F6]/80`
    // באותיות גדולות. אחסון לפי ההקס המנורמל היה פולט בורר קטן שלעולם לא תואם,
    // והצבע פשוט לא היה מתחלף — בלי שום שגיאה. שומרים את הכתיב כפי שהוא בקוד.
    found.set(`${prefix}|${rawHex}|${alpha || ""}`, hex);
  }
}

// בורח לפי כללי CSS: הסוגריים, הסולמית והלוכסן חייבים escape בשם מחלקה.
const cls = (prefix, hex, alpha) =>
  `.${prefix}-\\[\\${hex}\\]` + (alpha ? `\\/${alpha}` : "");

const rules = [...found.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, normHex]) => {
    const [prefix, hex, alpha] = key.split("|");
    const token = MAP[normHex];
    const value = alpha
      ? `rgb(var(--t-${token}-rgb) / ${Number(alpha) / 100})`
      : `var(--t-${token})`;
    // `:root` מוסיף ספציפיות (0,2,0) מול (0,1,0) של Tailwind — מנצח בלי !important,
    // בדיוק כמו מיפוי הסגול בצד הניהול.
    return `:root ${cls(prefix, hex, alpha)}{${PROP[prefix]}:${value}}`;
  });

const css = `/* ============================================================
   נוצר אוטומטית ע"י tools/gen-theme-css.mjs — אין לערוך ביד.
   ממפה כל מחלקת Tailwind עם הקס קשיח אל טוקן המסעדה (src/lib/theme.js).
   מסעדה בלי theme מקבלת בדיוק את הערך שהיה בקוד, ולכן זה ניטרלי.
   ${rules.length} כללים · ${Object.keys(MAP).length} צבעים
   ============================================================ */

${rules.join("\n")}
`;

if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(OUT, "utf8");
  } catch {
    /* הקובץ עוד לא נוצר */
  }
  if (cur !== css) {
    console.error("🔴 src/theme.css אינו מעודכן — הריצו: node tools/gen-theme-css.mjs");
    process.exit(1);
  }
  console.log(`theme.css מעודכן (${rules.length} כללים)`);
} else {
  writeFileSync(OUT, css);
  console.log(`נכתב src/theme.css — ${rules.length} כללים`);
}
