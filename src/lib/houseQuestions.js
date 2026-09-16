// ══ שאלות על המסעדה עצמה — לא על מנה אחת (יותם, 16.9, GDB) ══
//
// «תוסיף שאלות על המסעדה עצמה מאשר על המנות ותעשה אותן שאלות אחרות מהרגיל — ספציפית
// תשאל איזה המבורגר חלבי ולמה? תמליץ על ארוחה לטבעוני». המחולל (examEngine) גוזר שאלות
// ממנה אחת או מקטגוריה; שאלה כזו חוצה את התפריט, ולכן היא נכתבת כנתון ולא כקוד:
// `restaurants.features.house_questions`. מסעדה בלי המפתח ⇒ אפס שינוי.
//
//   { id, ask, cat?, answer, need?, points: [{ t, any: [...] }], bad?: [...] }
//     cat    — נשאלת גם בבוחן של הקטגוריה הזו. בלי cat — רק במבחן התפריט המלא.
//     points — מה צריך להיאמר. כל נקודה = רשימת ניסוחים, ומספיק אחד מהם.
//     need   — כמה נקודות לתשובה מלאה (ברירת מחדל: כולן). פחות ⇒ חלקי, אפס ⇒ לא נכון.
//     bad    — טעות בביטחון («הקלאסי חלבי») ⇒ לכל היותר חלקי. «לא הקלאסי» אינו נענש.
//
// אפס AI, כמו השאלות הפשוטות: אותו מתאם עברית (`same`) שמזכה «רטבים» על «רוטב».
import { norm, toks } from "./examEngine.js";
import { same } from "./simpleDish.js";

// מילה שמבטלת את מה שאחריה: «GBD, לא הקלאסי» · «עם צ'יפס ולא סלט קיסר»
const NEG = new Set(["לא", "ולא", "בלי", "ללא", "חוץ", "מלבד", "אינו", "אין", "בשונה", "לעומת", "להבדיל", "not", "no"].map(norm));
const NEG_WINDOW = 3;

export const validHouse = (q) => !!(q && typeof q.ask === "string" && q.ask.trim()
  && Array.isArray(q.points) && q.points.some((p) => Array.isArray(p?.any) && p.any.length));

/** השאלות התקינות — כולן, או רק של קטגוריה אחת */
export function houseFor(list, { cat = null } = {}) {
  const all = (Array.isArray(list) ? list : []).filter(validHouse);
  return cat == null ? all : all.filter((q) => q.cat === cat);
}

// מילות ביטוי — `toks` מסנן מילה של אות אחת, ו«M» (מידת עשייה) היא בדיוק כזו
const phraseWords = (phrase) => {
  const t = toks(phrase);
  return t.length ? t : norm(String(phrase || "")).split(" ").filter(Boolean);
};

// `same` מקלף אות שימוש אחת; «והקלאסי» נושא שתיים (ו+ה)
const strip2 = (w) => w.replace(/^[והבלמכש]{2}(?=[א-ת]{3,})/, "");
const sameWord = (w, p) => same(w, p) || (strip2(w) !== w && same(strip2(w), p));

/** המיקום של הביטוי בתשובה (-1 = לא נאמר). כל מילות הביטוי צריכות להופיע. */
function phraseAt(words, phrase) {
  const pw = phraseWords(phrase);
  if (!pw.length) return -1;
  const first = words.findIndex((w) => sameWord(w, pw[0]));
  if (first < 0) return -1;
  return pw.every((p) => words.some((w) => sameWord(w, p))) ? first : -1;
}

const negated = (words, at) => words.slice(Math.max(0, at - NEG_WINDOW), at).some((w) => NEG.has(w));

/** ניקוד ⇒ { lvl 0|1|2, hits: [0|1 לכל נקודה], wrong: [ביטויים שגויים שנאמרו] } */
export function gradeHouse(q, text) {
  const words = norm(String(text || "")).split(" ").filter(Boolean);
  const points = q?.points || [];
  const hits = points.map((p) => ((p.any || []).some((ph) => phraseAt(words, ph) >= 0) ? 1 : 0));
  const n = hits.reduce((a, b) => a + b, 0);
  const need = Math.min(points.length, Math.max(1, q?.need ?? points.length));
  const wrong = (q?.bad || []).filter((ph) => {
    const at = phraseAt(words, ph);
    return at >= 0 && !negated(words, at);
  });
  let lvl = n >= need ? 2 : n > 0 ? 1 : 0;
  if (wrong.length) lvl = Math.min(lvl, n > 0 ? 1 : 0);
  return { lvl, hits, wrong };
}
