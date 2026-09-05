// ══ חוזה השופט v5 (CREWMENU-JUDGE-MODULE-DESIGN.md §3) ══
//
// נקודת האכיפה היחידה. השופט (exam-judge mode:"leaf") מקבל את כרטיס המנה + השורות
// שהמנוע הדטרמיניסטי סימן, ומחזיר לכל שורה supports/contradicts/neutral + ראיה. כאן
// מאמתים כל פסק לפני שמישהו רואה אותו — וזו גם הנקודה שבה מובטח:
//
//   🔴 השופט לעולם לא משנה פסק בטיחות. כל פסק על שורת crit עובר ל-advisory ואינו מוחל.
//
// אותו קובץ נטען בלקוח (מיזוג) וב-`npm run check` (בדיקת המאפיין §3.4). ה-Edge Function
// מריץ את אותה לוגיקה בצד השרת; בדיקת דריפט משווה את ה-SYSTEM לזה שבפונקציה.
import { norm, toks, wMatch } from "./examEngine.js";
import { negIndex, NEGATORS } from "./examNeg.js";

export const CONTRACT_VERSION = 5;

// ── הרובריקה (§3.2) — קול מנהל, עברית. שינוי כאן ⇒ לעדכן את ה-sha ב-index.ts ────
export const SYSTEM = `אתה עוזר-בדיקה במבחן תפריט של מסעדה ישראלית. יש לך כרטיס מנה (העובדות היחידות),
תשובת מלצר, ורשימת שורות שהבודק הדטרמיניסטי כבר סימן. אינך נותן ציון, אינך קובע אם עובר,
ואינך מחליט מה חסר — רק אומר, לכל שורה, אם מילים שהמלצר כתב תומכות בה, סותרות אותה, או אינן נוגעות בה.
1. ראיה = ציטוט מדויק מהתשובה (או מרשימת הצ'יפים). בלי ציטוט — neutral. אסור להמציא.
2. supports רק כשמה שנכתב מתכוון לאותו דבר: תרגום/תעתיק = אותה מילה («ספייסי»=חריף, «לימון יפני»=יוזו). קטגוריה אינה הפריט («דג» אינו סלמון).
3. contradicts רק כשנכתבה עובדה הפוכה: שיטת הכנה אחרת, רוטב אחר, הכחשה של הפריט, מספר אחר. הכרטיס הוא האמת גם כשהמלצר בטוח.
4. מונח קרוב לשיטת ההכנה («מטוגן» לטמפורה) = supports + note «בתפריט קוראים לזה טמפורה».
5. תיאור לא חייב אלרגיות ולא את כל המרכיבים. טעם/מרקם סובייקטיבי = neutral.
6. ליווי, המלצת שתייה והשוואה («מומלץ עם סאקה», «כמו שומר») — neutral, לא foreign.
7. שלילה בעברית באה גם אחרי שם העצם («גלוטן אין בזה»). «לא רק חריף» = חריף. «לא ל-X» = לא מתאים ל-X. «לא ממש חריף» על «חריפות מתונה» = supports. שלילה כפולה = חיוב.
8. foreign = מרכיב/שיטה/רוטב מובחנים שנטענו ואינם בכרטיס. לא קטגוריה, לא תואר, לא מה ששולל. ≤2.
9. שורה עם crit=true: מותר contradicts עם ציטוט — זה יגרום לבדיקה אנושית, לא לפסילה.
10. abusive = שפה פוגענית; offtopic = לא על המנה בכלל. כתיב/סלנג/קצר אינם offtopic.
11. note = משפט אחד, עברית פשוטה, קול מנהל, ≤140 תווים. ריק אם אין מה.
12. JSON בלבד לפי הסכימה. שורה שלא נגעת בה — neutral עם evidence ריק.`;

// ── סכימת הפלט (§3.3) — rows ראשון, note אחרון ───────────────────────────────
export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["rows", "foreign", "flags", "note"],
  properties: {
    rows: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "verdict", "evidence"],
      properties: { id: { type: "string" }, verdict: { type: "string", enum: ["supports", "contradicts", "neutral"] }, evidence: { type: "string" } } } },
    foreign: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim", "why"],
      properties: { claim: { type: "string" }, why: { type: "string" } } } },
    flags: { type: "object", additionalProperties: false, required: ["abusive", "offtopic"],
      properties: { abusive: { type: "boolean" }, offtopic: { type: "boolean" } } },
    note: { type: "string" },
  },
};

// ── נרמול ראיה: norm + הסרת ניקוד/RLM/nbsp/גרשיים (§3.4.2) ────────────────────
const NIQQUD = /[֑-ׇ]/g, RLM = /[‎‏‪-‮]/g;
export function normEvidence(s) {
  return norm(String(s || "").replace(NIQQUD, "").replace(RLM, "").replace(/ /g, " ").replace(/["'׳״]/g, ""));
}

// רצף טוקנים של הראיה מופיע ברצף בתשובה (טוקן-לטוקן דרך wMatch), או שווה לצ'יפ ב-unknown
function runInAnswer(runToks, answerToks) {
  if (!runToks.length) return false;
  for (let i = 0; i + runToks.length <= answerToks.length; i++) {
    let ok = true;
    for (let j = 0; j < runToks.length; j++) if (!wMatch(answerToks[i + j], runToks[j])) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
export function evidenceGrounded(evidence, answerToks, unknownChips) {
  const runs = normEvidence(evidence).split(/\s*(?:\.\.\.|…)\s*/).map((r) => r.trim()).filter(Boolean);
  if (!runs.length) return false;
  const chipSet = new Set((unknownChips || []).map(normEvidence));
  return runs.every((run) => {
    if (chipSet.has(run)) return true;
    const rt = toks(run);
    return rt.length > 0 && runInAnswer(rt, answerToks);
  });
}

const isCrit = (row) => row.crit === true;
// אוצר המילים של המנה: כל טוקני ה-canonical/alt של השורות שנשלחו
function dishVocab(rows) {
  const v = new Set();
  for (const r of rows) for (const w of [...(r.canonical || []), ...(r.alt || [])]) for (const t of toks(w)) v.add(t);
  return v;
}
// האם רצף הראיה עצמו שלול בתשובה (§3.4.4)
function evidenceNegated(evidence, answerToks) {
  const rt = toks(normEvidence(evidence)); if (!rt.length) return false;
  const neg = negIndex(answerToks);
  for (let i = 0; i + rt.length <= answerToks.length; i++) {
    let ok = true; for (let j = 0; j < rt.length; j++) if (!wMatch(answerToks[i + j], rt[j])) { ok = false; break; }
    if (ok) { for (let j = 0; j < rt.length; j++) if (neg[i + j]) return true; }
  }
  return false;
}

/**
 * מאמת את תשובת השופט מול הקלט. מחזיר { rows, foreign, advisory, flags, note } —
 * `rows` = רק פסקים מאומתים על שורות **לא-crit** (crit ⇒ advisory); כל ראיה מוארקת.
 * §3.4, בסדר: id∈rows → dup⇒neutral → evidence grounded → crit⇒advisory → contradicts-noise/negated⇒drop.
 */
export function verifyReply({ rows = [], unknown = [], answer = "" }, reply) {
  const out = { rows: [], foreign: [], advisory: [], flags: { abusive: false, offtopic: false }, note: "" };
  if (!reply || !Array.isArray(reply.rows)) return { ...out, skipped: "bad_model_json" };
  const answerToks = toks(String(answer));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const vocab = dishVocab(rows);
  const seen = new Set();
  for (const rr of reply.rows) {
    const id = String(rr?.id ?? "");
    const row = byId.get(id);
    if (!row) continue;                                     // שורה לא נשלחה
    if (seen.has(id)) continue; seen.add(id);               // id כפול ⇒ neutral (מדלגים)
    let verdict = String(rr?.verdict || "").toLowerCase();
    if (!["supports", "contradicts", "neutral"].includes(verdict)) verdict = "neutral";
    const evidence = String(rr?.evidence || "");
    // supports/contradicts בלי ראיה מעוגנת ⇒ neutral
    if ((verdict === "supports" || verdict === "contradicts") && !evidenceGrounded(evidence, answerToks, unknown)) verdict = "neutral";
    // 🔴 כל פסק על שורת crit ⇒ advisory (לא מוחל). זו הנקודה היחידה.
    if (isCrit(row) && verdict !== "neutral") { out.advisory.push({ id, verdict, evidence }); continue; }
    // contradicts רועש: כל טוקני הראיה הם אוצר-המנה ואין שולל ⇒ נזרק; ראיה שלולה ⇒ נזרק
    if (verdict === "contradicts") {
      const et = toks(normEvidence(evidence));
      const allVocab = et.length > 0 && et.every((t) => vocab.has(t));
      const hasNeg = et.some((t) => NEGATORS.has(t));
      if ((allVocab && !hasNeg) || evidenceNegated(evidence, answerToks)) verdict = "neutral";
    }
    out.rows.push({ id, verdict, evidence });
  }
  // foreign: ⊂ (answer ∪ unknown), ≤3 טוקנים, ≥1 מילת-תוכן שאינה באוצר המנה, בלי שולל, תקרה 2
  for (const f of (reply.foreign || [])) {
    const claim = String(f?.claim || "");
    const ct = toks(normEvidence(claim));
    if (!ct.length || ct.length > 3) continue;
    if (!evidenceGrounded(claim, answerToks, unknown)) continue;
    if (ct.some((t) => NEGATORS.has(t))) continue;
    if (!ct.some((t) => !vocab.has(t) && t.length >= 3)) continue;
    out.foreign.push({ claim, why: String(f?.why || "").slice(0, 140) });
    if (out.foreign.length >= 2) break;
  }
  // note מוצג רק כשיש supports/contradicts מאומת; לא נוגע ביעד crit של שלב מאוחר (הלקוח אוכף)
  if (out.rows.some((r) => r.verdict !== "neutral")) out.note = String(reply.note || "").slice(0, 140);
  out.flags = { abusive: !!reply?.flags?.abusive, offtopic: !!reply?.flags?.offtopic };
  return out;
}

/**
 * מיזוג הפסקים המאומתים לתוך השורות (§3.5). שורות crit עוברות **באותה רפרנס, ללא שינוי**
 * (הפסקים שלהן כבר ב-advisory ולא מגיעים לכאן). supports מרים miss/part⇒ok; contradicts⇒wrong.
 * מחזיר מערך חדש; שורות crit הן אותו אובייקט מהמקור (רפרנס משומרת).
 */
export function mergeRows(rows, verified) {
  const v = new Map((verified?.rows || []).map((r) => [r.id, r.verdict]));
  return rows.map((row) => {
    if (isCrit(row)) return row;                            // 🔴 crit לעולם לא נוגעים
    const verdict = v.get(row.id);
    if (verdict === "supports" && (row.status === "miss" || row.status === "part")) return { ...row, status: "ok", byJudge: true };
    if (verdict === "contradicts" && row.status !== "wrong") return { ...row, status: "wrong", byJudge: true };
    return row;
  });
}

// פסק הבטיחות של כרטיס = יש שורת crit במצב miss/wrong (השמטה/סתירה של אזהרה)
export const safetyVerdict = (rows) => rows.some((r) => isCrit(r) && (r.status === "miss" || r.status === "wrong"));
