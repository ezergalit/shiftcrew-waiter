// צבעי המסעדה — נתון, לא קוד.
//
// עד היום כל צבע באפליקציה היה הקס קשיח ב-JSX (1,207 מופעים), ולכן מסעדה חדשה
// יכלה לקבל רק את האמרלד. כאן הצבעים הופכים למשתני CSS ש-`features.theme`
// קובע, ו-`src/aurora.css` ממפה אליהם את מחלקות ה-Tailwind הקיימות — בדיוק
// הדפוס שבו הסגול מופה ב-28.8, ומאותה סיבה: 1,207 עריכות הן דיף שסיכון
// הרגרסיה שלו גדול מהתועלת.
//
// ⚠️ מסעדה בלי `theme` מקבלת בדיוק את הערכים שהיו בקוד — זה הבסיס למטה, ולכן
// הוספת השכבה הזו אינה משנה פיקסל באף מסעדה קיימת.

// הבסיס = הפלטה של היום, מילה במילה.
const BASE = {
  brand: "#22c08c",
  brandInk: "#06231a",   /* טקסט על צבע המותג — כפי שהיה בקוד */
  brandSoft: "#15302b",  /* משטח רך בצבע המותג — כפי שהיה בקוד */
  bg: "#0c0d10",
  surface: "#16181c",
  line: "#22252b",
  ink: "#eef0f6",
  dim: "#8a8aa0",
  faint: "#5a5a6e",
};

// 🔴 צבעי הבטיחות אינם ניתנים להחלפה, בכוונה.
// המלצר לומד ש**אדום = אלרגיה** — זה חלק מהידע שהוא נבחן עליו, לא קישוט.
// מסעדה שתצבע אלרגיות בירוק תלמד את הצוות שלה הפוך מכל מסעדה אחרת, וברגע
// שמלצר עובר בין סניפים זה הופך לסיכון. לכן השלישייה קבועה בקוד.
const SAFETY = {
  red: "#e0315a",
  redSoft: "#3a1d22",
  amber: "#f3c14b",
  amberSoft: "#33290f",
};

const HEX = /^#?([0-9a-f]{6})$/i;

/** "#22c08c" ⇒ [34,192,140]; כל דבר אחר ⇒ null (ולא זריקה — ערך פגום ב-DB לא מפיל אפליקציה). */
function rgb(hex) {
  const m = HEX.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** בהירות יחסית לפי WCAG — הבסיס לכל חישוב ניגודיות כאן. */
function lum([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** יחס ניגודיות בין שני צבעים (1 עד 21). */
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

/** מיזוג לינארי, t=0 ⇒ a, t=1 ⇒ b. */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/**
 * הטקסט שיושב **על** צבע המותג.
 *
 * זה הלקח מ-Hueprint: לא בוחרים אותו ביד. מול כל צבע שהוא, אחד מ-max(לבן,שחור)
 * נותן לפחות 4.58:1 — ולכן תמיד יש פתרון, ולעולם לא נוצר כפתור עם טקסט בלתי
 * קריא גם אם המסעדה בחרה צהוב זוהר או כחול כהה.
 */
function onBrand(brand, ink, bg) {
  const cands = [ink, bg, [255, 255, 255], [6, 35, 26]];
  let best = cands[0];
  let bestR = 0;
  for (const c of cands) {
    const r = ratio(brand, c);
    if (r > bestR) {
      bestR = r;
      best = c;
    }
  }
  return best;
}

/**
 * בונה את כל סט הטוקנים מ-`features.theme`.
 * מחזיר מפה של שם-משתנה ⇒ ערך. יצוא נפרד כדי שגם סטודיו העיצוב בצד הניהול
 * יחשב בדיוק אותו דבר, ולא ייווצרו שתי אמיתות.
 */
export function buildTokens(theme) {
  const t = theme && typeof theme === "object" ? theme : {};
  const pick = (k) => rgb(t[k]) || rgb(BASE[k]);

  // כל טוקן נפלט **גם** כשלשת RGB, כי בקוד יש 40 מחלקות עם שקיפות
  // (`border-[#22c08c]/40`). הצורה `rgb(var(--t-em-rgb)/.4)` היא בדיוק מה
  // ש-Tailwind עצמו פולט, ולכן היא נתמכת בכל מקום שבו הפלט שלו כבר עובד —
  // בניגוד ל-`color-mix`, שדורש WKWebView חדש יותר.
  const triple = (c) => c.join(" ");

  const brand = pick("brand");
  const bg = pick("bg");
  const surface = pick("surface");
  const line = pick("line");
  const ink = pick("ink");
  const dim = pick("dim");
  const faint = pick("faint");

  const out = {};
  const put = (name, c) => {
    out[`--t-${name}`] = hex(c);
    out[`--t-${name}-rgb`] = triple(c);
  };

  put("em", brand);
  // הנגזרים מחושבים — אחרת מותג בהיר נותן טקסט בלתי קריא על הכפתור.
  //
  // ⚠️ אבל **רק כשהמותג באמת הוחלף.** על האמרלד המקורי החישוב מחזיר ‎#0c0d10
  // ו-‎#102d26, בזמן שבקוד כתובים ‎#06231a ו-‎#15302b — קרובים, ולא זהים. מסעדה
  // בלי theme הייתה מקבלת שינוי צבע קטן, וזה בדיוק מה שהשכבה הזו התחייבה לא
  // לעשות. לכן ברירת המחדל היא הערכים שהיו בקוד, והנגזרת נכנסת רק אם שינו.
  const stock = hex(brand).toLowerCase() === BASE.brand;
  put("em-ink", rgb(t["brandInk"]) || (stock ? rgb(BASE.brandInk) : onBrand(brand, ink, bg)));
  put("em-soft", rgb(t["brandSoft"]) || (stock ? rgb(BASE.brandSoft) : mix(bg, brand, 0.18)));
  put("bg", bg);
  put("surface", surface);
  put("line", line);
  put("ink", ink);
  put("dim", dim);
  put("faint", faint);
  put("red", rgb(SAFETY.red));
  put("red-soft", rgb(SAFETY.redSoft));
  put("amber", rgb(SAFETY.amber));
  put("amber-soft", rgb(SAFETY.amberSoft));
  return out;
}

/** מחיל את הצבעים על הדף. בטוח לקריאה חוזרת ולערך חסר. */
export function applyTheme(features) {
  if (typeof document === "undefined") return;
  const tokens = buildTokens(features?.theme);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
}

export const THEME_BASE = BASE;
export const THEME_SAFETY = SAFETY;
