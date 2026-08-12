// Smart multiple-choice question engine for the study games (2026-08-12).
//
// Why it exists (user feedback): most questions were trivially easy — e.g. the dish
// "סלמון אבוקדו" showed "סלמון ואבוקדו…" as the correct description, so the question
// answered itself. Three ideas fix that, all deterministic and menu-agnostic (no AI at
// runtime — standing architecture decision: AI belongs in the owner app once at
// menu-build time, never per answer per waiter):
//
// 1. LEAK MASKING — every word of the dish name that appears in shown text is blanked
//    out (▢▢▢), including common Hebrew prefixes (ואבוקדו, בסלמון). Masking is applied
//    uniformly to ALL options so the mask itself carries no signal.
// 2. SIMILARITY-RANKED DISTRACTORS — wrong options come from the most-confusable dishes
//    (same category first, then most shared ingredients/description words), not random
//    picks that are solvable by elimination.
// 3. FACT QUESTIONS from the owner's own text — the "שינויים: …" tail becomes "אילו
//    שינויים ניתן לעשות במנה?" (the exact question a waiter gets at a table), and an
//    ingredient trap asks which ingredient is NOT in the dish, with the intruder taken
//    from the most similar dish. Each builder self-checks its data requirements and
//    returns null when the menu can't support it, so ANY menu (with or without prices,
//    descriptions, or the שינויים convention) gets the hardest mix it can sustain.

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

const HEB_STOP = new Set(["של", "עם", "על", "או", "גם", "לא", "עד", "ללא", "מעל", "לצד", "בתוך"]);
const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !HEB_STOP.has(w));

// Hebrew writes the same word with or without the mater lectionis vav/yod — לימון and
// למון, סלמון and סלמן. String equality misses that, and it let a real leak through: a
// description reading "מניפת לימון" pointed straight at the option "למון טוויסט".
// Only ו and י are dropped; ה would collide genuinely different words (חלב / חלבה).
export const hebKey = (w) => {
  const k = String(w).replace(/[וי]/g, "");
  return k.length >= 2 ? k : String(w);
};
const keySet = (s) => new Set(norm(s).map(hebKey));
const sharesWord = (text, keys) => norm(text).some((w) => keys.has(hebKey(w)));

// Split a description into base text + the owner-written modifications tail. The AI
// menu import writes "… שינויים: …" as a convention; menus without it simply get
// { changes: null } and the changes-question builder skips them.
export function splitChanges(desc) {
  const idx = (desc || "").indexOf("שינויים:");
  if (idx === -1) return { base: (desc || "").trim(), changes: null };
  return {
    base: desc.slice(0, idx).replace(/[\s.,;:–—-]+$/, "").trim(),
    changes: desc.slice(idx + "שינויים:".length).trim() || null,
  };
}

// Blank out every word of `name` that appears in `text`, so a shown text can never spell
// out the dish it belongs to. Token-wise rather than regex-per-word so it can compare on
// hebKey and catch spelling variants, and it also strips one attached Hebrew prefix
// (ואבוקדו, בסלמון).
export function maskNameLeak(text, name) {
  const keys = keySet(name);
  if (!keys.size) return text;
  return String(text).replace(/[\p{L}\p{N}]+/gu, (tok) => {
    const low = tok.toLowerCase();
    if (keys.has(hebKey(low))) return "▢▢▢";
    if (low.length > 2 && /^[ובלהמשכ]/.test(low) && keys.has(hebKey(low.slice(1)))) return "▢▢▢";
    return tok;
  });
}

// What the trainee reads for a dish. `name` stays bare because descriptions are masked
// against it and never contain the serving style; `displayName` (set in pubToCard) carries
// the qualifier that makes "בס" into "סשימי בס". Falls back for offline mock cards.
export const dishLabel = (it) => (it?.displayName || it?.name || "");

// True when, after masking, the text still has enough substance to be a fair question —
// "סלמון ואבוקדו" masked against "סלמון אבוקדו" leaves nothing, so skip that question.
const survivesMasking = (masked) => norm(masked.replace(/▢/g, " ")).length >= 3;

// How alike two dishes are, for picking confusable distractors: shared ingredients
// weigh double, shared description words weigh single.
function simScore(a, b) {
  const ai = new Set((a.ingredients || []).map((x) => x.trim()));
  let s = 0;
  for (const x of b.ingredients || []) if (ai.has(x.trim())) s += 2;
  const ad = new Set(norm(a.desc));
  for (const t of new Set(norm(b.desc))) if (ad.has(t)) s += 1;
  return s;
}

// Distractor picker used by every multiple-choice game: same category first, then the
// most-confusable first (was: random within category). Small jitter keeps repeat plays
// from producing identical decks.
export function pickDistractors(pool, it, count) {
  const scored = pool
    .filter((x) => x.id !== it.id)
    .map((x) => [x, (x.category === it.category ? 1000 : 0) + simScore(it, x) + Math.random() * 2]);
  scored.sort((a, b) => b[1] - a[1]);
  return scored.map(([x]) => x).slice(0, count);
}

// ---------------------------------------------------------------------------
// QUALITY GATES — see QUESTION-QUALITY.md for the catalogue of mistakes each one
// prevents. Every builder runs its output through validateQuestion; a question that
// fails is dropped (returns null) and buildSmartDeck asks a different one instead.
// A question that can be answered by general knowledge, language instinct, or visual
// pattern is a bug, even when the trainee picks the "right" option.

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

// Two options that read as the same answer make the question unfair either way: if both
// are wrong the trainee is choosing between identical decoys, and if one is correct the
// other is equally defensible.
function nearDuplicateOptions(options) {
  for (let i = 0; i < options.length; i++)
    for (let j = i + 1; j < options.length; j++)
      if (jaccard(norm(options[i]), norm(options[j])) >= 0.85) return true;
  return false;
}

// If exactly ONE option shares a content word with the subject, that word points at it —
// as the answer if it's correct, or as an obvious elimination if it isn't. Either way the
// trainee doesn't need to know the menu. (Zero or several overlaps are both fine.)
function singleOverlapGiveaway(subject, options) {
  const keys = keySet(subject);
  if (!keys.size) return false;
  return options.filter((o) => sharesWord(o, keys)).length === 1;
}

// The longest option being correct is the oldest multiple-choice tell there is.
function lengthOutlier(correct, options) {
  const others = options.filter((o) => o !== correct).map((o) => o.length).sort((a, b) => a - b);
  if (others.length < 2) return false;
  const median = others[Math.floor(others.length / 2)];
  if (median < 12) return false; // short labels (ingredients, dish names) carry no length signal
  return correct.length > median * 2 || correct.length * 2 < median;
}

export function validateQuestion(q) {
  if (!q || !Array.isArray(q.options) || q.options.length < 3) return null;
  if (!q.options.includes(q.correct)) return null;
  if (new Set(q.options).size !== q.options.length) return null;
  if (nearDuplicateOptions(q.options)) return null;
  if (singleOverlapGiveaway(q.subject, q.options)) return null;
  if (lengthOutlier(q.correct, q.options)) return null;
  if (q.subjectKind === "desc" && !survivesMasking(q.subject)) return null;
  return q;
}

// ---------------------------------------------------------------------------
// Question builders. Each returns
//   { itemId, prompt, subject, subjectKind, options, correct, facet }  or  null.
// subjectKind: "name" — subject is the dish name; "desc" — subject is masked text.
// facet: which aspect of menu knowledge this tests, so the owner's ranked priorities
// (menu_app.exam_config) decide which builders run and how often.

const NO_CHANGES = "אין שינויים במנה זו";

// "אילו שינויים ניתן לעשות במנה?" — the correct option is the owner's own שינויים
// text; the traps are the שינויים texts of the most similar dishes, which are naturally
// near-miss ("עד ירק אחד" vs "עד 2 ירקות"). A dish WITHOUT a changes tail gets
// NO_CHANGES as the correct answer with real siblings' texts as traps — knowing that
// nothing can be changed is menu knowledge too. All options are masked against the
// dish name so a trap can't be eliminated just for naming a different fish.
export function qChanges(pool, it) {
  const { changes } = splitChanges(it.desc);
  const sibChanges = [
    ...new Set(
      pickDistractors(pool, it, 10)
        .map((s) => splitChanges(s.desc).changes)
        .filter((c) => c && c !== changes)
    ),
  ];
  const correct = changes || NO_CHANGES;
  const mask = (t) => maskNameLeak(t, it.name);
  const maskedCorrect = mask(correct);
  // If masking touched the correct option, prefer traps that also get masked (and vice
  // versa) — otherwise "the option with ▢▢▢ is the answer" becomes a tell.
  const correctHasMask = maskedCorrect.includes("▢");
  const ranked = [...sibChanges].sort(
    (a, b) => (mask(b).includes("▢") === correctHasMask) - (mask(a).includes("▢") === correctHasMask)
  );
  let wrong = ranked.slice(0, 2);
  if (changes && wrong.length < 2) wrong = [...wrong, NO_CHANGES];
  wrong = [...new Set(wrong)].filter((w) => w !== correct).slice(0, 2);
  if (wrong.length < 2) return null;
  const options = [...new Set(shuffle([correct, ...wrong]).map(mask))];
  if (options.length < 3) return null;
  return validateQuestion({
    itemId: it.id,
    facet: "changes",
    prompt: "אילו שינויים ניתן לעשות במנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options,
    correct: mask(correct),
  });
}

// "איזה מרכיב לא נמצא במנה?" — 3 real ingredients + 1 intruder from the most similar
// dishes. Inverting the direction means elimination requires knowing the whole dish.
// Real ingredients that appear in the dish NAME are avoided as options (they'd be
// eliminated for free); they only pad the list when nothing else is available.
export function qNotIngredient(pool, it) {
  const real = [...new Set((it.ingredients || []).map((x) => x.trim()).filter(Boolean))];
  if (real.length < 3) return null;
  const realSet = new Set(real);
  const foreign = [
    ...new Set(
      pickDistractors(pool, it, 6)
        .flatMap((s) => s.ingredients || [])
        .map((x) => x.trim())
        .filter((x) => x && !realSet.has(x))
    ),
  ];
  if (!foreign.length) return null;
  const nameWords = new Set(norm(it.name));
  const nonNameReal = real.filter((x) => !norm(x).some((w) => nameWords.has(w)));
  const shown = shuffle(nonNameReal).slice(0, 3);
  if (shown.length < 3)
    shown.push(...shuffle(real.filter((x) => !shown.includes(x))).slice(0, 3 - shown.length));
  const correct = shuffle(foreign)[0];
  return validateQuestion({
    itemId: it.id,
    facet: "ingredients",
    prompt: "איזה מרכיב לא נמצא במנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options: shuffle([correct, ...shown]),
    correct,
  });
}

// "איזה תיאור מתאים למנה?" — the 2 most-confusable siblings' descriptions as traps,
// every option masked against the shown dish name. Skipped when the base description
// is mostly the dish's own name (nothing left to ask after masking).
export function qDescMatch(pool, it) {
  const { base } = splitChanges(it.desc);
  if (!base) return null;
  const correct = maskNameLeak(base, it.name);
  if (!survivesMasking(correct)) return null;
  const sibs = pickDistractors(pool, it, 4)
    .map((s) => splitChanges(s.desc).base)
    .filter(Boolean)
    .map((d) => maskNameLeak(d, it.name));
  const options = [...new Set([correct, ...sibs])].slice(0, 3);
  if (options.length < 3) return null;
  return validateQuestion({
    itemId: it.id,
    facet: "description",
    prompt: "איזה תיאור מתאים למנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options: shuffle(options),
    correct,
  });
}

// "איזו מנה מתאימה לתיאור?" — the reverse direction; the description is masked against
// EVERY option's name (uniformly, so the mask can't point at the answer).
export function qWhichDish(pool, it) {
  const { base } = splitChanges(it.desc);
  if (!base) return null;
  const others = pickDistractors(pool, it, 3);
  // Qualified labels keep two same-named dishes from collapsing into one option — on a
  // sushi menu "בס" is both sashimi and nigiri, which used to silently drop the question.
  const options = [...new Set([dishLabel(it), ...others.map(dishLabel)])];
  if (options.length < 4) return null;
  let subject = base;
  for (const d of [it, ...others]) subject = maskNameLeak(subject, d.name);
  if (!survivesMasking(subject)) return null;
  return validateQuestion({
    itemId: it.id,
    facet: "description",
    prompt: "איזו מנה מתאימה לתיאור?",
    subject,
    subjectKind: "desc",
    options: shuffle(options),
    correct: dishLabel(it),
  });
}

// ---------------------------------------------------------------------------
// FACETS — the aspects of menu knowledge a restaurant can be tested on. Which ones are
// used, and how heavily, is the OWNER's call (menu_app.exam_config): a fine-dining place
// may care most about allergens and provenance, a fast bar about price and modifications.
// `requires` lets the owner UI offer only what this particular menu can actually support,
// so nobody is asked to rank "price" on a menu that has no prices.

export const FACETS = {
  allergens: {
    label: "אלרגנים",
    hint: "מי לא יכול לאכול מה — השאלה שאורח שואל בפועל",
    builders: [qAllergenDish],
    requires: (pool) => pool.filter((it) => (it.allergens || []).length).length >= 2,
  },
  ingredients: {
    label: "מרכיבים",
    hint: "ממה המנה עשויה",
    builders: [qNotIngredient],
    requires: (pool) => pool.filter((it) => (it.ingredients || []).length >= 3).length >= 2,
  },
  description: {
    label: "תיאור המנה",
    hint: "לזהות מנה לפי התיאור ולהפך",
    builders: [qDescMatch, qWhichDish],
    requires: (pool) => pool.filter((it) => splitChanges(it.desc).base).length >= 4,
  },
  changes: {
    label: "שינויים אפשריים",
    hint: "מה מותר לשנות במנה",
    builders: [qChanges],
    requires: (pool) => pool.filter((it) => splitChanges(it.desc).changes).length >= 3,
  },
  serving: {
    label: "אופן ההגשה",
    hint: "כמות יחידות וצורת הגשה",
    builders: [qServingStyle],
    requires: (pool) => {
      const cats = [...new Set(pool.map((x) => x.category).filter(Boolean))];
      return cats.length >= 3 && cats.every(isStructuralCategory);
    },
  },
  price: {
    label: "מחיר",
    hint: "רק מנות שהמחיר לא כתוב בשם שלהן",
    builders: [qPrice],
    requires: (pool) =>
      pool.filter((it) => Number(it.price) > 0 && !String(it.name).includes(String(Number(it.price)))).length >= 4,
  },
};

// Our recommendation to the owner, in order. Allergens lead because getting them wrong
// is the only mistake on this list that can hurt a guest; price trails because it is the
// easiest thing to look up mid-shift.
export const RECOMMENDED_FACETS = ["allergens", "ingredients", "description", "changes", "serving", "price"];

// Facets this specific menu can support, in recommended order. The owner ranks these —
// never a hardcoded list, so the terms shown always come from their own menu.
export function availableFacets(pool) {
  return RECOMMENDED_FACETS.filter((k) => FACETS[k].requires(pool || []));
}

// Build a deck honouring the owner's ranking: the top-ranked facet gets the most
// questions, and anything they left out is never asked. Falls back to whatever the menu
// can support if the config is empty or impossible, so a deck is never returned empty
// just because the owner hasn't configured anything yet.
export function buildWeightedDeck(pool, size, facetOrder) {
  const order = (facetOrder || []).filter((k) => FACETS[k] && FACETS[k].requires(pool));
  const active = order.length ? order : availableFacets(pool);
  if (!active.length || !pool?.length) return [];

  // Rank 1 of N is weighted N, rank 2 is N-1, and so on.
  const n = active.length;
  const weights = active.map((_, i) => n - i);
  const total = weights.reduce((a, b) => a + b, 0);

  const deck = [];
  const seen = new Set();
  const takeFrom = (facet, want) => {
    const builders = FACETS[facet].builders;
    let taken = 0;
    for (let round = 0; round < 2 && taken < want; round++) {
      for (const it of shuffle(pool)) {
        if (taken >= want) break;
        for (const build of shuffle(builders)) {
          const q = build(pool, it);
          const key = q && `${q.itemId}|${q.prompt}`;
          if (q && !seen.has(key)) { seen.add(key); deck.push(q); taken++; break; }
        }
      }
    }
    return taken;
  };

  active.forEach((facet, i) => takeFrom(facet, Math.max(1, Math.round((size * weights[i]) / total))));
  // Short decks happen when a facet runs out of eligible dishes — top up from the rest.
  for (const facet of active) { if (deck.length >= size) break; takeFrom(facet, size - deck.length); }
  return shuffle(deck).slice(0, size);
}

// Deck builder: rotates through the given builders per dish, so a deck mixes question
// kinds instead of repeating one pattern; extra passes over the pool top the deck up
// when the menu is small. Never repeats the same (dish, question-kind) pair.
export function buildSmartDeck(pool, size, builders) {
  const deck = [];
  const seen = new Set();
  let b = 0;
  for (let round = 0; round < builders.length && deck.length < size; round++) {
    for (const it of shuffle(pool)) {
      if (deck.length >= size) break;
      for (let k = 0; k < builders.length; k++) {
        const q = builders[(b + k) % builders.length](pool, it);
        const key = q && `${q.itemId}|${q.prompt}`;
        if (q && !seen.has(key)) {
          seen.add(key);
          deck.push(q);
          b = (b + k + 1) % builders.length;
          break;
        }
      }
    }
  }
  return shuffle(deck);
}

// "באיזו הגשה מוגשת המנה?" — the answer options are the FULL category lines, which on an
// imported menu carry the unit count and preparation ("מאקי — 6 יחידות, אצה בחוץ ואורז
// בפנים"). So getting it right means knowing how many pieces come in a maki vs an
// inside-out vs a nigiri, without parsing those numbers out of free text.
//
// The subject is deliberately the BARE name: the qualified label would spell out the
// answer. Only offered when the menu actually has several categories to choose between.
// ⚠️ Only fires on STRUCTURAL categories — ones whose label carries preparation detail
// after a dash ("מאקי — 6 יחידות, אצה בחוץ"). On a menu with plain course names
// (ראשונות / עיקריות / קינוחים) this degenerates into "is Sea Bass a starter or a
// dessert?", which any Hebrew speaker answers without ever seeing the menu — the exact
// class of worthless question this engine exists to avoid (QUESTION-QUALITY.md #3).
const isStructuralCategory = (c) => /[—–-]/.test(c || "") && /\d/.test(c || "");

export function qServingStyle(pool, it) {
  const cats = [...new Set(pool.map((x) => x.category).filter(Boolean))];
  if (cats.length < 3 || !it.category) return null;
  if (!cats.every(isStructuralCategory)) return null;
  // Same-name dishes across styles are exactly the confusable case worth asking about,
  // but they'd make the question unanswerable — the prompt alone can't distinguish them.
  if (pool.some((x) => x.id !== it.id && x.name === it.name)) return null;
  const others = cats.filter((c) => c !== it.category);
  if (others.length < 2) return null;
  return validateQuestion({
    itemId: it.id,
    facet: "serving",
    prompt: "באיזו הגשה מוגשת המנה?",
    subject: it.name,
    subjectKind: "name",
    options: shuffle([it.category, ...shuffle(others).slice(0, 3)]),
    correct: it.category,
  });
}

// "אורח מבקש בלי <אלרגן> — איזו מנה אסורה לו?" — the question a waiter actually gets
// at a table. Exactly one option carries the allergen; the rest are verified clean, so
// there is no ambiguity to argue with. Distractors come from the same category, which is
// where a real mix-up happens.
export function qAllergenDish(pool, it) {
  const mine = (it.allergens || []).filter(Boolean);
  if (!mine.length) return null;
  const allergen = shuffle(mine)[0];
  const clean = pickDistractors(pool, it, 12).filter(
    (x) => !(x.allergens || []).includes(allergen) && dishLabel(x) !== dishLabel(it)
  );
  if (clean.length < 3) return null;
  const options = [...new Set([dishLabel(it), ...clean.slice(0, 3).map(dishLabel)])];
  if (options.length < 4) return null;
  return validateQuestion({
    itemId: it.id,
    facet: "allergens",
    prompt: `אורח מבקש מנה ללא ${allergen}. איזו מנה אסורה לו?`,
    subject: allergen,
    subjectKind: "allergen",
    options: shuffle(options),
    correct: dishLabel(it),
  });
}

// Price, but only when it can't be read off the dish name. Some imported menus bake the
// price into the name ("Sea Bass 165") — asking those is just reading comprehension, and
// it is why price was pulled from every game in 2026-08-11. It comes back only for owners
// who rank it as worth testing, and only on dishes where the answer isn't printed.
export function qPrice(pool, it) {
  const price = Number(it.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (String(it.name).includes(String(price))) return null;
  const near = pickDistractors(pool, it, 12)
    .map((x) => Number(x.price))
    .filter((p) => Number.isFinite(p) && p > 0 && p !== price);
  const uniq = [...new Set(near)].sort((a, b) => Math.abs(a - price) - Math.abs(b - price));
  if (uniq.length < 3) return null;
  const fmt = (p) => `₪${p}`;
  return validateQuestion({
    itemId: it.id,
    facet: "price",
    prompt: "מה מחיר המנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options: shuffle([price, ...uniq.slice(0, 3)]).map(fmt),
    correct: fmt(price),
  });
}
