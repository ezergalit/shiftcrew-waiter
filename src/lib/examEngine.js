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
  ["חזק", "עוצמתי", "חזקה", "עוצמתית"],
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
const DESC_TOK = new Map(); // normalized token -> { display, canon, cluster }
const DESC_ALT = new Map(); // display form -> display alts
for (const c of DESC_CLUSTERS) for (const w of c) {
  DESC_ALT.set(w, c.filter((x) => x !== w));
  for (const t of toks(w)) if (!DESC_TOK.has(t)) DESC_TOK.set(t, { display: w, canon: c[0], cluster: c });
}
const descTok = (w) => DESC_TOK.get(w) || DESC_TOK.get(String(w).replace(/^ו/, ""));
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
  const byCat = {};
  for (const d of menu) (byCat[d.category] = byCat[d.category] || []).push(d);

  for (const d of menu) {
    const ask = askable(d);
    // S1 — תיאור מנה
    if (ask.length >= 3) out.push({
      sit: "describe", dish: d.name, k: "recall", secs: 75,
      // A drink has no "what's inside" — the guest asks what it is LIKE. The targets
      // are the same chips either way, so grading is untouched; only the wording changes,
      // by kind: היין / הסאקה / הבירה.
      ask: d.drink
        ? `אורח מתלבט על ״${d.name}״ ומבקש שתתאר לו את ה${d.drink}. מה תגיד לו?`
        : `אורח שואל מה יש ב״${d.name}״ — מלבד מה שבשם המנה. מה תגיד לו?`,
      // Drink chips are descriptors — attach the taste dictionary so «מתקתק» credits
      // a target that says «מתוק» and «ישראלי» one that says «ישראלית».
      targets: ask.map(t => ({ t, ctx: freeFor(d), ...(d.drink ? { alt: descAlts(t) } : {}) })), free: freeFor(d),
      minOk: Math.max(2, Math.ceil(ask.length * 0.7)), maxInv: 1,
    });
    // S2 — אלרגיות במנה (exact — safety)
    if ((d.allergens || []).length >= 2) out.push({
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

  // S7 — בר: המלצה לפי בסיס אלכוהולי
  const cockt = menu.filter(d => d.category === "קוקטיילים");
  for (const spirit of ["ג'ין", "וודקה", "טקילה", "רום", "ויסקי"]) {
    const match = cockt.filter(d => (d.ingredients || []).some(i => wMatch(norm(i), norm(spirit))));
    if (!match.length) continue;
    out.push({
      sit: "bar", constraint: spirit, k: "fact", secs: 45,
      ask: `לקוח אוהב ${spirit}. אילו קוקטיילים תציע לו?`,
      req: match.map(d => [ ...distinctive(d, cockt) ]),
      ans: match.map(d => d.name).join(" · "),
    });
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
      for (const [trait, nameSet] of traits) {
        const names = [...nameSet];
        // פרט שכולם נושאים אינו מבחין — וגם פרט שרוב הקטגוריה נושאת (כשר: 9
        // מ-19 היינות) הוא כמעט «שם יין כלשהו», לא מבחן (יותם, 31.8: שאלות
        // לא-חדות בצד). הרף: יותר ממחצית ⇒ אין שאלה.
        if (names.length === drinks.length || names.length / drinks.length > 0.5) continue;
        // ניסוח שנקרא כמו עברית לכל סוגי הפרטים: «יין בגוף מלא», «יין עם
        // טאנינים רכים», «אורח מחפש בירת בוטיק» — לא «בירה בירת בוטיק».
        const phrase = trait.startsWith("גוף") ? `${kind} ב${trait}`
          : trait === "טאנינים רכים" ? `${kind} עם ${trait}`
          : /^(בירת|שיכר)/.test(trait) ? null
          : `${kind} ${trait}`;
        out.push({
          sit: "drinkrec", dish: `${cat} · ${trait}`, cat, k: "recall", secs: 45,
          ask: phrase
            ? `אורח אוהב ${phrase} ומבקש המלצה. על מה תמליץ לו?`
            : `אורח מחפש ${trait} ומבקש המלצה. על מה תמליץ לו?`,
          targets: names.map((n) => ({ t: n, alt: toks(n).filter((w) => w.length >= 3) })),
          free: [trait, kind],
          minOk: 1, maxInv: 0,
        });
      }
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
    for (const c of chips) {
      const cw = toks(c); total += cw.length;
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
