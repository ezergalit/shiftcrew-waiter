// Grading for typed (free-recall) ingredient answers — the category quiz's new format
// (user request, 2026-08-20): instead of picking ingredients out of chips, the waiter
// WRITES them from memory, up to 7 fields.
//
// Two rules shape everything here, both learned the hard way (see QUESTION-QUALITY.md):
//   1. Typing must test menu knowledge, not spelling. Hebrew ingredient names have loose
//      spellings (וודקה/ודקה, צ'ילי/צילי), so matching is fuzzy — normalized, token-aware,
//      and tolerant of small typos. Exact-match typing was removed once before (2026-08-11)
//      precisely because it graded orthography.
//   2. Recall is HARDER than recognition, so the score must say so. Writing 70% of a
//      dish's ingredients from memory is full marks; chips demanded the exact set because
//      picking from a printed list is easy.

const norm = (s) =>
  (s || "")
    .toString()
    .toLowerCase()
    .replace(/["'׳״`]/g, "")   // geresh/gershayim: צ'ילי ⇆ צילי
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Final-form letters fold so בצל matches בצלים-style variants at the edit-distance step.
const foldFinals = (s) => s.replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ");

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Typo budget scales with length: a 3-letter word must be nearly exact (one wrong letter
// in לחם is a different word), a long one can wobble.
const tolerance = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : 2);

const wordMatches = (a, b) => {
  const fa = foldFinals(a), fb = foldFinals(b);
  if (fa === fb) return true;
  return levenshtein(fa, fb) <= Math.min(tolerance(fa.length), tolerance(fb.length));
};

// Does the typed text name this ingredient? Full-string fuzzy match, or every typed word
// finds a matching word in the ingredient ("בצל" names "בצל ירוק"; "ירוק" alone doesn't —
// a bare adjective is not an ingredient).
export function entryNamesIngredient(entry, ingredient) {
  const e = norm(entry), g = norm(ingredient);
  if (!e || !g) return false;
  if (wordMatches(e, g)) return true;
  const ew = e.split(" "), gw = g.split(" ");
  // The typed HEAD word must match the ingredient's HEAD word — matching only a
  // modifier ("ירוק", "חריף") would credit knowledge the waiter didn't show.
  if (!wordMatches(ew[0], gw[0])) return false;
  // Then the shorter side's words must all appear in the longer side: "בצל" names
  // "בצל ירוק", and "אבוקדו טרי" still names "אבוקדו" — extra adjectives don't hurt.
  const [short, long] = ew.length <= gw.length ? [ew, gw] : [gw, ew];
  return short.every((w) => long.some((x) => wordMatches(w, x)));
}

// Greedy one-to-one matching: each typed entry claims at most one real ingredient and
// each ingredient is claimed once — typing סלמון twice earns it once.
export function matchTyped(entries, realIngredients) {
  const remaining = realIngredients.map((g, idx) => ({ g, idx }));
  const matched = [];   // { entry, ingredient }
  const wrong = [];     // entries that named nothing
  for (const raw of entries) {
    const entry = (raw || "").trim();
    if (!entry) continue;
    const hit = remaining.findIndex(({ g }) => entryNamesIngredient(entry, g));
    if (hit >= 0) {
      matched.push({ entry, ingredient: remaining[hit].g });
      remaining.splice(hit, 1);
    } else {
      wrong.push(entry);
    }
  }
  return { matched, wrong, missed: remaining.map((r) => r.g) };
}

// Recall score, deliberately lenient:
//   • naming ceil(70%) of the ingredients = a full 1.0 — free recall is hard;
//   • inventing ingredients still costs (-0.15 each), or "write anything" would pay.
export function typedIngredientScore(entries, realIngredients) {
  const real = realIngredients.filter(Boolean);
  if (!real.length) return { score: 1, matched: [], wrong: [], missed: [] };
  const { matched, wrong, missed } = matchTyped(entries, real);
  const need = Math.max(1, Math.ceil(real.length * 0.7));
  const raw = Math.min(1, matched.length / need) - 0.15 * wrong.length;
  return { score: Math.max(0, raw), matched, wrong, missed };
}
