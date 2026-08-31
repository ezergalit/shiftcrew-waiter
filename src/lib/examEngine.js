// מנוע המבחן — ported verbatim from Desktop/exam-engine-prototype/engine.mjs (27.8).
//
// ⚠️ This file is the METHOD and must stay a faithful copy of the prototype: the prototype
// carries the eval harness (`node eval.mjs`, 55 hand-labelled answers) that proves the
// grader's accuracy, and the two diverging would make that number meaningless. The only
// edits on the way in were removing `node:fs` and the demo `loadMenu` — everything below
// is byte-identical to the version whose eval reads 100% accuracy / 9% escalation.
//
// What it does, in one line each:
//   generate(menu)      → exam moves derived from the restaurant's own rows, no hand-writing
//   grade(q, answer)    → {lvl 0|1|2, escalate} from an OPEN answer, no options on screen
//   setMenuVocab(menu)  → tells the grader which words the restaurant actually uses, so a
//                         foreign word (synonym / transliteration) is what triggers tier 2

// מנוע המבחן — the METHOD, not the questions.
//
// The user's requirement (2026-08-27): stop fixing questions one by one. One machine that
//   1. SIMULATES every situation a waiter meets — what's in a dish, allergies, recommend,
//      build a roll on the tablet, recommend a cocktail — generated from the restaurant's
//      own rows, for any restaurant;
//   2. GRADES open answers with no options on screen — deterministically wherever
//      possible, escalating only genuinely ambiguous answers to a cheap LLM judge.
//
// ── The grading principle that everything hand-built earlier collapses into ──────────
//
//   A question spec is derived per dish, never written by hand:
//     targets  = the dish's askable ingredients / declared allergens
//     free     = words the prompt itself hands out (dish name, category) → neutral
//     req      = the DETAILS of the answer;  half = the POLARITY (כן/לא) → partial
//     bad      = same-pool dishes that fail the constraint → naming one = fail
//     alt      = same fact in other words — seeded from the description, extended once
//                per dish by a cheap LLM at GENERATION time (not per answer), cached.
//
//   Grading cascade per answer:
//     tier 1: deterministic fuzzy Hebrew matcher (free)        — target ≥85% of answers
//     tier 2: uncertainty gate → cheap LLM judge (Haiku-class) — only unmatched substance
//     every tier-2 verdict writes its phrasing back into `alt`  → tier-2 rate decays.


/* ══ Hebrew fuzzy matcher — the same engine the exam page runs ══ */
export const norm = w => w.toLowerCase()
  .replace(/['׳״"”“]/g, "").replace(/[־\-–—]/g, " ")
  .replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ")
  .replace(/[^a-z0-9א-ת ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["עמ","של","את","על","או","גמ","זה","זו","יש","הוא","היא","עוד","כל","עם","גם","וגם","אבל","רק","כי","מה","בו","בה","מנה","מוגש","מוגשת"]);
export const toks = s => norm(s).split(" ").filter(w => (w.length > 1 || /\d/.test(w)) && !STOP.has(w));
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
const pvars = w => {
  const out = [w];
  if (w.length >= 3 && "ובהלמשכ".includes(w[0])) out.push(w.slice(1));
  if (w.length >= 5 && (w.endsWith("ימ") || w.endsWith("ות"))) out.push(w.slice(0, -2)); // plural fold
  return out;
};
function wBase(a, b) {
  if (a === b) return true;
  const L = Math.min(a.length, b.length);
  if (L >= 3 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3) return true;
  return lev(a, b) <= (L <= 3 ? 0 : L <= 5 ? 1 : 2);
}
// consonant-skeleton transliteration: Hebrew "דיאבלו" ⇒ dbl, Latin "diablo" ⇒ dbl.
// Covers the common cocktail/whisky names; what it misses escalates to the AI tier.
const H2L = { "ב":"b","ג":"g","ד":"d","ז":"z","ח":"h","ט":"t","כ":"k","ל":"l","מ":"m","נ":"n","ס":"s","פ":"p","צ":"ts","ק":"k","ר":"r","ש":"s","ת":"t","ו":"v","ף":"p","ך":"k","ם":"m","ן":"n","ץ":"ts" };
const skel = w => /[א-ת]/.test(w)
  ? [...w].map(c => H2L[c] || "").join("")
  : w.replace(/[aeiouwy'h]/g, "");
function translitEq(a, b) {
  const sa = skel(a), sb = skel(b);
  return sa.length >= 2 && sb.length >= 2 && lev(sa, sb) <= 1;
}
export const wMatch = (a, b) => {
  for (const va of pvars(a)) for (const vb of pvars(b)) if (wBase(va, vb)) return true;
  if (/[a-z]/.test(a) !== /[a-z]/.test(b)) return translitEq(a, b);
  return false;
};
export const inToks = (word, tokens) => tokens.some(t => wMatch(t, norm(word)));
export const entryOk = (entry, tokens) => { const ws = toks(entry); return ws.length > 0 && ws.every(w => inToks(w, tokens)); };

/* ══ Derivations from a dish row ══ */
const GENERIC = ["אורז", "אורז סושי", "אצה", "נורי", "אצות", "רוטב", "עשבי תיבול"]; // never askable (the app's rice-and-nori rule)
// Domain-universal allergen synonyms — "חלב" answers a לקטוז question in any restaurant.
const ALLERGEN_ALT = {
  "לקטוז": ["חלב", "חלבי", "מוצרי חלב"],
  "גלוטן": ["קמח", "חיטה"],
  "ביצים": ["ביצה"],
  "אגוזים": ["אגוז", "אגוזי מלך", "קשיו", "לוז"],
  "בוטנים": ["בוטן"],
  "רכיכות": ["פירות ים"],
  "שומשום": ["טחינה"],
};

// מילון תיאורי טעם ואופי (יותם, 31.8): «מתוק» ו«מתקתק» הן אותה תשובה, וכך גם
// «ישראלי» מול «ישראלית» — הצ'יפ שנשמר בבחינה חייב להתיישב עם מה שכתוב בתשובה.
// wMatch כבר סולח על הטיות מגדר ועל טעות אות (ידראלית⇒ישראלית), אבל מילים
// נרדפות אמיתיות (מר/מריר, חמוץ/חמצמץ) רחוקות מדי ממנו — ולכן המילון.
// המילון משמש גם לחילוץ שאלות הטעם של הקוקטיילים מתוך התיאור.
const DESC_CLUSTERS = [
  ["מתוק", "מתקתק", "מתוקה", "מתקתקה", "מתיקות"],
  ["מר", "מריר", "מרירה", "מרירות"],
  ["חמוץ", "חמצמץ", "חמוצה", "חמצמצה", "חומציות", "חמיצות"],
  ["חריף", "חרפרף", "חריפה", "פיקנטי"],
  ["מרענן", "רענן", "מרעננת", "רעננה", "רעננות"],
  ["קליל", "קל", "קלילה", "קלה"],
  ["חזק", "עוצמתי", "חזקה", "עוצמתית", "קשה", "כבד", "כבדה"],
  ["עדין", "עדינה", "חלש", "חלשה"],
  ["יבש", "יבשה"], ["מעושן", "מעושנת"], ["פירותי", "פירותית"],
  ["טרופי", "טרופית"], ["עשיר", "עשירה"], ["עשבוני", "עשבונית"],
  ["מוגז", "מוגזת"], ["הדרי", "הדרית"], ["עמוק", "עמוקה"],
  ["אלכוהולי", "אלכוהולית"], ["מינרלי", "מינרלית", "מינרליות"],
  ["פרחוני", "פרחונית"], ["סמיך", "סמיכה"], ["מאוזן", "מאוזנת"],
  ["בהיר", "בהירה"], ["כהה"], ["צלול", "צלולה"], ["ירקרק", "ירקרקה"],
  ["ישראלי", "ישראלית"], ["יפני", "יפנית"], ["איטלקי", "איטלקית"],
  ["גרמני", "גרמנית"], ["צרפתי", "צרפתית"], ["בווארי", "בווארית"],
  ["ארגנטינאי", "ארגנטינאית"],
];
// ⚠️ Keys are NORMALIZED through toks() — it folds final letters (חמצמץ⇒חמצמצ), so a
// raw-string map silently misses half the dictionary. Lookups also strip a leading ו'
// («ועשיר» in prose is עשיר).
const ORIGIN_WORDS = new Set(["ישראלי", "יפני", "איטלקי", "גרמני", "צרפתי", "בווארי", "ארגנטינאי"]);
// בירה נבחנת על המושגים, לא על כל התו (יותם, 31.8: «להבחין במושג ישראלי, כהה,
// בהיר, יפני — לא ממש צריך את כל הפרטים האחרים»): סוג + צבע + מוצא + אופי מבחין.
const BEER_CORE_RE = /לאגר|אייל|סטאוט|חיטה|כהה|בהיר|מסוננת|בוטיק|ישראלי|יפני|גרמני|בווארי|בלגי|צ'כי/;
// סוגי האלכוהול בקוקטייל — הדגש העיקרי של שאלת המרכיבים (יותם, 31.8).
const ALCOHOL_RE = /וודקה|ג'ין|רום|טקילה|מזקל|קמפרי|אמארו|ורמוט|ליקר|ויסקי|ברנדי|קוניאק|אפרול|סן ז'רמן|יין|סאקה|ביר[הת]|אוזו|ערק|פסטיס/;
const DESC_TOK = new Map(); // normalized token -> { display, canon, cluster }
const DESC_ALT = new Map(); // display form -> display alts
for (const c of DESC_CLUSTERS) for (const w of c) {
  DESC_ALT.set(w, c.filter((x) => x !== w));
  for (const t of toks(w)) if (!DESC_TOK.has(t)) DESC_TOK.set(t, { display: w, canon: c[0], cluster: c });
}
const descTok = (w) => DESC_TOK.get(w) || DESC_TOK.get(String(w).replace(/^ו/, ""));
// זוגות סותרים (יותם, 31.8: «כתבתי קוקטייל מתוק, מר — צריך להוריד ניקוד אם
// בפועל הוא לא שניהם ואחד מהם סתם ניחוש»). רק ניגודים אמיתיים שלא מתקיימים
// יחד — מתוק-וחמוץ קיים, מתוק-ומר במשקה אחד הוא ניחוש.
const DESC_OPPOSITE = {
  "מתוק": ["מר", "יבש"], "מר": ["מתוק"], "יבש": ["מתוק"],
  "חזק": ["עדין", "קליל"], "עדין": ["חזק"], "קליל": ["חזק"],
  "בהיר": ["כהה"], "כהה": ["בהיר"],
};
// alt forms for a descriptor chip: cluster-mates of every known word in it. A multiword
// chip ("חצי יבש") swaps the known word in place so the alt stays a real phrase.
export const descAlts = (chip) => {
  const alts = new Set();
  const words = toks(chip);
  for (const w of words) {
    const hit = descTok(w);
    if (!hit) continue;
    for (const a of hit.cluster) {
      if (a === hit.display) continue;
      alts.add(words.length === 1 ? a : String(chip).replace(hit.display, a));
    }
  }
  return [...alts];
};
const HEBNUM = { 1:"אחד אחת", 2:"שניים שתי שתיים", 3:"שלוש שלושה", 4:"ארבע ארבעה", 5:"חמש חמישה", 6:"שש שישה", 8:"שמונה" };

export const nameToks = d => toks(d.name);
export const askable = d => (d.ingredients || []).filter(i =>
  !GENERIC.some(g => norm(g) === norm(i)) &&
  !toks(i).every(w => nameToks(d).some(n => wMatch(w, n))));   // given-in-name → not askable

// distinctive name tokens vs siblings — "קראנץ" identifies the roll, "רול" identifies nothing
export function distinctive(d, pool) {
  const sibs = pool.filter(x => x !== d);
  return nameToks(d).filter(t => sibs.filter(s => nameToks(s).some(n => wMatch(t, n))).length <= Math.max(0, Math.floor(pool.length * 0.2)));
}

// The change-sentence parser: "ניתן להוריד מלפפון או צ'ילי" / "לא ניתן לבצע שינויים בתוספות"
// → req = the DETAILS, half = the POLARITY. This is the generalised form of what was built
// by hand for שאלה 1, derived for any dish whose description states its change policy.
const CHANGE_VERBS = new Set(["ניתנ","אפשר","אפשרי","לשנות","להוריד","להוסיפ","לבצע","להחזיר","להפוכ","מלבד","הבסיס","במנה","כל","רכיב","לעבור","ולעבור","וככ","מומלצ","להגיש","עד"]
  );  // NOTE: entries are written in NORMALIZED form (final letters folded) —
      // they are compared against toks() output, which folds ן→נ, ף→פ, ך→כ.
export function parseChange(d) {
  const all = [...(d.desc || "").matchAll(/(?:לא ניתן|אין שינויים|ניתן|אפשר)[^.׃]*/g)].map(x => x[0]);
  // Only a sentence that is actually ABOUT changes qualifies. "לא ניתן להחזיר" (a searing
  // note) generated a garbage key on the full menu — no change-keyword ⇒ no question.
  const sent = all.find(x => /לשנות|להוריד|להוסיף|שינויים|להחליף/.test(x));
  if (!sent) return null;
  const neg = /לא ניתן|אין שינויים/.test(sent);
  const ingT = new Set((d.ingredients || []).flatMap(i => toks(i)));
  const content = toks(sent).filter(t => !CHANGE_VERBS.has(t));
  const ingHits = content.filter(t => ingT.has(t) || [...ingT].some(x => wMatch(t, x)));
  const others = content.filter(t => !ingHits.includes(t));
  // ingredient words first, sentence nouns after, capped at two — the answer's two details
  const details = [...ingHits, ...others].slice(0, 2);
  if (!details.length) return null;
  return {
    neg,
    req: details.map(t => [t]),
    half: [neg ? ["לא", "אסור", "אין", "אי אפשר"] : ["כן", "בהחלט"]],
    sentence: sent.trim(),
  };
}

export function parseUnits(d) {
  const ms = [...(d.desc || "").matchAll(/(\d+)\s*(?:יח|ספרינג|אצבעות|קוביות|כיסוני|שרימפס|יחידות)/g)];
  const nums = [...new Set(ms.map(x => x[1]))];
  if (nums.length !== 1) return null;                      // two different counts = ambiguous, skip
  const n = nums[0];
  return [[n, ...(HEBNUM[+n] || "").split(" ").filter(Boolean)]];
}

const isVegan = d => /טבעוני/.test(d.desc || "") && !/אינו צמחוני|לא צמחוני/.test(d.desc || "");
// free = the dish's whole vocabulary: name + description + ingredient phrasing. Anything
// the dish's own page says is at worst neutral — never an "invention".
const freeFor = d => [...new Set([...nameToks(d), ...toks(d.desc || ""), ...(d.ingredients || []).flatMap(i => toks(i))])];

/* ══ Situation generators — each returns exam moves in the page schema ══ */
export function generate(menu) {
  const out = [];
  // תדריכי בטיחות (כרטיס «דגים נאים — מה חובה לומר» של סלון) מבודדים מהתפריט
  // לפני הכל — הם לא מנות, והשאלה היחידה שהם מולידים משויכת לקטגוריית האוכל
  // שהם מדברים עליה, כך שהיא נשאלת בבוחן של דגים נאים ולא בשום הדרכה.
  const briefs = menu.filter((d) => d.safetyBrief);
  menu = menu.filter((d) => !d.safetyBrief);
  const byCat = {};
  for (const d of menu) (byCat[d.category] = byCat[d.category] || []).push(d);
  for (const b of briefs) {
    const cat = Object.keys(byCat).find((c) => (b.name || "").includes(c) || (b.desc || "").includes(c));
    if (!cat) continue;
    const hasMykonos = /מיקונוס/.test(b.desc || "");
    out.push({
      sit: "dishrec", dish: `${cat} · מה חובה לומר`, cat, k: "recall", secs: 75, crit: true,
      ask: `אורחת בהיריון מתעניינת ב${cat} ושואלת מה חשוב לדעת. מה חובה לומר לה?`,
      targets: [
        { t: "הכול מוגש נא", must: ["נא"], ctx: toks(b.desc || "") },
        ...(hasMykonos ? [{ t: "גם מיקונוס רוסט טונה נחשבת נא — הצריבה חיצונית בלבד",
                            alt: ["מיקונוס", "רוסט", "צרובה", "צריבה", "צרוב"] }] : []),
      ],
      free: [...toks(b.desc || ""), ...((byCat[cat] || []).flatMap((d) => toks(d.name)))],
      minOk: 1, maxInv: 1,
    });
  }

  for (const d of menu) {
    let ask = askable(d);
    // כשר וישראלי — אותה משמעות בתפריט הזה (יותם, 31.8): יין שנושא את שניהם
    // נבחן עליהם כפרט אחד, וכל אחת מהמילים עונה עליו. יין שנושא רק אחד מהם
    // (שאבלי הצרפתי הכשר, שרדונה הישראלי הלא-כשר) לא מקבל את ההשלמה — שם
    // ההבדל הוא בדיוק העובדה שנבחנת.
    let kosherIsr = null;
    if (d.drink === "יין" && ask.includes("כשר")) {
      kosherIsr = ask.find((t) => /^ישראלי/.test(t)) || null;
      if (kosherIsr) ask = ask.filter((t) => t !== kosherIsr);
    }
    // מנת-ליווי (יותם, 31.8: «בסלון יווני לא ישאלו איזה אלרגיה יש בלחם אלא
    // עם מה מוגש/ממליצים») — כשהתיאור אומר «מוגש עם» וכל המרכיבים הם הליווי,
    // השאלה היא על ההגשה, ושאלת האלרגיות הנפרדת מתייתרת: גלוטן בלחם אינו ידע.
    const servedIdx = (d.desc || "").search(/מוגש(ת|ים|ות)? עם/);
    const pairing = servedIdx >= 0 && (d.ingredients || []).length >= 2 &&
      (d.ingredients || []).every((i) => {
        const w = toks(i)[0];
        return w && toks((d.desc || "").slice(servedIdx)).some((dw) => wMatch(dw, w));
      });
    // «לא כשר» הוא עובדת בטיחות: בלי עוגן, צ'יפ «כשר» היה מזכה את היעד שמכיל
    // אותו (נתפס 31.8). יעד ששמו מתחיל ב«לא» דורש את כל מילותיו — כולל ה«לא» —
    // ו«כשר» לבדו על יין לא-כשר גם לא נשאר ניטרלי (יוצא מה-free ⇒ wrongFar).
    const negChips = ask.filter((t) => t.startsWith("לא "));
    const dFree = negChips.some((t) => t === "לא כשר")
      ? freeFor(d).filter((w) => w !== norm("כשר"))
      : freeFor(d);
    // S1 — תיאור מנה. יין בלבד מבין המשקאות (יותם, 31.8): «אורח לא יתלבט על
    // גולדסטאר — אם הוא רוצה להזמין את זה הוא מכיר כבר», ובסאקה «אף אחד לא יבקש
    // ממך לתאר — פשוט ישאלו מה יש ומה אתה ממליץ». בירה וסאקה נבחנות בהמלצות בלבד.
    // בין המשקאות רק יין וסיגר מקבלים «תתאר לי» (יותם, 31.8: «אורח לא יתלבט
    // על גולדסטאר» — וזה נכון שבעתיים לוודקה וערק): כל שאר האלכוהול נבחן
    // בהמלצות, «מה יש», בקבוקים והגשה בלבד.
    // כשהמנהל סימן ⭐ משקאות נמכרים — רק הם נשאלים «תתאר לי» פר-פריט; השאר
    // נשארים תשובות בשאלות ההמלצה אבל לא נבחנים בעצמם (יותם, 31.8: «מלצר שלא
    // יודע יינות ספציפיים חוץ מאלה שסימנתי לא צריך להישאל עליהם»). קטגוריה
    // בלי אף כוכב שומרת את כולם.
    const starGate = d.drink && !d.starred &&
      (byCat[d.category] || []).some((o) => o.drink && o.starred);
    if (ask.length >= 3 && !starGate && (!d.drink || d.drink === "יין" || d.drink === "סיגר")
        && !/שתייה קלה|משקאות קלים/.test(d.category || "")) out.push({
      sit: "describe", dish: d.name, k: "recall", secs: 75,
      // A drink has no "what's inside" — the guest asks what it is LIKE. The targets
      // are the same chips either way, so grading is untouched; only the wording changes.
      ask: d.drink
        ? `אורח מבקש שתתאר לו את ה${d.drink} ״${d.name}״. מה תגיד לו?`
        : d.event
          ? `אורח מתעניין ב״${d.name}״ ושואל מה זה כולל. מה תגיד לו?`
          : pairing
            ? `אורח מזמין ״${d.name}״ ושואל עם מה זה מוגש. מה תגיד לו?`
            : `אורח שואל מה יש ב״${d.name}״ — מלבד מה שבשם המנה. מה תגיד לו?`,
      // Drink chips are descriptors — attach the taste dictionary so «מתקתק» credits
      // a target that says «מתוק» and «ישראלי» one that says «ישראלית».
      targets: ask.map(t => ({
        t, ctx: freeFor(d),
        ...(d.drink ? { alt: t === "כשר" && kosherIsr ? [...descAlts(t), kosherIsr, ...descAlts(kosherIsr)] : descAlts(t) } : {}),
        ...(t.startsWith("לא ") ? { must: toks(t) } : {}),
      })), free: dFree,
      // קוקטייל: הדגש על סוגי האלכוהול + כמה טעמים מרכזיים — קישוט חסר לא מפיל
      // (יותם, 31.8: «כל השאר פחות משנים»).
      minOk: /קוקטייל/.test(d.category || "")
        ? Math.max(2, Math.min(4, ask.filter((t) => ALCOHOL_RE.test(t)).length + 1))
        : Math.max(2, Math.ceil(ask.length * 0.7)),
      maxInv: 1,
    });
    // S2 — אלרגיות במנה (exact — safety). מנת-ליווי מוחרגת (הלחם של סלון):
    // האלרגיות נשארות על הכרטיס ובכרטיסיות, רק לא כשאלה בפני עצמה.
    if (!pairing && (d.allergens || []).length >= 2) out.push({
      sit: "allergens", dish: d.name, k: "recall", secs: 60, crit: true,
      ask: `אורח שואל אילו אלרגנים יש ב״${d.name}״. מה תגיד לו?`,
      targets: d.allergens.map(t => ({ t, ctx: freeFor(d), alt: ALLERGEN_ALT[t] || [] })), free: freeFor(d),
      minOk: d.allergens.length, maxInv: 0,
    });
    // S5 — שינויים במנה (only when the menu states a policy)
    const ch = parseChange(d);
    if (ch) out.push({
      sit: "change", dish: d.name, k: "fact", secs: 45,
      ask: `אורח שואל אם אפשר לשנות משהו ב״${d.name}״. מה עונים לו?`,
      req: ch.req, half: ch.half, ans: ch.sentence,
    });
    // S6 — יחידות
    const un = parseUnits(d);
    if (un) {
      const others = Object.entries(HEBNUM).filter(([n]) => n !== un[0][0])
        .flatMap(([n, w]) => [n, ...w.split(" ")]);
      out.push({
        sit: "units", dish: d.name, k: "fact", secs: 30,
        ask: `כמה יחידות מגיעות ב״${d.name}״?`, req: un, ans: un[0][0], capBad: others,
      });
    }
  }

  // S4 — הרכבה בטאבלט (reverse identification) — sushi-like categories
  for (const [cat, pool] of Object.entries(byCat)) {
    if (pool.length < 3) continue;
    if (pool[0]?.event) continue; // "איזו מנה תדפיס למטבח" is nonsense for a package
    // וגם לא למשקאות: «הזמנה על הצ'ק: וודקה פולנית, מנה ודאבל» אינה הזמנה —
    // צ'יפים של משקה הם תיאור, לא מרכיבים שמודפסים למטבח. נתפס בשער האמת.
    if (pool[0]?.drink) continue;
    for (const d of pool) {
      const ing = askable(d);
      const dist = distinctive(d, pool);
      if (ing.length < 3 || !dist.length) continue;
      out.push({
        sit: "build", dish: d.name, k: "fact", secs: 45,
        ask: `הזמנה על הצ'ק: ${ing.join(", ")}. איזו מנה מ${cat} תדפיס למטבח?`,
        req: [dist], ans: d.name,
      });
    }
  }

  // S3 — המלצה תחת אילוץ (brief: names gate + description + warnings, bad = the traps)
  const constraints = [
    { key: "vegan", label: "טבעוני", ok: isVegan, ctx: "לקוח טבעוני מבקש המלצות." },
    ...["בוטנים", "לקטוז", "ביצים"].map(a => ({
      key: "no-" + a, label: `אלרגי ל${a}`,
      ok: d => (d.allergens || []).length > 0 && !(d.allergens || []).includes(a),
      badWhen: d => (d.allergens || []).includes(a),
      ctx: `לקוח אלרגי ל${a} מבקש המלצות.`,
    })),
  ];
  for (const c of constraints) {
    const yes = menu.filter(c.ok);
    const no = menu.filter(d => c.badWhen ? c.badWhen(d) : !c.ok(d));
    if (yes.length < 2 || no.length < 1) continue;
    out.push({
      sit: "recommend", constraint: c.key, k: "brief", secs: 120, gate: 0,
      crit: c.key !== "vegan",
      ask: `${c.ctx} המלץ על שתי מנות — עם תיאור ומה שחשוב לציין, כמו מול הלקוח.`,
      sections: [
        { name: "שמות מנות מתאימות", entries: yes.map(d => distinctive(d, menu).join(" ") || d.name), min: 2 },
        { name: "תיאור המנות", entries: [...new Set(yes.flatMap(d => askable(d).slice(0, 5)))], min: 3 },
        { name: "אזהרות ומוקשים", entries: [...new Set(yes.flatMap(d => [...(d.allergens || []), ...(d.pitfalls || [])]))], min: 1 },
      ],
      bad: no.map(d => distinctive(d, menu).join(" ") || d.name)
        .filter(b => !yes.some(pd => toks(pd.name).some(t => toks(b).some(bt => wMatch(bt, t)))))
        .slice(0, 12),
      pick: yes.map(d => d.name),
    });
  }

  // S7 — בר: המלצה לפי בסיס אלכוהולי (יותם, 31.8: «תמליץ לי על קוקטייל על בסיס
  // וודקה ותתאר אותו»). היה sit:"bar" שדרש למנות את *כל* הקוקטיילים המתאימים —
  // הוחלף בהמלצה: אחד מספיק, ומילות התיאור של המתאימים חופשיות כדי ש«ותתאר
  // אותו» לא יעניש.
  const cockt = menu.filter(d => /קוקטייל/.test(d.category || ""));
  const cocktDistinct = (d) => toks(d.name).filter((w) => w.length >= 3 &&
    !cockt.some((o) => o !== d && toks(o.name).some((ow) => wMatch(w, ow))));
  const cocktTargets = (list) => list.map((d) => {
    const dw = cocktDistinct(d);
    const shared = toks(d.name).some((w) =>
      cockt.some((o) => o !== d && toks(o.name).some((ow) => wMatch(w, ow))));
    return { t: d.name, ...(shared && dw.length ? { must: [dw[0]] } : {}), alt: dw };
  });
  for (const spirit of ["ג'ין", "וודקה", "טקילה", "מזקל", "רום", "ויסקי", "קמפרי", "אמארו"]) {
    const match = cockt.filter(d => (d.ingredients || []).some(i => toks(i).some(w => wMatch(w, norm(spirit)))));
    if (!match.length) continue;
    out.push({
      sit: "drinkrec", dish: `קוקטיילים · בסיס ${spirit}`, cat: cockt[0].category, k: "recall", secs: 60,
      ask: `אורח מבקש קוקטייל על בסיס ${spirit}, עם מילה עליו. על מה תמליץ?`,
      targets: cocktTargets(match),
      free: [spirit, "קוקטייל", ...match.flatMap(d => [...toks(d.desc || ""), ...(d.ingredients || []).flatMap(i => toks(i))])],
      minOk: 1, maxInv: 0,
    });
  }
  // המלצת קוקטייל לפי טעם (יותם, 31.8: «קוקטייל חזק או מתוק וכו׳») — מהמילון, על
  // תיאורי הקוקטיילים. התיאור אינו רשימה סגורה ⇒ שמות הקוקטיילים שלא נמצאו
  // חופשיים: קוקטייל שמתוק באמת אבל התיאור שתק לא מפיל (כלל ה-lenient של dishrec).
  if (cockt.length >= 3) {
    const byTaste = new Map();
    for (const d of cockt) {
      const seen = new Set();
      for (const w of toks(d.desc || "")) {
        const hit = descTok(w);
        if (!hit || ORIGIN_WORDS.has(hit.canon) || seen.has(hit.canon)) continue;
        if (hit.canon.startsWith("אלכוהול")) continue; // «קוקטייל אלכוהולי» — כולם כאלה
        seen.add(hit.canon);
        if (!byTaste.has(hit.canon)) byTaste.set(hit.canon, { display: hit.display, match: [] });
        byTaste.get(hit.canon).match.push(d);
      }
    }
    for (const [, { display, match }] of byTaste) {
      if (match.length === cockt.length) continue; // כולם ⇒ לא מבחין
      out.push({
        sit: "drinkrec", dish: `קוקטיילים · ${display}`, cat: cockt[0].category, k: "recall", secs: 45,
        ask: `אורח מבקש קוקטייל ${display}. על מה תמליץ?`,
        targets: cocktTargets(match),
        free: [display, "קוקטייל", ...cockt.filter(o => !match.includes(o)).flatMap(o => toks(o.name))],
        minOk: 1, maxInv: 1,
      });
    }
  }
  // ---- קוקטייל נבחן גם על הטעם (יותם, 31.8: «חשוב לבחון 1. על תיאור הקוקטייל
  // 2. מרכיבים») ----
  // שאלת המרכיבים כבר קיימת (describe); כאן נוספת שאלת תיאור שנבנית מהמילים
  // שהמילון מזהה בתיאור הקוקטייל עצמו — מתוק, חמצמץ, טרופי… כל צ'יפ נושא את
  // חבריו לאשכול, אז «מתקתק» עונה על «מתוק».
  for (const d of menu) {
    if (!/קוקטייל/.test(d.category || "")) continue;
    const found = [];
    const seenClusters = new Set();
    for (const w of toks(d.desc || "")) {
      const hit = descTok(w);
      if (!hit || seenClusters.has(hit.canon)) continue;
      // «ביטר איטלקי» בתיאור קוקטייל מדבר על המרכיב, לא על טעם הקוקטייל —
      // מילות מוצא נשארות תיאור ליין/בירה/סאקה ולא נהיות יעד טעם.
      if (ORIGIN_WORDS.has(hit.canon)) continue;
      seenClusters.add(hit.canon);
      found.push(hit.display);
    }
    if (found.length < 2) continue;
    out.push({
      sit: "flavor", dish: d.name, k: "recall", secs: 60,
      ask: `אורח שואל איך ״${d.name}״ בטעם. איך תתאר לו את הקוקטייל?`,
      targets: found.map((t) => ({ t, ctx: freeFor(d), alt: descAlts(t) })), free: freeFor(d),
      minOk: Math.max(2, Math.ceil(found.length * 0.6)), maxInv: 1,
    });
  }

  // ---- המלצת מנה לפי סיטואציה (יותם, 31.8: «בכל מבחן לפחות שאלה אחת של איזו
  // מנה היית ממליץ בהתאם לסיטואציה») ----
  // הסיטואציות נגזרות מהנתונים של הקטגוריה עצמה, ורק כשהן באמת מבחינות —
  // התשובות הנכונות הן לכל היותר מחצית מהקטגוריה, אחרת «כל מנה» עונה:
  //   · אלרגיה: «אורח אלרגי ל-X» ⇒ המנות שבלי X. המלצה על מנה שנושאת את
  //     האלרגן נופלת ב-wrongFar — בדיוק הטעות שאסור למלצר לעשות.
  //   · הריון: «אורחת בהריון» ⇒ המנות בלי דגלי הריון.
  //   · העדפה: «אורח שאוהב חריף» ⇒ המנות שנושאות את המוקש.
  //   · טעם מהתיאור: «אורח מחפש משהו מתוק» ⇒ מנות שהמילון מזהה בתיאורן.
  {
    const byCat = new Map();
    for (const d of menu) {
      if (d.drink || /קוקטייל/.test(d.category || "")) continue; // למשקאות יש drinkrec
      if (!byCat.has(d.category)) byCat.set(d.category, []);
      byCat.get(d.category).push(d);
    }
    for (const [cat, dishes] of byCat) {
      if (dishes.length < 4) continue;
      const half = dishes.length / 2;
      // ⚠️ alt של שם מנה = רק המילים המבחינות שלו — מילה שמופיעה גם בשם מנה
      // אחרת בקטגוריה («סינטה» בקרפצ'יו סינטה ובאינדו סינטה) הייתה מזכה את
      // המנה הלא-נכונה. נתפס באימות, לא בניחוש.
      const distinct = (d2) => {
        const others = dishes.filter((o) => o !== d2).flatMap((o) => toks(o.name));
        return toks(d2.name).filter((w) => w.length >= 3 && !others.some((ow) => wMatch(w, ow)));
      };
      const push = (key, ask, matching, situationWords, { lenient = false } = {}) => {
        if (!matching.length || matching.length > half) return;
        // «על איזו מנה תמליץ» נשמע עקום כשממליצים על משקה — שתייה קלה וכדומה.
        if (/שתיי|משקא/.test(cat)) ask = ask.replace("על איזו מנה תמליץ?", "על מה תמליץ?");
        // שאלת טעם נשענת על התיאור, והתיאור אינו רשימה סגורה — קינוח שמתוק
        // באמת אבל התיאור שלו לא אומר זאת אסור שיפיל את המלצר. המנות האחרות
        // של הקטגוריה נכנסות ל-free: לא מזכות, לא מענישות. שאלות אלרגיה
        // והריון נשארות קשוחות — שם המלצה שגויה היא בדיוק הטעות המסוכנת.
        const free = lenient
          ? [...situationWords, ...dishes.filter((o) => !matching.includes(o)).flatMap((o) => toks(o.name))]
          : situationWords;
        out.push({
          sit: "dishrec", dish: `${cat} · ${key}`, cat, k: "recall", secs: 45,
          ask,
          // must = מילה מבחינה אחת: תשובה «סינטה» לבדה, כשגם קרפצ'יו סינטה
          // וגם אינדו סינטה קיימות ורק אחת בטוחה לאלרגי — דו-משמעית, ובשאלת
          // אלרגיה דו-משמעות היא טעות. שם בלי אף מילה ייחודית ⇒ התאמת שם רגילה.
          targets: matching.map((d2) => {
            const dw = distinct(d2);
            // ה-must קיים בשביל שמות שחולקים מילה («סינטה» פעמיים) — שם שאף מילה
            // שלו לא מופיעה אצל שכן לא צריך עוגן, אחרת «תה קר» נופל על זה שלא
            // אמר «סנצ'ה» (נתפס באימות חי, 31.8).
            const shared = toks(d2.name).some((w) =>
              dishes.some((o) => o !== d2 && toks(o.name).some((ow) => wMatch(w, ow))));
            return { t: d2.name, ...(shared && dw.length ? { must: [dw[0]] } : {}), alt: dw };
          }),
          free,
          minOk: 1, maxInv: 0,
        });
      };
      // allergy-safe: most of the category carries X, the waiter must know the exceptions
      const allAllergens = [...new Set(dishes.flatMap((d2) => d2.allergens || []))];
      for (const a of allAllergens) {
        push(`בלי ${a}`,
          `אורח אלרגי ל${a} מבקש המלצה מ${cat}. על איזו מנה תמליץ?`,
          dishes.filter((d2) => !(d2.allergens || []).includes(a)), [a]);
      }
      // pregnancy-safe
      const anyPreg = dishes.some((d2) => (d2.pregnancy || []).length);
      if (anyPreg) {
        push("להריון",
          `אורחת בהריון מבקשת המלצה מ${cat}. על איזו מנה תמליץ?`,
          dishes.filter((d2) => !(d2.pregnancy || []).length), ["בהריון"]);
      }
      // likes a pitfall (חריף is the classic)
      const allPitfalls = [...new Set(dishes.flatMap((d2) => d2.pitfalls || []))];
      for (const pf of allPitfalls) {
        push(`אוהב ${pf}`,
          `אורח שאוהב ${pf} מבקש המלצה מ${cat}. על איזו מנה תמליץ?`,
          dishes.filter((d2) => (d2.pitfalls || []).includes(pf)), [pf]);
      }
      // taste words from the descriptions
      const tasteOf = (d2) => {
        const set = new Set();
        for (const w of toks(d2.desc || "")) {
          const hit = descTok(w);
          if (hit && !ORIGIN_WORDS.has(hit.canon)) set.add(hit.canon);
        }
        return set;
      };
      const tastes = new Map();
      for (const d2 of dishes) for (const t of tasteOf(d2)) {
        if (!tastes.has(t)) tastes.set(t, []);
        tastes.get(t).push(d2);
      }
      for (const [t, matching] of tastes) {
        push(`משהו ${t}`,
          `אורח מחפש משהו ${t} מ${cat}. על איזו מנה תמליץ?`,
          matching, [t], { lenient: true });
      }
    }
  }

  // ---- המלצת משקה לפי אופי (יותם, 31.8: "על איזה סאקה תמליץ ללקוח שאוהב טעם
  // חלש?") ----
  // לכל קטגוריית משקאות, כל פרט תיאור שמבחין — נישא על ידי חלק מהמשקאות ולא
  // כולם — נהיה שאלה: האורח אוהב <פרט>, על מה תמליץ? כל משקה שנושא את הפרט
  // הוא תשובה נכונה; המלצה על משקה שאינו נושא אותו נופלת ב-wrongFar (שם המשקה
  // הוא מילות תפריט). המלצה נכונה אחת = ציון מלא (minOk 1).
  {
    const byCat = new Map();
    for (const d of menu) if (d.drink) {
      if (!byCat.has(d.category)) byCat.set(d.category, []);
      byCat.get(d.category).push(d);
    }
    for (const [cat, drinks] of byCat) {
      if (drinks.length < 2) continue;
      const kind = drinks[0].drink;
      const traits = new Map();
      for (const d of drinks) for (const t of d.ingredients || []) {
        if (!traits.has(t)) traits.set(t, new Set());
        traits.get(t).add(d.name);
      }
      // «יין כשר» לבדו כמעט לא מבחין (9 מ-19) — יותם החליף אותו בשאלה מורכבת:
      // «המלץ על יין כשר — אחד לבן ואחד אדום». שני יעדים, כל אחד עונה על ידי כל
      // יין מתאים; שני לבנים = חלקי, לא כישלון.
      if (kind === "יין") {
        // ישראלי ⇒ כשר בתפריט הזה (יותם, 31.8) — אלא אם היין מסומן «לא כשר»
        // במפורש; ההיפך לא נגזר (שאבלי כשר אבל צרפתי).
        const kosher = drinks.filter((d2) => {
          const ing = d2.ingredients || [];
          return !ing.includes("לא כשר") && (ing.includes("כשר") || ing.some((x) => /^ישראלי/.test(x)));
        });
        const kWhite = kosher.filter((d2) => (d2.ingredients || []).includes("לבן"));
        const kRed = kosher.filter((d2) => (d2.ingredients || []).includes("אדום"));
        if (kWhite.length && kRed.length) {
          // מילה מבחינה = בשם היין הזה ולא בשם שום משקה אחר בקטגוריה (כלל dishrec)
          const distinctOf = (d2) => {
            const others = drinks.filter((o) => o !== d2).flatMap((o) => toks(o.name));
            return toks(d2.name).filter((w) => w.length >= 3 && !others.some((ow) => wMatch(w, ow)));
          };
          // must בלתי-אפשרי בכוונה (x/q לא קיימים בשלד עברי): רק שם יין אמיתי, דרך
          // ה-alt, מזכה — «לבן»+«אדום» לבדם הם חזרה על השאלה, לא המלצה.
          const grp = (label, group) => ({
            t: label, must: ["xqnamexq"],
            alt: group.flatMap((d2) => {
              const ws = toks(d2.name);
              // שם בלי אף מילה מבחינה («בלאן דה בלאן ירדן» — בלאן וירדן שייכות
              // גם לאחרים) עונה גם בצמד המילים הפותח, כשהצמד ייחודי בקטגוריה.
              const bigram = ws.slice(0, 2).join(" ");
              const bigramUnique = ws.length >= 2 && !drinks.some((o) => o !== d2 &&
                ws.slice(0, 2).every((w) => toks(o.name).some((ow) => wMatch(ow, w))));
              return [d2.name, ...distinctOf(d2), ...(bigramUnique ? [bigram] : [])];
            }),
          });
          out.push({
            sit: "drinkrec", dish: `${cat} · כשר לבן ואדום`, cat, k: "recall", secs: 75,
            ask: "אורח מבקש המלצה על יין כשר — אחד לבן ואחד אדום, עם מילה על כל אחד. על אילו תמליץ?",
            targets: [grp("יין כשר לבן", kWhite), grp("יין כשר אדום", kRed)],
            // מילות ההסבר של היינות הכשרים חופשיות — «ותסביר עליהם» לא מעניש.
            free: ["כשר", "לבן", "אדום", "יין",
              ...kosher.flatMap((d2) => [...(d2.ingredients || []), ...toks(d2.desc || "")])],
            minOk: 2, maxInv: 1,
          });
        }
      }
      // ---- יין: המלצות-N על פרטי הליבה בלבד (יותם, 31.8: «המלץ על 3 יינות
      // לבנים… תתרכז בדברים האלו: לבן, מבעבע, אדום, מתוק, לא מתוק, כשר, פירותי»).
      // מחליף את לולאת הפרטים הגנרית ליין — פרט אזוטרי («קטיפתי») כבר לא נשאל.
      // יין לא-נכון בתשובה מוריד נקודות (wrongFar) גם כשמולאה המכסה — «אם הוא
      // בחר יין שהוא לא אדום אבל תיאר אותו טוב, צריך להסביר ולהוריד את הנקודות».
      if (kind === "יין") {
        const nameTargets = (list) => list.map((d2) => {
          const dw = toks(d2.name).filter((w) => w.length >= 3 &&
            !drinks.some((o) => o.name !== d2.name && toks(o.name).some((ow) => wMatch(w, ow))));
          const shared = toks(d2.name).some((w) =>
            drinks.some((o) => o.name !== d2.name && toks(o.name).some((ow) => wMatch(w, ow))));
          return { t: d2.name, ...(shared && dw.length ? { must: [dw[0]] } : {}), alt: dw };
        });
        const WINE_TRAITS = [
          ["לבן", "יינות לבנים", 3], ["אדום", "יינות אדומים", 3],
          ["רוזה", "יינות רוזה", 2], ["מבעבע", "יינות מבעבעים", 2],
          ["מתוק", "יינות מתוקים", 2], ["יבש", "יינות יבשים", 2],
          ["ישראלי", "יינות ישראליים", 2], ["פירותי", "יינות פירותיים", 2],
          ["גוף מלא", "יינות בעלי גוף מלא", 2],
          // «אני רוצה רק כוס» — זמינות בכוס היא שאלת שולחן אמיתית.
          ["גם בכוס", "יינות שמוגשים גם בכוס", 2],
        ];
        for (const [chip, label, want] of WINE_TRAITS) {
          const match = drinks.filter((d2) => (d2.ingredients || []).includes(chip));
          if (match.length < 2) continue;
          const n = Math.min(want, match.length);
          out.push({
            sit: "drinkrec", dish: `${cat} · ${chip}`, cat, k: "recall", secs: 60,
            ask: `אורח מבקש המלצה על ${n} ${label}. על אילו תמליץ?`,
            targets: nameTargets(match),
            // «עם מילה על כל אחד»: מילות התיאור של היינות המתאימים חופשיות.
            free: [...toks(chip), "יין", "יינות",
              ...match.flatMap((d2) => [...(d2.ingredients || []).flatMap((i) => toks(i)), ...toks(d2.desc || "")])],
            minOk: n, maxInv: 0,
          });
        }
      }
      // «מה יש» — לכל סוגי האלכוהול חוץ מיין (יותם, 31.8 על סאקה: «פשוט ישאלו
      // מה יש ומה אתה ממליץ», ו-31.8 על הבר של סלון: «איזה וודקה המסעדה
      // מציעה?»). יין מוחרג — 30+ בקבוקים אינם רשימה שמדקלמים, ושם עובדות
      // ההמלצות לפי אופי.
      if (kind !== "יין") {
        const fem = /^(וודקה|טקילה|בירה|סמבוקה)/.test(kind) ? "איזו" : "איזה";
        out.push({
          sit: "drinkrec", dish: `${cat} · מה יש`, cat, k: "recall", secs: 60,
          ask: `אורח שואל ${fem} ${kind} יש. מה תציע לו?`,
          targets: drinks.map((d2) => ({ t: d2.name })),
          // שמות כל הפריטים חופשיים: בשאלת רשימה כל שם בקטגוריה הוא חלק
          // מהתשובה — «אוף» מ«לג'נד אוף קרמלין» אינו המצאה. נתפס בשער האמת.
          free: [...toks(kind), ...drinks.flatMap((d2) => [...toks(d2.name), ...(d2.ingredients || []).flatMap((i) => toks(i)), ...toks(d2.desc || "")])],
          minOk: Math.min(drinks.length >= 6 ? 3 : 2, drinks.length), maxInv: 1,
        });
      }
      // בקבוק לשולחן (יותם, 31.8: «איזה וודקה המסעדה מציעה? האם גם בבקבוק?») —
      // ההמלצה מוגבלת למה שבאמת מוגש בבקבוק; להמליץ על בקבוק שאין = wrongFar.
      {
        const bottled = drinks.filter((d2) => (d2.ingredients || []).some((i) => /בקבוק לשולחן|בקבוק בלבד/.test(i)));
        if (bottled.length >= 2) {
          const n = Math.min(2, bottled.length);
          out.push({
            sit: "drinkrec", dish: `${cat} · בקבוק לשולחן`, cat, k: "recall", secs: 60,
            ask: `אורח רוצה בקבוק ${kind} לשולחן. על ${n === 1 ? "איזה בקבוק" : `${n} בקבוקים`} תוכל להמליץ?`,
            targets: bottled.map((d2) => ({ t: d2.name })),
            // שמות המבוקבקים חופשיים — כולם תשובה נכונה; מי שאינו מבוקבק
            // נשאר מחוץ ל-free ולכן wrongFar, וזה בדיוק העונש הנכון.
            free: ["בקבוק", "לשולחן", ...toks(kind), ...bottled.flatMap((d2) => toks(d2.name))],
            minOk: n, maxInv: 0,
          });
        }
        // מה מגיע עם הבקבוק (יותם: «מה מגיע עם בקבוק ערק עלית») — עובדת הגשה,
        // שאלה אחת-שתיים לקטגוריה על הפריטים הראשונים בתפריט, לא על כולם.
        // ⚠️ sit:"drinkrec" בכוונה, לא סוג חדש: הבוחן הפתוח מרכיב את הישיבה
        // מ-drinkrec/dishrec בלבד — סוג שלישי היה שאלה שאף בוחן לא שואל.
        const served = drinks.filter((d2) => (d2.ingredients || []).some((i) => /קנקן לימונדה|תוספות לבקבוק/.test(i))).slice(0, 2);
        for (const d2 of served) {
          const lemonade = (d2.ingredients || []).some((i) => /קנקן לימונדה/.test(i));
          out.push({
            sit: "drinkrec", dish: `${cat} · הגשת ${d2.name}`, cat, k: "recall", secs: 45,
            ask: `אורח הזמין בקבוק ״${d2.name}״ ושואל מה מגיע איתו לשולחן. מה תגיד לו?`,
            targets: lemonade
              ? [{ t: "קנקן לימונדה", must: ["לימונדה"], alt: ["קנקן", "לימונדה"] }]
              : [{ t: "5 תוספות לבחירה", must: ["תוספות"], alt: ["תוספות", "5", "חמש", "לבחירה"] }],
            free: ["בקבוק", "לשולחן", "מגיע", ...toks(kind), ...toks(d2.name)],
            minOk: 1, maxInv: 0,
          });
        }
      }
      // בירה מהחבית (יותם, 31.8): כשיש — המלצה רגילה; כשאין — «אין» היא התשובה
      // הנכונה, והצעת חלופה מהבקבוק חופשית ולא מענישה.
      if (kind === "בירה") {
        const tap = drinks.filter((d2) => /חבית/.test([...(d2.ingredients || []), d2.desc || ""].join(" ")));
        out.push(tap.length ? {
          sit: "drinkrec", dish: `${cat} · מהחבית`, cat, k: "recall", secs: 45,
          ask: "אורח מבקש בירה מהחבית. על מה תמליץ?",
          targets: tap.map((d2) => ({ t: d2.name })), free: ["חבית", "מהחבית", "בירה"],
          minOk: 1, maxInv: 0,
        } : {
          sit: "drinkrec", dish: `${cat} · מהחבית`, cat, k: "recall", secs: 45,
          ask: "אורח מבקש בירה מהחבית. מה תגיד לו?",
          targets: [{ t: "אין אצלנו בירה מהחבית — הכול בבקבוקים", must: ["אין"], alt: ["אין"] }],
          free: ["בירה", "בקבוק", "בבקבוקים", ...drinks.flatMap((d2) => toks(d2.name))],
          minOk: 1, maxInv: 0,
        });
      }
      for (const [trait, nameSet] of traits) {
        if (kind === "יין") continue; // ליין יש את רשימת הליבה למעלה
        if (kind === "בירה" && !BEER_CORE_RE.test(trait)) continue; // רק מושגי ליבה
        // צ'יפי זמינות והגשה אינם טעם — יש להם שאלות ייעודיות למעלה, וכפילות
        // («וויסקי מנה ודאבל ומבקש המלצה») רק מרעישה את הבוחן.
        if (/בקבוק|תוספות|קנקן|מנה ודאבל|גם בכוס|מגנום|גדלים|שליש וחצי|מהחבית|בבקבוק/.test(trait)) continue;
        const names = [...nameSet];
        // פרט שכולם נושאים אינו מבחין — וגם פרט שרוב הקטגוריה נושאת הוא כמעט
        // «שם יין כלשהו», לא מבחן (יותם, 31.8: שאלות לא-חדות בצד). הרף: יותר
        // ממחצית ⇒ אין שאלה.
        if (names.length === drinks.length || names.length / drinks.length > 0.5) continue;
        // ניסוח שנקרא כמו עברית לכל סוגי הפרטים: «יין בגוף מלא», «יין עם
        // טאנינים רכים», «אורח מחפש בירת בוטיק» — לא «בירה בירת בוטיק».
        const kindWord = kind.split(" ")[0];
        const phrase = trait.startsWith("גוף") ? `${kind} ב${trait}`
          : trait === "טאנינים רכים" ? `${kind} עם ${trait}`
          : /^(בירת|שיכר)/.test(trait) ? null
          // «וודקה פולנית» כבר אומר וודקה — בלי זה יוצא «וודקה וודקה פולנית».
          : trait.includes(kindWord) ? trait
          : `${kind} ${trait}`;
        out.push({
          sit: "drinkrec", dish: `${cat} · ${trait}`, cat, k: "recall", secs: 45,
          ask: phrase
            ? `אורח אוהב ${phrase} ומבקש המלצה. על מה תמליץ לו?`
            : `אורח מחפש ${trait} ומבקש המלצה. על מה תמליץ לו?`,
          // אותו כלל מבחין כמו ב-dishrec: מילת שם ששייכת גם למשקה אחר בקטגוריה
          // אינה alt, אחרת היא מזכה את המשקה הלא-נכון.
          targets: names.map((n) => {
            const dw = toks(n).filter((w) => (w.length >= 3 || /^\d+$/.test(w)) &&
              !drinks.some((o) => o.name !== n && toks(o.name).some((ow) => wMatch(w, ow))));
            const shared = toks(n).some((w) =>
              drinks.some((o) => o.name !== n && toks(o.name).some((ow) => wMatch(w, ow))));
            return { t: n, ...(shared && dw.length ? { must: [dw[0]] } : {}), alt: dw };
          }),
          free: [trait, kind],
          minOk: 1, maxInv: 0,
        });
      }
    }
  }

  // ---- קטגוריות-וריאנטים (יותם, 31.8: «רול ניגירי זה לא מנה מורכבת — עדיף
  // לשאול איזה ניגירי מגיע, מה האופציות») — כשרוב הקטגוריה מנות פשוטות (פחות
  // מ-3 מרכיבים שאילים), הידע הוא הרשימה: «אילו יש», לא «מה יש בכל אחת».
  // מנה מורכבת בתוך קטגוריה כזו (מגורו ניגירי, 6 מרכיבים) שומרת את שאלת
  // התיאור שלה — הכלל על הקטגוריה, לא עליה.
  {
    const byVar = new Map();
    for (const d of menu) {
      if (d.drink || /קוקטייל|שתייה קלה|משקאות קלים/.test(d.category || "")) continue;
      if (!byVar.has(d.category)) byVar.set(d.category, []);
      byVar.get(d.category).push(d);
    }
    for (const [cat, dishes] of byVar) {
      if (dishes.length < 3) continue;
      const simple = dishes.filter((d) => askable(d).length < 3);
      if (simple.length / dishes.length < 0.6) continue;
      const head = cat.split("—")[0].trim();
      out.push({
        sit: "dishrec", dish: `${cat} · מה האופציות`, cat, k: "recall", secs: 60,
        ask: `אורח שואל אילו ${head} יש. מה האופציות?`,
        targets: dishes.map((d) => {
          // רף 2 אותיות ולא 3 — «ניגירי בס»: המילה המבחינה היחידה היא «בס»,
          // ובלעדיה צ'יפ «ניגירי» גנרי היה מזכה את היעד (wMatch על מילה קצרה
          // הוא ממילא התאמה מדויקת). נתפס באימות.
          const dw = toks(d.name).filter((w) => w.length >= 2 &&
            !dishes.some((o) => o !== d && toks(o.name).some((ow) => wMatch(w, ow))));
          const shared = toks(d.name).some((w) =>
            dishes.some((o) => o !== d && toks(o.name).some((ow) => wMatch(w, ow))));
          return { t: d.name, ...(shared && dw.length ? { must: [dw[0]] } : {}), alt: dw };
        }),
        free: toks(head),
        minOk: Math.min(3, dishes.length), maxInv: 1,
      });
    }
  }

  // ---- שתייה קלה (יותם, 31.8: «איזה שתייה מוגזת יש, איזה מיץ יש? ומעט
  // שאלות») — שאלות «מה יש» בלבד; אף אחד לא מבקש שתתאר לו קולה. היעדים הם
  // שמות מלאים בלי must — «קולה» לבדה עונה, וכל משקה מתאים נחשב.
  {
    const soft = menu.filter((d) => /שתייה קלה|משקאות קלים/.test(d.category || ""));
    if (soft.length >= 3) {
      const cat = soft[0].category;
      const softFree = soft.flatMap((d) => (d.ingredients || []).flatMap((i) => toks(i)));
      const fizzy = soft.filter((d) => /מוגז/.test([...(d.ingredients || []), d.desc || ""].join(" ")));
      if (fizzy.length >= 2) out.push({
        sit: "drinkrec", dish: `${cat} · מוגז`, cat, k: "recall", secs: 60,
        ask: "אורח מבקש שתייה מוגזת. מה יש להציע?",
        targets: fizzy.map((d) => ({ t: d.name })),
        free: ["מוגז", "מוגזת", "שתייה", ...softFree],
        minOk: Math.min(2, fizzy.length), maxInv: 1,
      });
      const juices = soft.filter((d) => /מיץ/.test(d.name));
      if (juices.length >= 2) out.push({
        sit: "drinkrec", dish: `${cat} · מיצים`, cat, k: "recall", secs: 45,
        ask: "אורח שואל אילו מיצים יש. מה תגיד לו?",
        targets: juices.map((d) => ({ t: d.name })),
        free: ["מיץ", "מיצים", ...softFree],
        minOk: Math.min(2, juices.length), maxInv: 1,
      });
    }
  }

  return out;
}

/* ══ Grader — tier 1 deterministic, with the uncertainty gate for tier 2 ══ */
function chipScore(cw, target) {
  const tw = toks(target.t);
  if (!cw.length || !tw.length) return -1;
  let keyed;
  if (target.must && target.must.length) keyed = target.must.every(k => inToks(k, cw));
  else {
    // ignore chip words that are dish-context ("כמהין" from the description) unless they
    // are target words; the remainder must be a sub-phrase of the ingredient
    const core = cw.filter(w => tw.some(t => wMatch(w, t)) || !(target.ctx || []).some(f => wMatch(w, norm(f))));
    keyed = core.length > 0 && core.every(w => tw.some(t => wMatch(w, t)));
  }
  if (!keyed && target.alt && target.alt.some(a => entryOk(a, cw))) keyed = true;
  if (!keyed) return -1;
  if (target.not && target.not.some(nw => inToks(nw, cw))) return -1;
  let ov = 0; for (const w of tw) if (inToks(w, cw)) ov++;
  return tw.length * 10 + ov;
}

let MENU_VOCAB = null;
export const setMenuVocab = menu => {
  MENU_VOCAB = new Set(menu.flatMap(d => [...toks(d.name), ...toks(d.desc || ""), ...(d.ingredients || []).flatMap(i => toks(i)), ...(d.allergens || []).flatMap(a => toks(a)), ...(d.pitfalls || []).flatMap(a => toks(a))]));
};
const inMenuVocab = w => MENU_VOCAB && [...MENU_VOCAB].some(v => wMatch(w, v));

export function grade(q, answer) {
  // answer: string for fact/brief, string[] chips for recall
  let lvl = 0, unknown = 0, total = 0, foreignW = 0, wrongFar = 0;
  const vocab = [];
  const addVocab = (...ws) => vocab.push(...ws.flatMap(w => toks(String(w))));

  if (q.k === "recall") {
    const chips = Array.isArray(answer) ? answer : String(answer).split(/[,·\n]+/).map(x => x.trim()).filter(Boolean);
    const matched = new Set(); let inv = 0;
    for (const t of q.targets) addVocab(t.t, ...(t.must || []), ...(t.alt || []));
    addVocab(...(q.free || []));
    // התיאורים שהאמת של השאלה באמת נושאת — כדי לזהות ניחוש סותר: «מר» על
    // קוקטייל שכל האמת שלו מתוקה נספר כטעות גם אם המילה «מתוק» שלצידו נכונה.
    const truthCanons = new Set();
    for (const t of q.targets) for (const w of [t.t, ...(t.alt || [])].flatMap((x) => toks(String(x)))) {
      const dt = descTok(w); if (dt) truthCanons.add(dt.canon);
    }
    const contradicts = (w) => {
      const dt = descTok(w);
      if (!dt || truthCanons.has(dt.canon)) return false;
      return (DESC_OPPOSITE[dt.canon] || []).some((c) => truthCanons.has(c));
    };
    for (const c of chips) {
      const cw = toks(c); total += cw.length;
      // ניגוד לאמת = טעות בטוחה, גם כשהיא רוכבת על צ'יפ שחציו נכון («מתוק מר»
      // מזוכה על המתוק — וה«מר» היה עובר חינם).
      if (truthCanons.size && cw.some(contradicts)) wrongFar++;
      let best = -1, bs = -1;
      for (let ti = 0; ti < q.targets.length; ti++) {
        if (matched.has(ti)) continue;
        const sc = chipScore(cw, q.targets[ti]);
        if (sc > bs) { bs = sc; best = ti; }
      }
      if (bs >= 0) matched.add(best);
      else if (cw.length && cw.every(w => (q.free || []).some(f => wMatch(w, norm(f))))) { /* neutral */ }
      else {
        inv++;
        const u = cw.filter(w => !vocab.some(v => wMatch(w, v)));
        unknown += u.length;
        const foreignInChip = u.filter(w => !inMenuVocab(w)).length;
        foreignW += foreignInChip;
        // ⚠️ CONFIDENTLY WRONG vs merely unrecognised. Every word of this chip is one the
        // menu uses somewhere, and none of them matched a target — so the waiter named a
        // real ingredient that is not in this dish (user, 30.8: "אם המלצר אומר מרכיב שאין
        // במנה זה צריך להוריד נקודות"). A typo never lands here: wMatch folds plurals,
        // prefixes and a Levenshtein slip, so a misspelling matches its target first. A
        // word the menu has never seen is not counted either — that is a possible synonym,
        // and it is what the judge tier exists to settle.
        if (cw.length && foreignInChip === 0) wrongFar++;
      }
    }
    const got = matched.size;
    // Naming something that is not in the dish costs the full mark, however much else
    // was right — on a plate, a confident wrong ingredient is the answer that sends an
    // allergic guest the wrong dish.
    lvl = (got >= q.minOk && inv <= (q.maxInv ?? 1) && wrongFar === 0) ? 2 : got > 0 ? 1 : 0;
    // near-full blocked by UNRECOGNISED chips → likely synonyms → judge worth paying for.
    // ⚠️ `inv > wrongFar`: don't buy a judgment on a chip we already know is wrong.
    if (lvl < 2 && inv > wrongFar && got >= q.minOk - 1) foreignW = Math.max(foreignW, 2, Math.ceil(total * 0.4));
  } else if (q.k === "fact") {
    const tokens = toks(String(answer)); total = tokens.length;
    for (const g of q.req) addVocab(...g);
    addVocab(...(q.half || []).flat(), ...(q.free || []));
    const hit = q.req.filter(g => g.some(v => entryOk(v, tokens))).length;
    lvl = hit === q.req.length ? 2 : hit > 0 ? 1
        : (q.half && q.half.some(g => g.some(v => entryOk(v, tokens)))) ? 1 : 0;
    if (q.capBad && lvl === 2 && q.capBad.some(b => inToks(b, tokens))) lvl = 1; // hedged with a wrong number
    const u = tokens.filter(w => !vocab.some(v => wMatch(w, v)));
    unknown = u.length; foreignW = u.filter(w => !inMenuVocab(w)).length;
  } else if (q.k === "brief") {
    const tokens = toks(String(answer)); total = tokens.length;
    for (const sec of q.sections) addVocab(...sec.entries);
    addVocab(...(q.bad || []));
    const secs = q.sections.map(sec => ({ ok: sec.entries.filter(e => entryOk(e, tokens)).length >= sec.min }));
    const badHit = (q.bad || []).some(b => entryOk(b, tokens));
    const okN = secs.filter(x => x.ok).length;
    if (badHit) lvl = 0;                                  // recommended a trap dish
    else if (q.gate >= 0 && !secs[q.gate].ok) lvl = 0;
    else if (okN === q.sections.length) lvl = 2;
    else lvl = 1;
    const u = tokens.filter(w => !vocab.some(v => wMatch(w, v)));
    unknown = u.length; foreignW = u.filter(w => !inMenuVocab(w)).length;
  }

  // ── the tier-2 gate: FOREIGN substance only. A menu word used wrongly is confidently
  //    wrong; a word the menu has never seen (synonym, transliteration) needs a judge. ──
  const escalate = lvl < 2 && foreignW >= 2 && total > 0 && foreignW / total >= 0.34;
  return { lvl, escalate, unknown, foreign: foreignW, total, wrong: wrongFar };
}
