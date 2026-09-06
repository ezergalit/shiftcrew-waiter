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
import { norm, toks, wMatch, wExact, enToHe, genericAlt } from "./examEngine.js";
import { ingredientKeys } from "./ingredientKeys.js";
import { negIndex, NEG_LIST } from "./examNeg.js";
import { verifyReply, mergeRows, safetyVerdict } from "./judge-contract.js";

// «מטוגנים» = «מטוגן», «פריכה» = «פריך» — wMatch לבדו מחמיר על נטיות; גזע אחרי norm (שמקפל סופיות)
// ⚠️ norm מקפל סופיות (ם⇒מ, ן⇒נ) — הסיומות כאן בצורה המקופלת («מטוגנים» ⇒ «מטוגנימ»)
const stem = (w) => norm(String(w)).replace(/(יות|ות|ימ|ינ|ה|ת)$/, "");
export const same = (a, b) => wMatch(a, b) || (stem(a).length >= 3 && stem(a) === stem(b));
// מילה בת שתי אותיות («קר», «חם», «בס») — זהות בלבד: «בקר» אינו «קר» ו«לחם» אינו «חם»
// (ו׳ החיבור לבדה נקלפת: «ובס» = «בס», «ודג» = «דג» — לא ב׳/ל׳, שהן חלק מ«בקר»/«לחם»)
const bareVav = (w) => (w.length === 3 && w[0] === "ו" ? w.slice(1) : w);
export const sameTok = (a, b) => (a.length <= 2 || b.length <= 2) ? bareVav(a) === bareVav(b) : same(a, b);

// אופן הכנה / אופי שמופיעים בכרטיס — נהיים שורה רק כשהתיאור של המסעדה מזכיר אותם
// [מפתח, נטיות שיוצרות שורה (זהות/גזע בלבד — לא טעות-אות), נרדפות-לתשובה-בלבד]
const PREP = [
  ["טמפורה", [], ["מטוגן", "טיגון", "פריך", "קריספי", "בציפוי"]],
  ["מטוגן", ["מטוגנת", "מטוגנים", "מטוגנות", "טיגון"], ["פריך"]],
  ["אפוי", ["אפויה", "אפויים", "אפויות", "בתנור", "אפייה"], []],
  ["גריל", ["בגריל", "צלוי", "צלויה", "צלויים", "צלויות", "על האש", "פחמים", "על פחמים", "צלייה"], []],
  ["מאודה", ["מאודים", "מאודות", "אידוי"], []], ["מבושל", ["מבושלת", "מבושלים", "מבושלות"], ["בישול"]],   // «שיטת בישול» בכרטיס אינה «מבושל»
  ["כבוש", ["כבושה", "כבושים", "כבושות", "כבישה"], []], ["מעושן", ["מעושנת", "מעושנים", "מעושנות", "עישון"], []],
  ["קריספי", ["קריספית", "פריך", "פריכה", "פריכים", "פריכות"], ["קראנצ'י", "פריכות"]],
  ["חריף", ["חריפה", "חריפים", "פיקנטי", "פיקנטית"], ["ספייסי", "חריפות"]],
  ["מתוק", ["מתוקה", "מתקתק", "מתקתקה"], ["מתיקות"]], ["חמוץ", ["חמוצה", "חמצמץ", "חמצמצה"], ["חמיצות"]], ["קרמי", ["קרמית"], ["קרמיות"]],
  ["צרוב", ["צרובה", "צרובים", "צרובות", "צריבה"], ["טאטאקי", "צרוב מבחוץ"]],
];
const PREP_W = { "קריספי": 0.5, "חריף": 0.5, "מתוק": 0.5, "חמוץ": 0.5, "קרמי": 0.5 };
// יצירת שורה מהכרטיס — זהות/נטייה בלבד, בלי סובלנות לטעות-אות: «פריכות» יצר שורת «פרוסות»
// (lev 2 על 6 אותיות) לסלט חלומי, שאף מלצר לא יכול לכסות
const exactTok = (a, b) => (a.length <= 2 || b.length <= 2) ? bareVav(a) === bareVav(b) : (wExact(a, b) || (stem(a).length >= 3 && stem(a) === stem(b)));
const exactRuns = (pt, at) => { const out = []; if (!pt.length) return out; for (let i = 0; i + pt.length <= at.length; i++) { let ok = true; for (let j = 0; j < pt.length; j++) if (!exactTok(at[i + j], pt[j])) { ok = false; break; } if (ok) out.push(i); } return out; };
// צורה/הגשה/אופי שהכרטיס מזכיר — «מה המנה» (יותם, 6.9: «להבדיל בין התיאור של המנה למרכיבים»)
// [מפתח, נטיות שמזהות את אותו דבר (יוצרות שורה), משקל, נרדפות-לתשובה-בלבד (מזכות, לא יוצרות שורה)]
// ⚠️ נרדפת תשובה אינה ראיה לשורה: «קצוץ» בתיאור אינו טרטר, «בצק» אינו מאפה, «צלוי» אינו «בגריל»
// (הבוטים, 6.9: גיוזה קיבלה שורות טרטר/המבורגר/בגריל מהנרדפות).
const FORM = [
  // צורת המנה — «מה זה» (משקל 2)
  ["ספרינג רול", ["ספרינג"], 2, ["אגרול"]], ["רול", ["רולים"], 2, []], ["מאפה", ["מאפים"], 2, ["בצק"]], ["סלט", [], 2, []], ["מרק", ["מרקים"], 2, []],
  ["קציצות", ["קציצה", "קציצת"], 2, []], ["כיסונים", ["כיסוני", "כיסון"], 2, ["גיוזה", "דאמפלינג"]], ["פרוסות", ["פרוסה", "פרוס", "פרוסת"], 2, ["חתוך", "פרוסות דקות"]],
  ["אצבעות", ["אצבע"], 2, []], ["כדורים", ["כדור", "כדורי"], 2, []], ["קוביות", ["קובייה", "קוביה", "קוביית"], 2, []], ["ניגירי", [], 2, ["נא"]], ["סשימי", [], 2, ["נא", "דג נא", "פרוסות דג"]],
  ["טרטר", [], 2, ["נא", "קצוץ"]], ["קרפצ'יו", ["קרפציו"], 2, ["נא", "פרוסות דקות"]], ["המבורגר", ["בורגר"], 2, ["קציצה"]], ["מנה אישית", [], 2, ["אישית"]],
  // אופן הכנה (1.5) — גריל/תנור/טיגון/קריספי חיים ב-PREP; כאן רק מה שאינו שם
  ["מוקפץ", ["מוקפצים", "מוקפצת"], 1.5, ["ווק"]],
  // הגשה — «מוגש לצד»/«לשיתוף» כמעט בכל כרטיס, ולכן 0.5; מילוי/ציפוי/בידיים הם צורה של ממש (1)
  ["אכילה עם הידיים", ["עם הידיים", "בידיים"], 1, []], ["מילוי", ["ממולא", "ממולאים", "במילוי"], 1, []], ["ציפוי", ["מצופה", "בציפוי"], 1, []],
  ["שרינג", ["לשיתוף", "לחלוק", "שיתוף", "לחלוקה", "חלוקה"], 0.5, []], ["מוגש לצד", ["לצד", "מגיע", "בצד"], 0.5, []],
  // אופי/מרקם (0.5) — ⚠️ «קר»/«חם» בנות שתי אותיות: התאמה מדויקת בלבד («בקר», «לחם» אינם קר וחם)
  ["קר", ["קרה", "קרים"], 0.5, []], ["חם", ["חמה", "חמים"], 0.5, []], ["עסיסי", ["עסיסית"], 0.5, []], ["מתובל", ["מתובלת"], 0.5, ["תיבול"]],
];
const MAX_ADJ_ROWS = 2, MAX_DESC_ROWS = 8;
const CLAIM_WORDS = new Set(["צמחוני", "צמחונית", "טבעוני", "טבעונית", "כשר", "כשרה", "פרווה", "חלבי", "בשרי", "מבושל", "מבושלת", "vegan", "kosher"].map(norm));
// מילים שמזכות שורת בטיחות (נא = חובה בתיאור של מנה נאה)
const CRIT_ALT = {
  "דג נא": ["נא", "נאה", "נאים", "סשימי", "לא מבושל", "חי", "raw", "כבוש", "סביצ'ה", "סביצה", "קרודו", "טרטר", "קרפצ'יו", "טאטאקי", "ניגירי", "ספייסי טונה", "ספייסי סלמון", "דגים נאים"],
  "בשר נא": ["נא", "נאה", "מדיום רייר", "רייר", "מדיום", "קרפצ'יו", "טרטר", "לא מבושל", "ורוד בפנים", "ורוד", "raw"],
  "ביצה חיה": ["ביצה חיה", "ביצה לא מבושלת", "חלמון חי", "ביצה נאה", "ביצה"],
  "נבטים חיים": ["נבטים חיים", "נבטים", "נבט"],
  "גבינה לא מפוסטרת": ["לא מפוסטרת", "לא מפוסטר", "גבינה חיה", "חלב לא מפוסטר"],
  "דגים עתירי כספית": ["כספית"],
};
// אופני הכנה שמוציאים זה את זה: מנה שהכרטיס אומר עליה «צלוי על פחמים» ותיאור שאומר «מוקפץ» —
// סתירה (הבוט הדברן, 6.9: «החציל נצלה על פחמים, לא מוקפץ» ⇒ היה מלא). נספר רק כשלמנה יש
// אופן הכנה מוצהר ואחר, והמילה הסותרת אינה מוכחשת («לא מטוגן» אינה טענה שהמנה מטוגנת).
const EXCLUSIVE_PREP = ["מטוגן", "אפוי", "גריל", "מאודה", "מבושל", "מוקפץ", "צרוב", "טמפורה", "נא"];
const PREP_FORMS = Object.fromEntries([...PREP.map(([k, forms, alts]) => [k, [k, ...forms, ...alts]]), ...FORM.map(([k, forms, , alts]) => [k, [k, ...forms, ...alts]]), ["נא", ["נא", "נאה", "נאים", "לא מבושל", "חי", "חיים", "raw"]]]);
export function prepContradictions(rows, text) {
  const at = enToHe(toks(String(text || "")));
  const neg = negIndex(at);
  const stated = new Set(rows.filter((r) => (r.kind === "desc" || r.kind === "form") && EXCLUSIVE_PREP.includes(r.canonical[0])).map((r) => r.canonical[0]));
  // מנה נאה (שורת בטיחות/ידע של דג נא / בשר נא) — «נא» מוצהר, ולא סותר טמפורה שלצידו
  if (rows.some((r) => /^(crit|warn):(דג|בשר) נא$/.test(r.id))) stated.add("נא");
  if (!stated.size) return [];
  const isStated = (k) => stated.has(k) || (k === "טמפורה" && stated.has("מטוגן")) || (k === "מטוגן" && stated.has("טמפורה")) || (k === "צרוב" && stated.has("גריל")) || (k === "גריל" && stated.has("צרוב"));
  const out = [];
  for (const k of EXCLUSIVE_PREP) {
    if (isStated(k)) continue;
    for (const f of PREP_FORMS[k] || [k]) {
      const pt = toks(f); if (!pt.length) continue;
      const hit = allRuns(pt, at).find((i) => !pt.some((_, j) => neg[i + j]));
      if (hit != null) { out.push(k); break; }
    }
  }
  return out;
}

/** האם יש למנה מספיק «מה זה» כדי לשאול תיאור פתוח: משקל שורות ≥2 (צורה/הכנה/עיקר) או אזהרת בטיחות */
export function descAskable(dish) {
  const rows = buildRows(dish, null, { mode: "desc" });
  const w = rows.filter((r) => !r.crit).reduce((a, r) => a + (r.w ?? 1), 0);
  return w >= 2 || rows.some((r) => r.crit);
}

// ── משקל (יותם, 6.9: «יותר ערך למרכיבים המרכזיים — תיאור טוב לא ייכשל על תיבול») ─────────
// מרכיב מרכזי (חלבון/עיקרי, או אחד משני הראשונים בכרטיס) = 2 · תיבול/קישוט = 0.5 · השאר = 1
const CORE = ["טונה", "סלמון", "ילוטייל", "המאצ", "לברק", "דניס", "בס", "מוסר", "דג", "שרימפס", "קלמארי", "תמנון", "סרטן", "צדפ", "בקר", "סינטה",
  "אנטריקוט", "פילה", "טלה", "כבש", "אסאדו", "המבורגר", "עוף", "פרגית", "טופו", "ביצ", "גבינ", "פטה", "בוראטה", "מוצרלה", "חלומי", "פסטה",
  "אטריות", "נודלס", "אורז", "חציל", "פטרי", "בטטה", "אבוקדו", "עדשים", "חומוס", "קינואה", "טמפורה", "כמהין", "יוגורט", "ביצי דגים"].map(norm);
const SEASONING = ["שמן", "לימון", "ליים", "מלח", "פלפל", "שום", "בצל ירוק", "עשבי", "פטרוזיליה", "כוסברה", "נענע", "שמיר", "בזיליקום", "אורגנו",
  "זעתר", "סומק", "פפריקה", "כמון", "שומשום", "צ'ילי", "צילי", "צלפים", "ג'ינג'ר", "גינגר", "וסאבי", "תבלין", "קונפי", "רכז", "סילאן", "דבש"].map(norm);
const wordIn = (t, list) => toks(t).some((w) => list.some((k) => w === k || (k.length >= 3 && w.startsWith(k))));
export function rowWeight(ing, position) {
  const k = norm(String(ing || ""));
  if (wordIn(k, SEASONING) && !wordIn(k, CORE)) return 0.5;
  if (wordIn(k, CORE) || position <= 1) return 2;
  return 1;
}

/** שורות הכרטיס: מרכיבים (targets מהמנוע, עם ניסוחים שנלמדו) · הכנה/אופי מהתיאור · בטיחות */
export function buildRows(dish, targets = null, { mode = "all" } = {}) {
  const rows = [];
  // mode "desc": רק «מה המנה» (הכנה/צורה/הגשה/אופי מהתיאור + בטיחות) — המרכיבים נבחנים בצ'יפים
  const ings = mode === "desc" ? [] : targets ? targets.map((t) => ({ t: t.t, alt: t.alt || [] })) : (dish.ingredients || []).map((x) => ({ t: x, alt: [] }));
  // מרכיב שהוא גם אופן הכנה («טמפורה») יורש את הניסוחים של ההכנה — «מטוגנים» מזכה אותו
  // רק כשמילת ההכנה היא מפתח של המרכיב («טמפורה», «שרימפס טמפורה») — לא תואר בתוכו: «פלפל חריף»
  // אינו יורש «ספייסי/חריפות», ו«קרם» ≈ «קרמי» (תחילית) לא מוריש ל«קרם אבוקדו» את «קרמיות»
  const prepAltsFor = (t) => { const keys = ingredientKeys(t); return PREP.filter(([key]) => keys.includes(norm(key))).flatMap(([, forms, alts]) => [...forms, ...alts]); };
  const order = (dish.ingredients || []).map(norm);
  for (const { t, alt } of ings) rows.push({ id: `ing:${t}`, kind: "ing", canonical: [t], alt: [...alt, ...prepAltsFor(t)], crit: false, w: rowWeight(t, Math.max(0, order.indexOf(norm(t)))) });
  const dt = toks(String(dish.desc || ""));
  const ingKeys = new Set(ings.map((i) => norm(i.t)));
  // מילה שהכרטיס עצמו שולל («לא מבושל לגמרי» = מדיום רייר) אינה שורה — אחרת מלצר שכותב בדיוק
  // את מה שכתוב בכרטיס מסומן «סותר» (הבוטים על ההמבורגר, 6.9)
  const cardNeg = negIndex(dt);
  const mentionedExact = (phrase) => exactRuns(toks(phrase), dt).some((i) => !cardNeg[i]);
  for (const [key, forms, answerAlts] of PREP) {
    if ([...ingKeys].some((k) => toks(k).some((w) => same(w, key)))) continue;   // «טמפורה» כבר מרכיב
    // זיהוי לפי המילה עצמה ונטיותיה בלבד — «מטוגן» בתיאור אינו ראיה לטמפורה (נתפס חי על נאמס: שורת
    // «טמפורה» צצה למנה בלי טמפורה). הנרדפות משמשות רק לזיכוי התשובה, לא לבניית השורה.
    // במצב desc אופן ההכנה הוא «מה זה» (1.5); במצב all (מרכיבים+הכנה) הוא לא יותר ממרכיב רגיל (1)
    if ([key, ...forms].some(mentionedExact)) rows.push({ id: `desc:${key}`, kind: "desc", canonical: [key], alt: [...forms, ...answerAlts], crit: false, w: mode === "desc" ? (PREP_W[key] ?? 1.5) : 0.5 });
  }
  if (mode === "desc") {
    // שורות צורה/הגשה/אופי — לפי **טוקנים** של התיאור, לא substring: «קר» ישב בתוך «בקר»/«קרם»/
    // «קרוטונים» ו«חם» בתוך «לחם»/«חמוץ», וכל מנה קיבלה שורות «קר» ו«חם» (נתפס ע"י הבוטים, 6.9).
    const formRows = [];
    // צורת המנה גם מהשם («סלט קיסר», «מרק פו») — «זה סלט» הוא «מה זה», במשקל 1 (בשם, לא ידע גדול)
    const nt = toks(String(dish.name || ""));
    const inName = (phrase) => exactRuns(toks(phrase), nt).length > 0;
    for (const [key, forms, w, answerAlts] of FORM) {
      if (rows.some((r) => r.canonical[0] === key)) continue;
      if ([key, ...forms].some(mentionedExact)) formRows.push({ id: `form:${key}`, kind: "form", canonical: [key], alt: [...forms, ...answerAlts], crit: false, w });
      else if (w === 2 && [key, ...forms].some(inName)) formRows.push({ id: `form:${key}`, kind: "form", canonical: [key], alt: [...forms, ...answerAlts], crit: false, w: 1 });
    }
    // תארים (0.5) — לכל היותר שניים; ובסך הכול לא יותר מ-MAX_DESC_ROWS שורות תיאור, הכבדות קודם
    const adj = formRows.filter((r) => r.w === 0.5).slice(0, MAX_ADJ_ROWS);
    rows.push(...formRows.filter((r) => r.w !== 0.5), ...adj);
    const descRows = rows.filter((r) => r.kind === "desc" || r.kind === "form").sort((a, b) => b.w - a.w).slice(0, MAX_DESC_ROWS);
    for (let k = rows.length - 1; k >= 0; k--) if ((rows[k].kind === "desc" || rows[k].kind === "form") && !descRows.includes(rows[k])) rows.splice(k, 1);
    // «מה זה» כולל גם את מה שיש בה: כל מרכיב שאיל כשורה במשקל חצי (תיבול — רבע) — «יוגורט יווני עם
    // מלפפון» הוא תיאור של צזיקי גם בלי מילת צורה, ורשימת מרכיבים חלקית שווה «חלקי», לא אפס (הבוטים, 6.9).
    // מרכיב שיושב בשם המנה אינו ידע (ניטרלי). המופע הכללי מזכה («ביצה» על «חביתה» — genericAlt).
    const nameW = toks(String(dish.name || ""));
    for (const [k, x] of (dish.ingredients || []).entries()) {
      if (toks(x).every((t) => nameW.some((n) => wMatch(t, n)))) continue;
      rows.push({ id: `core:${x}`, kind: "core", canonical: [x], alt: genericAlt(x), crit: false, w: rowWeight(x, k) === 0.5 ? 0.25 : 0.5 });
    }
  }
  // בטיחות = מה שמשנה את התיאור עצמו: **דג נא / בשר נא** חייבים להיאמר (יותם) — שורת crit שהשופט
  // לא יכול לבטל. שאר דגלי ההריון (נבטים חיים, גבינה לא מפוסטרת, ביצה חיה) הם ידע שמזכה כשנאמר
  // ולא מאפס תיאור טוב כשלא (הבוטים, 6.9: כל שש הפרסונות, כולל הוותיק, לא הזכירו נבטים בצ'יקן
  // קשיו — זה לא «תיאור גרוע»). «דגים עתירי כספית» אינו חלק מתיאור (כמו בכרטיסייה).
  // שער האמת (examiner.md): תשובת הבית — כרטיס המנה עצמו — חייבת לעבור. שורת בטיחות נאכפת רק
  // כשהכרטיס (תיאור/שם/קטגוריה) נותן למלצר את העובדה («נא», «סשימי», «טרטר», «דגים נאים»…); כרטיס
  // שמסתפק בדגל (קראנץ' רול: «ספייסי טונה», בלי «נא») ⇒ שורת ידע (warn) — מזכה כשנאמר, לא מאפס.
  const cardText = `${dish.name || ""} ${dish.category || ""} ${dish.desc || ""}`;
  const cardHas = (p) => [p, ...(CRIT_ALT[p] || [])].some((a) => exactRuns(toks(a), toks(cardText)).length > 0);
  for (const p of dish.pregnancy || []) {
    if (/כספית/.test(p)) continue;
    const raw = p === "דג נא" || p === "בשר נא";
    if (raw && cardHas(p)) rows.push({ id: `crit:${p}`, kind: "crit", canonical: [p], alt: CRIT_ALT[p] || [], crit: true });
    else rows.push({ id: `warn:${p}`, kind: "warn", canonical: [p], alt: CRIT_ALT[p] || [], crit: false, w: raw ? 1 : 0.5 });
  }
  return rows;
}

// «פילה דניס» נענה ב«דניס», «טונה אדומה» ב«טונה», «גבינת פטה» ב«פטה» — מילת מפתח לבדה מספיקה;
// תואר/חלק לבדו («פילה», «אדומה», «קרם») לא (יותם, 6.9: «אני כותב טונה וזה לא מוצא כי כתוב
// טונה אדומה»). המפתחות ב-ingredientKeys — משותפים לצ'יפים ולתיאור.
// full = הניסוח עצמו · key = מפתח שלו · alt = ניסוח נלמד/מופע כללי («חסה» עבור «ירקות») — מופע
// כללי אינו «תופס» את המילה: «חסה» אחת עונה גם על «ירקות» וגם על «חסה אייסברג» באותו כרטיס
const phrasesOf = (r) => [
  ...(r.canonical || []).map((p) => ({ p, kind: "full" })),
  ...(r.canonical || []).flatMap((c) => (toks(c).length >= 2 ? ingredientKeys(c).map((p) => ({ p, kind: "key" })) : [])),
  ...(r.alt || []).map((p) => ({ p, kind: "alt" })),
];
const ROUNDS = ["full", "key", "alt"];
const exactRun = (pt, at, i) => pt.every((p, j) => wExact(at[i + j], p) || (stem(at[i + j]).length >= 3 && stem(at[i + j]) === stem(p)));
function allRuns(pt, at) {
  const out = [];
  if (!pt.length) return out;   // ⚠️ ניסוח ריק («מוגש עם» ⇒ שתי מילות-סרק) התאים לכל כרטיס
  for (let i = 0; i + pt.length <= at.length; i++) {
    let ok = true;
    for (let j = 0; j < pt.length; j++) if (!sameTok(at[i + j], pt[j])) { ok = false; break; }
    if (ok) out.push(i);
  }
  return out;
}

/** סימון דטרמיניסטי: ok / miss / wrong (הוזכר בשלילה) לכל שורה.
 *  זהות של ממש גוברת על עמומה — «אטריות» בתשובה מסמן את «אטריות זכוכית», לא גם את «פטריות»;
 *  הניסוח המלא קודם למפתח — «סלמון» לבדו הוא «סלמון», לא «ספייסי סלמון»; ומילת מפתח שמשותפת
 *  לשתי שורות («טונה» ב«טונה אדומה» וב«טרטר טונה») מסמנת אחת בכל מופע. */
export function markRows(rows, text) {
  const at = enToHe(toks(String(text || "")));
  const neg = negIndex(at);
  // מי יושב במדויק על כל מילה בתשובה — התאמה עמומה של שורה אחרת שם נדחית
  const exactAt = at.map(() => new Set());
  const hitsOf = rows.map((r) => {
    const hits = [];
    for (const { p, kind } of phrasesOf(r)) {
      const pt = toks(p); if (!pt.length) continue;
      for (const i of allRuns(pt, at)) {
        const exact = exactRun(pt, at, i);
        if (exact && kind !== "alt") for (let j = 0; j < pt.length; j++) exactAt[i + j].add(r.id);
        hits.push({ pt, i, exact, kind });
      }
    }
    return hits.sort((a, b) => (b.exact - a.exact) || (b.pt.length - a.pt.length));
  });
  // שיבוץ גלובלי: ניסוח מלא ⇒ מפתח ⇒ מופע כללי; בתוך סבב — זהות של ממש, ואז הארוך קודם
  // («בצל ירוק» תופס את שתי המילים לפני ש«בצל» לבדו תופס את הראשונה)
  const all = hitsOf.flatMap((hits, ri) => hits.map((h) => ({ ...h, ri })))
    .sort((a, b) => (ROUNDS.indexOf(a.kind) - ROUNDS.indexOf(b.kind)) || (b.exact - a.exact) || (b.pt.length - a.pt.length) || (a.ri - b.ri));
  const claimed = new Set();                                  // מופע של מילה משרת שורה אחת (full/key)
  const status = rows.map(() => "miss");
  for (const { ri, pt, i, exact, kind } of all) {
    if (status[ri] === "ok") continue;
    const r = rows[ri];
    if (!exact && pt.some((_, j) => [...exactAt[i + j]].some((id) => id !== r.id))) continue;
    if (kind !== "alt" && pt.some((_, j) => claimed.has(i + j))) continue;
    const phraseNeg = pt.some((t) => NEG_LIST.includes(t));                    // «לא מבושל» מכיל שולל בעצמו
    const denied = !phraseNeg && pt.some((_, j) => neg[i + j]);
    if (denied) { status[ri] = "wrong"; continue; }
    status[ri] = "ok";
    if (kind !== "alt") for (let j = 0; j < pt.length; j++) claimed.add(i + j);
  }
  return rows.map((r, ri) => ({ ...r, status: status[ri] }));
}

/** ציון: כיסוי **משוקלל** (מרכזי 2 · תיבול 0.5) — 50% = מלא, 25% = חלקי; סתירה/טענה זרה מורידות
 *  (כמשקל השורה, טענה זרה = 1); כשל בטיחות = 0. easy (features.exam_easy): 40% / 20%. */
export function scoreRows(rows, foreignCount = 0, { easy = false } = {}) {
  // שורת בטיחות שנאמרה («נא») היא חלק מ«מה זה» — נספרת בכיסוי; כשלא נאמרה — כשל בטיחות ממילא
  const main = rows.filter((r) => !r.crit || r.status === "ok");
  const W = (r) => (r.w ?? 1);
  const total = main.reduce((a, r) => a + W(r), 0);
  const okW = main.filter((r) => r.status === "ok").reduce((a, r) => a + W(r), 0);
  const wrongW = main.filter((r) => r.status === "wrong").reduce((a, r) => a + W(r), 0) + foreignCount;
  const ok = main.filter((r) => r.status === "ok").length;
  const wrong = main.filter((r) => r.status === "wrong").length + foreignCount;
  const n = main.length;
  const cover = total ? Math.max(0, okW - wrongW) / total : (wrong ? 0 : 1);
  const safety = safetyVerdict(rows);
  // תיאור (בלי שורות מרכיבים): 50% = מלא — השורות הן «מה הכרטיס מזכיר» ולא «מה חובה לומר», ותיאור
  // טוב מכסה כחצי מהן (הבוטים, 6.9). עם שורות מרכיבים (מצב all): 60% — מרכיב מרכזי חסר אינו מלא.
  const withIngs = rows.some((r) => r.kind === "ing");
  const [full, part] = easy ? [0.4, 0.15] : (withIngs ? [0.6, 0.25] : [0.5, 0.2]);
  // סתירה מוצהרת (אופן הכנה הפוך, טענה זרה מהשופט) — לכל היותר חלקי
  const lvl = safety ? 0 : Math.min(cover >= full ? 2 : cover >= part ? 1 : 0, foreignCount > 0 ? 1 : 2);
  return { lvl, cover, ok, wrong, n, safety };
}

/**
 * תיאור חופשי ⇒ {rows, lvl, cover, safety, note, foreign, judged}.
 * `judge` = קריאה אסינכרונית ל-exam-judge v5 (null ⇒ דטרמיניסטי בלבד). נקרא רק כשיש מה
 * להכריע: שורה שלא זוהתה, או ציון לא-מלא — תיאור שכל שורותיו זוהו לא עולה כסף.
 */
export async function gradeDescription({ dish, targets = null, text, judge = null, easy = false, mode = "all" }) {
  let rows = markRows(buildRows(dish, targets, { mode }), text);
  const contra = prepContradictions(rows, text);
  let s = scoreRows(rows, contra.length, { easy });
  let note = "", foreign = [], judged = false;
  const words = toks(String(text || "")).length;
  // השופט נקרא כשיש מה להכריע: שורה שלא זוהתה, ציון לא-מלא — **או טענה שהדטרמיניסטי עיוור לה**:
  // שלילה («בלי דגים», «לא חריף») וטענת תזונה («צמחוני», «טבעוני», «כשר») יכולות להכחיש עובדה
  // בלי לגעת באף שורה («מרק צמחוני לגמרי, בלי דגים» על מרק עם דאשי ⇒ היה מלא; הבוטים, 6.9).
  const at = enToHe(toks(String(text || "")));
  const claims = negIndex(at).some(Boolean) || at.some((w) => CLAIM_WORDS.has(w));
  const needJudge = !!judge && words >= 3 && (s.lvl < 2 || rows.some((r) => !r.crit && r.status === "miss") || claims);
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
        s = scoreRows(rows, foreign.length + contra.length, { easy });
        judged = true;
      }
    }
  }
  return { rows, ...s, note, foreign, judged, contradictions: contra };
}
