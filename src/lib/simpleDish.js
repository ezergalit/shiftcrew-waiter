// ══ מנות פשוטות — שואלים רק מה שרלוונטי (יותם, 6.9) ══
//
// «יש מנות פשוטות יותר — המבורגר ילדים, פסטה ילדים, פיש קידס — שלא צריך לסבך אותן. בשאלות
// כאלו צריך לכוון למה שכן רלוונטי, ואפשר ממש לראות בתיאור המנה: בלקיחת ההזמנה — בהמבורגר
// לשאול על מידת עשייה, ירקות ורטבים; כמה גרם ההמבורגר. 2 שאלות. לעשות את זה מבחן קל.»
//
// הכל נגזר מתיאור המנה של המסעדה עצמה (בלי לנחש):
//   · «בלקיחת ההזמנה: …»  ⇒ «מה צריך לשאול או להגיד ללקוח בלקיחת ההזמנה?» — כל פריט = נקודה
//   · «120 גרם»            ⇒ «כמה גרם בשר יש במנה?» — מספר; קרוב (±25%) = חלקי עם תיקון
//   · «2 יח'» / «4 יחידות» ⇒ «כמה יחידות מגיעות?»
//   · «לכל 2 סועדים»       ⇒ «כמה נמליץ לשולחן של 8?» — «אחד לכל 3» או «אחד לכל אחד» = חלקי + תיקון
// מנה פשוטה = קטגוריית ילדים/לחמים, או עד 2 מרכיבים שאילים. השאלות האלה מחליפות את
// «תמליץ ותאר»+אלרגיות של המנה (יותם: «מיותר לשאול על אלרגיות בבייגל»). אפס AI.
import { norm, toks } from "./examEngine.js";
import { askableIngredients } from "./questionEngine.js";

// «רטבים» = «רוטב», «העשייה» = «עשייה»: קילוף אות שימוש אחת, גזע (סיומות מקופלות אחרי norm), וטעות אות אחת בגזע
const stem = (w) => norm(w).replace(/(יות|ות|ימ|ינ|ה|ת)$/, "");
const lev1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return d + (a.length - i) + (b.length - j) <= 1; };
const bare = (w) => norm(w).replace(/^[והבלמכש](?=[א-ת]{3,})/, "");
const same = (a, b) => {
  for (const x of [norm(a), bare(a)]) for (const y of [norm(b), bare(b)]) {
    if (x === y) return true;
    if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
    // גזע זהה, או טעות אות אחת — רק בגזעים של 4+ («רוצה»≈«רוזה» בשלוש אותיות זיכה רוטב על «רוצה קולה»)
    const sx = stem(x), sy = stem(y); if (sx.length >= 3 && sy.length >= 3 && (sx === sy || (sx.length >= 4 && sy.length >= 4 && lev1(sx, sy)))) return true;
  }
  return false;
};
const STOP = new Set(["לשאול", "לוודא", "האם", "איזה", "איזו", "אילו", "על", "את", "עם", "של", "או", "גם", "יש", "לבחירה", "מה"].map(norm));
// נקודה כללית («רטבים», «ירקות», «איזה רוטב», «מידת עשייה») נענית גם במופע שלה — «קטשופ ומיונז»,
// «חסה ועגבנייה», «מדיום» (יותם, 6.9). המופעים: רשימה כללית + האופציות שהכרטיס עצמו מונה
// («פסטה שמנת / רוזה / עגבניות / ללא רוטב» ⇒ שמנת, רוזה, עגבניות עונים על «איזה רוטב»).
const GENERIC = {
  "רוטב": ["קטשופ", "מיונז", "איולי", "צ'ילי", "סויה", "טריאקי", "פונזו", "ברביקיו", "חרדל", "טחינה", "סחוג", "שמנת", "רוזה", "עגבניות", "פסטו", "אלפרדו", "בולונז", "טרטר", "צזיקי"],
  "ירקות": ["חסה", "עגבנייה", "עגבניה", "עגבניות", "בצל", "מלפפון", "גזר", "פלפל", "כרוב", "סלט", "זיתים", "עלים"],
  "תוספת": ["צ'יפס", "סלט", "אורז", "פירה", "פסטה", "תפוחי אדמה", "בטטה", "ירקות", "אנטיפסטי", "טבעות בצל"],
  "מידת עשייה": ["מדיום", "וול דאן", "ולדאן", "רייר", "נא", "עשוי", "well", "medium", "rare", "מידת", "עשייה"],
  "פרמז'ן": ["פרמזן", "פרמז'ן", "גבינה"],
};
// «רטבים» ⇔ «רוטב» הוא ויתור על ו׳, לא סיומת — לכן מילות-הראש מפורשות, לא גזע עמום
const HEAD_ALIASES = { "רוטב": ["רוטב", "רטבים", "רטב", "רוטבים", "רטבימ"], "ירקות": ["ירקות", "ירק"], "תוספת": ["תוספת", "תוספות"], "מידת עשייה": ["עשייה", "מידת", "עשיה"], "פרמז'ן": ["פרמז'ן", "פרמזן"] };
const headOf = (atom) => Object.keys(GENERIC).find((k) => toks(atom).some((w) => HEAD_ALIASES[k].some((a) => same(w, a))));
// אופציות שהכרטיס מונה ליד מילת-הראש: «פסטה שמנת / רוזה / עגבניות / ללא רוטב» ⇒ [שמנת, רוזה, עגבניות]
function dishOptions(desc, head) {
  if (!head) return [];
  const out = [];
  for (const seg of String(desc || "").split(/[.:·]/)) {
    if (!seg.includes("/") || !toks(seg).some((w) => toks(head).some((h) => same(w, h)))) continue;
    for (const part of seg.split("/")) { const ws = toks(part.replace(/^(פסטה|רוטב)\s+/, "")); if (ws.length && ws.length <= 2) out.push(ws.join(" ")); }
  }
  return out;
}
const content = (s) => toks(s).filter((w) => !STOP.has(w) && w.length >= 2);

export const isSimple = (dish) =>
  /ילדים|לחמ|פיתות|bread/i.test(dish.category || "") || askableIngredients(dish).length <= 2;

/** הקטע «בלקיחת ההזמנה: …» מהתיאור (עד «עריכה:»/«בהגשה:»/סוף) */
export function orderStep(desc) {
  const m = String(desc || "").match(/בלקיחת ההזמנה\s*[:\-—]\s*([^]*?)(?=\s*(?:עריכה|בהגשה|בהכנה)\s*:|$)/);
  return m ? m[1].trim().replace(/\.+$/, "") : "";
}
/** פירוק הקטע לנקודות: «מידת עשייה, ירקות ורטבים» ⇒ [מידת עשייה, ירקות, רטבים] */
export function orderAtoms(step) {
  return String(step || "")
    .split(/\s*[·•,;?]\s*|\s+ו(?=[א-ת]{3,})/)                       // «ירקות ורטבים» ⇒ «ירקות», «רטבים»
    .map((s) => s.replace(/^(לשאול|לוודא|להציע|להגיד|לציין)\s*(על|את|אם|—|-)?\s*/, "").replace(/[.:—-]+$/, "").trim())
    .filter((s) => s && content(s).length);
}

export const HEB_NUM = { אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
  עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90, מאה: 100, מאתיים: 200, שלוש_מאות: 300 };
export function numbersIn(text) {
  const out = [];
  for (const w of String(text || "").split(/[\s,./]+/)) {
    const d = w.match(/^\d+$/); if (d) { out.push(Number(w)); continue; }
    const k = norm(w.replace(/^[וב]/, "")); if (HEB_NUM[k] != null) out.push(HEB_NUM[k]);
  }
  return out;
}

/** כל השאלות הפשוטות של מנה — לכל היותר 2 (יותם) */
export function simpleQuestions(dish) {
  const name = dish.name, desc = String(dish.desc || "");
  const out = [];
  const atoms = orderAtoms(orderStep(desc));
  if (atoms.length) {
    // לכל נקודה: המופעים שעונים עליה (כלליים + מה שהכרטיס מונה). הנקודה הראשונה היא העיקר (80%).
    const inst = atoms.map((a) => { const h = headOf(a); return h ? [...GENERIC[h], ...dishOptions(desc, h)] : []; });
    out.push({ id: `simple:order:${name}`, kind: "order", ask: `מה צריך לשאול או להגיד ללקוח בלקיחת ההזמנה של ״${name}״?`, atoms, inst, answerText: atoms.map((a, i) => (inst[i].length ? `${a} (${[...new Set(inst[i].filter((x) => dishOptions(desc, headOf(a)).includes(x)))].join(", ") || "למשל " + inst[i].slice(0, 3).join(", ")})` : a)).join(" · ") });
  }
  const grams = desc.match(/(\d+)\s*גרם\s*(?:של\s*)?([א-ת' ]{2,20})?/);
  if (grams) { const what = (grams[2] || "").trim().split(/[,.]/)[0].trim(); out.push({ id: `simple:grams:${name}`, kind: "number", n: Number(grams[1]), unit: "גרם", ask: `כמה גרם ${what || "יש"} ב״${name}״?`, answerText: `${grams[1]} גרם${what ? ` ${what}` : ""}` }); }
  const units = desc.match(/(\d+)\s*(?:יח['׳]?|יחידות)\s*([א-ת' ]{2,20})?/);
  if (units && out.length < 2) { const what = (units[2] || "").trim().split(/[,.]/)[0].trim(); out.push({ id: `simple:units:${name}`, kind: "number", n: Number(units[1]), unit: "יחידות", ask: `כמה יחידות${what ? ` ${what}` : ""} מגיעות ב״${name}״?`, answerText: `${units[1]} יחידות` }); }
  const per = desc.match(/לכל\s+(\d+|שני|שתי|שניים|שלושה|שלוש|ארבעה|ארבע)\s+(סועדים|לקוחות|אורחים|אנשים)/);
  if (per && out.length < 2) { const n = Number(per[1]) || HEB_NUM[norm(per[1])] || 2; const table = 8; out.push({ id: `simple:per:${name}`, kind: "per", per: n, table, n: Math.round(table / n), ask: `כמה ״${name}״ נמליץ לשולחן של ${table} סועדים?`, answerText: `אחד לכל ${n} סועדים ⇒ ${Math.round(table / n)} לשולחן של ${table}` }); }
  return out.slice(0, 2);
}

/** ניקוד שאלה פשוטה ⇒ { lvl, hits, note } */
export function gradeSimple(q, text) {
  const t = String(text || "");
  if (q.kind === "order") {
    const at = toks(t);
    const said = [];                                   // אילו מופעים זוהו, להצגה («רטבים — קטשופ, מיונז»)
    const hits = q.atoms.map((a, i) => {
      const found = ((q.inst || [])[i] || []).filter((x) => toks(x).every((w) => at.some((y) => same(y, w))));
      if (found.length) { said[i] = found; return 1; }        // מופע ספציפי = תשובה מלאה לנקודה
      const cw = content(a); if (!cw.length) return 0;
      const n = cw.filter((w) => at.some((x) => same(x, w))).length;
      return n === cw.length ? 1 : n ? 0.5 : 0;
    });
    // הנקודה הראשונה היא העיקר — 80% (יותם: «צריך להיות יותר ערך לתשובה ספציפית»); השאר 20%
    const w = q.atoms.map((_, i) => (q.atoms.length < 2 ? 1 : i === 0 ? 0.8 : 0.2 / (q.atoms.length - 1)));
    const score = hits.reduce((s, h, i) => s + h * w[i], 0);
    return { lvl: score >= 0.8 ? 2 : score >= 0.2 ? 1 : 0, hits, said, note: "" };   // משניות בלבד = חלקי, לא אפס
  }
  const nums = numbersIn(t);
  if (q.kind === "number") {
    if (nums.includes(q.n)) return { lvl: 2, hits: [1], note: "" };
    const near = nums.find((x) => Math.abs(x - q.n) / q.n <= 0.25);
    return near != null ? { lvl: 1, hits: [0.5], note: `קרוב — המספר המדויק: ${q.n} ${q.unit}` } : { lvl: 0, hits: [0], note: `המספר: ${q.n} ${q.unit}` };
  }
  if (q.kind === "per") {
    const ratio = t.match(/לכל\s+(\d+|אחד|אחת|שני|שתי|שניים|שלושה|שלוש|ארבעה|ארבע)/);
    const perSaid = ratio ? (Number(ratio[1]) || HEB_NUM[norm(ratio[1])] || null) : null;
    if (perSaid === q.per || nums.includes(q.n)) return { lvl: 2, hits: [1], note: "" };
    if ((perSaid != null && Math.abs(perSaid - q.per) <= 1) || nums.some((x) => Math.abs(x - q.n) <= 2)) return { lvl: 1, hits: [0.5], note: `קרוב — ההמלצה: ${q.answerText}` };
    return { lvl: 0, hits: [0], note: `ההמלצה: ${q.answerText}` };
  }
  return { lvl: 0, hits: [], note: "" };
}
