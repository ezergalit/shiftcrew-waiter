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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

// Blank out every word of `name` that appears in `text` (allowing a single Hebrew
// prefix letter), so a shown text can never spell out the dish it belongs to.
export function maskNameLeak(text, name) {
  let out = text;
  for (const w of new Set(norm(name))) {
    const re = new RegExp(`(^|[\\s,.;:()\\-])([ובלהמשכ]?${escapeRe(w)})(?=$|[\\s,.;:()\\-])`, "giu");
    out = out.replace(re, "$1▢▢▢");
  }
  return out;
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
// Question builders. Each returns
//   { itemId, prompt, subject, subjectKind, options, correct }  or  null.
// subjectKind: "name" — subject is the dish name; "desc" — subject is masked text.

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
  return {
    itemId: it.id,
    prompt: "אילו שינויים ניתן לעשות במנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options,
    correct: mask(correct),
  };
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
  return {
    itemId: it.id,
    prompt: "איזה מרכיב לא נמצא במנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options: shuffle([correct, ...shown]),
    correct,
  };
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
  return {
    itemId: it.id,
    prompt: "איזה תיאור מתאים למנה?",
    subject: dishLabel(it),
    subjectKind: "name",
    options: shuffle(options),
    correct,
  };
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
  return {
    itemId: it.id,
    prompt: "איזו מנה מתאימה לתיאור?",
    subject,
    subjectKind: "desc",
    options: shuffle(options),
    correct: dishLabel(it),
  };
}

// ---------------------------------------------------------------------------
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
export function qServingStyle(pool, it) {
  const cats = [...new Set(pool.map((x) => x.category).filter(Boolean))];
  if (cats.length < 3 || !it.category) return null;
  // Same-name dishes across styles are exactly the confusable case worth asking about,
  // but they'd make the question unanswerable — the prompt alone can't distinguish them.
  if (pool.some((x) => x.id !== it.id && x.name === it.name)) return null;
  const others = cats.filter((c) => c !== it.category);
  if (others.length < 2) return null;
  return {
    itemId: it.id,
    prompt: "באיזו הגשה מוגשת המנה?",
    subject: it.name,
    subjectKind: "name",
    options: shuffle([it.category, ...shuffle(others).slice(0, 3)]),
    correct: it.category,
  };
}
