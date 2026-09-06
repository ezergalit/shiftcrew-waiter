// ══ עלה התיאור — «תאר את המנה ללקוח» במבחן המלא (CREWMENU-JUDGE-MODULE-DESIGN.md §3) ══
//
// יותם (6.9): «במבחן התפריט אין שאלה אחת של תיאור מנה פתוחה?» — זו השאלה. המלצר כותב פסקה
// חופשית; המנוע הדטרמיניסטי מסמן שורות (מרכיבים · אופן הכנה/טעם מהכרטיס · אזהרות בטיחות),
// והשופט (exam-judge v5, mode leaf) רק אומר לכל שורה supports/contradicts/neutral עם ציטוט.
//   🔴 השופט לעולם לא נוגע בשורת בטיחות (crit): «דג נא» חייב להיאמר — דטרמיניסטי בלבד.
//   · תיאור לא חייב את כל המרכיבים (60% = מלא) ולא אלרגיות — הן שאלה נפרדת בכרטיס.
//   · «מטוגן» על טמפורה מזכה (alt כאן + כלל 4 של השופט).
//   · שלילה («הדג לא נא») הופכת פגיעה לטעות — negIndex של examNeg.
// בחנים לא קוראים לזה בכלל (יותם: בחנים = אפס AI); רק המבחן.
import { norm, toks, wMatch } from "./examEngine.js";
import { negIndex, NEG_LIST } from "./examNeg.js";
import { verifyReply, mergeRows, safetyVerdict } from "./judge-contract.js";

// «מטוגנים» = «מטוגן», «פריכה» = «פריך» — wMatch לבדו מחמיר על נטיות; גזע אחרי norm (שמקפל סופיות)
// ⚠️ norm מקפל סופיות (ם⇒מ, ן⇒נ) — הסיומות כאן בצורה המקופלת («מטוגנים» ⇒ «מטוגנימ»)
const stem = (w) => norm(String(w)).replace(/(יות|ות|ימ|ינ|ה|ת)$/, "");
export const same = (a, b) => wMatch(a, b) || (stem(a).length >= 3 && stem(a) === stem(b));
function findRun(phraseToks, at) {
  for (let i = 0; i + phraseToks.length <= at.length; i++) {
    let ok = true;
    for (let j = 0; j < phraseToks.length; j++) if (!same(at[i + j], phraseToks[j])) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

// אופן הכנה / אופי שמופיעים בכרטיס — נהיים שורה רק כשהתיאור של המסעדה מזכיר אותם
const PREP = [
  ["טמפורה", ["מטוגן", "טיגון", "פריך", "קריספי", "בציפוי"]],
  ["מטוגן", ["טיגון", "פריך"]],
  ["אפוי", ["בתנור", "אפייה"]],
  ["גריל", ["בגריל", "צלוי", "על האש", "פחמים", "צלייה"]],
  ["מאודה", ["אידוי"]], ["מבושל", ["בישול"]], ["כבוש", ["כבישה"]], ["מעושן", ["עישון"]],
  ["קריספי", ["פריך", "קראנצ'י", "פריכות"]],
  ["חריף", ["ספייסי", "פיקנטי", "חריפות"]],
  ["מתוק", ["מתקתק", "מתיקות"]], ["חמוץ", ["חמצמץ", "חמיצות"]], ["קרמי", ["קרמיות"]],
];
// מילים שמזכות שורת בטיחות (נא = חובה בתיאור של מנה נאה)
const CRIT_ALT = {
  "דג נא": ["נא", "סשימי", "לא מבושל", "חי", "raw"],
  "בשר נא": ["נא", "מדיום רייר", "קרפצ'יו", "טרטר", "לא מבושל"],
  "ביצה חיה": ["ביצה חיה", "ביצה לא מבושלת", "חלמון חי"],
  "נבטים חיים": ["נבטים חיים", "נבטים"],
};

/** שורות הכרטיס: מרכיבים (targets מהמנוע, עם ניסוחים שנלמדו) · הכנה/אופי מהתיאור · בטיחות */
export function buildRows(dish, targets = null) {
  const rows = [];
  const ings = targets ? targets.map((t) => ({ t: t.t, alt: t.alt || [] })) : (dish.ingredients || []).map((x) => ({ t: x, alt: [] }));
  // מרכיב שהוא גם אופן הכנה («טמפורה») יורש את הניסוחים של ההכנה — «מטוגנים» מזכה אותו
  const prepAltsFor = (t) => PREP.filter(([key]) => toks(t).some((w) => same(w, key))).flatMap(([, alt]) => alt);
  for (const { t, alt } of ings) rows.push({ id: `ing:${t}`, kind: "ing", canonical: [t], alt: [...alt, ...prepAltsFor(t)], crit: false });
  const dt = toks(String(dish.desc || ""));
  const ingKeys = new Set(ings.map((i) => norm(i.t)));
  for (const [key, alt] of PREP) {
    if ([...ingKeys].some((k) => toks(k).some((w) => same(w, key)))) continue;   // «טמפורה» כבר מרכיב
    // זיהוי לפי המילה עצמה בלבד — «מטוגן» בתיאור אינו ראיה לטמפורה (נתפס חי על נאמס: שורת
    // «טמפורה» צצה למנה בלי טמפורה). ה-alt משמש רק לזיכוי התשובה, לא לבניית השורה.
    if (dt.some((w) => same(w, key))) rows.push({ id: `desc:${key}`, kind: "desc", canonical: [key], alt, crit: false });
  }
  for (const p of dish.pregnancy || []) rows.push({ id: `crit:${p}`, kind: "crit", canonical: [p], alt: CRIT_ALT[p] || [], crit: true });
  return rows;
}

/** סימון דטרמיניסטי: ok / miss / wrong (הוזכר בשלילה) לכל שורה */
export function markRows(rows, text) {
  const at = toks(String(text || ""));
  const neg = negIndex(at);
  return rows.map((r) => {
    let status = "miss";
    for (const phrase of [...(r.canonical || []), ...(r.alt || [])]) {
      const pt = toks(phrase); if (!pt.length) continue;
      const i = findRun(pt, at); if (i < 0) continue;
      const phraseNeg = pt.some((t) => NEG_LIST.includes(t));                  // «לא מבושל» מכיל שולל בעצמו
      const denied = !phraseNeg && pt.some((_, j) => neg[i + j]);
      if (!denied) { status = "ok"; break; }
      status = "wrong";
    }
    return { ...r, status };
  });
}

/** ציון: כיסוי המרכיבים/ההכנה (60% = מלא, 30% = חלקי); סתירה/טענה זרה מורידות; כשל בטיחות = 0 */
export function scoreRows(rows, foreignCount = 0) {
  const main = rows.filter((r) => !r.crit);
  const ok = main.filter((r) => r.status === "ok").length;
  const wrong = main.filter((r) => r.status === "wrong").length + foreignCount;
  const n = main.length;
  const cover = n ? Math.max(0, ok - wrong) / n : (wrong ? 0 : 1);
  const safety = safetyVerdict(rows);
  const lvl = safety ? 0 : cover >= 0.6 ? 2 : cover >= 0.3 ? 1 : 0;
  return { lvl, cover, ok, wrong, n, safety };
}

/**
 * תיאור חופשי ⇒ {rows, lvl, cover, safety, note, foreign, judged}.
 * `judge` = קריאה אסינכרונית ל-exam-judge v5 (null ⇒ דטרמיניסטי בלבד). נקרא רק כשיש מה
 * להכריע: שורה שלא זוהתה, או ציון לא-מלא — תיאור שכל שורותיו זוהו לא עולה כסף.
 */
export async function gradeDescription({ dish, targets = null, text, judge = null }) {
  let rows = markRows(buildRows(dish, targets), text);
  let s = scoreRows(rows);
  let note = "", foreign = [], judged = false;
  const words = toks(String(text || "")).length;
  const needJudge = !!judge && words >= 3 && (s.lvl < 2 || rows.some((r) => !r.crit && r.status === "miss"));
  if (needJudge) {
    const reply = await judge({
      card: { name: dish.name, desc: dish.desc || "", ingredients: dish.ingredients || [], pregnancy: dish.pregnancy || [] },
      rows: rows.map(({ id, canonical, alt, crit }) => ({ id, canonical, alt, crit })),
      answer: text, unknown: [],
    });
    if (reply && !reply.skipped) {
      const verified = verifyReply({ rows, unknown: [], answer: text }, reply);   // אימות לקוח, גם אחרי השרת (§3.4)
      if (!verified.skipped) {
        rows = mergeRows(rows, verified);
        foreign = verified.foreign || [];
        note = verified.note || "";
        s = scoreRows(rows, foreign.length);
        judged = true;
      }
    }
  }
  return { rows, ...s, note, foreign, judged };
}
