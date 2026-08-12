// The staged learning path (2026-08-12, user spec).
//
// A new waiter does not get the whole menu at once. They practise one category with
// flashcards; at `passThreshold` (default 50%) that category's exam opens; passing it
// opens the next category and progressively unlocks games. Every game is then scoped to
// the categories that are actually open — never asking about desserts a waiter has not
// reached (QUESTION-QUALITY.md #9).
//
// Pure functions only, so tests/path.test.mjs can drive the whole progression without a
// browser or a database.

// Games in the order they become available. Flashcards are not here: they are the
// entry point and always open for the current category.
export const GAME_UNLOCKS = [
  { mode: "quiz", label: "חידון", afterPassed: 1 },
  { mode: "match", label: "התאמה", afterPassed: 1 },
  { mode: "allergens", label: "אלרגיות", afterPassed: 2 },
  { mode: "speed", label: "מהירות", afterPassed: 2 },
  { mode: "namecomplete", label: "התאמת תיאור", afterPassed: 3 },
];

export const DEFAULT_PASS_THRESHOLD = 50;

// Menu order, not alphabetical: the order dishes appear in the owner's menu is the order
// a waiter learns the restaurant. `category_order` from exam_config wins when the owner
// has arranged it; unknown categories keep their menu position at the end.
export function orderedCategories(pool, configOrder) {
  const seen = [];
  for (const it of pool || []) if (it.category && !seen.includes(it.category)) seen.push(it.category);
  if (!configOrder?.length) return seen;
  const known = configOrder.filter((c) => seen.includes(c));
  return [...known, ...seen.filter((c) => !known.includes(c))];
}

// Same formula as the owner's team tab and the waiter's progress bar: the SUM of mastery
// over the maximum possible, so 4-out-of-5 everywhere reads as 80%, not 100%.
export function categoryPct(items, masteryById) {
  if (!items.length) return 0;
  const sum = items.reduce((n, it) => n + (masteryById?.[it.id] || 0), 0);
  return Math.round((sum / (items.length * 5)) * 100);
}

/**
 * The whole progression state in one object, derived fresh from data — nothing about
 * unlocking is persisted, so a menu change or a mastery change re-derives correctly.
 *
 * @param pool         dish cards (already scoped to this restaurant)
 * @param masteryById  { dishId: 0..5 }
 * @param passedCats   Set/array of category keys whose exam has been passed
 * @param config       { category_order, pass_threshold, gate_games }
 */
export function pathState(pool, masteryById, passedCats, config = {}) {
  const threshold = config.pass_threshold ?? DEFAULT_PASS_THRESHOLD;
  const gate = config.gate_games !== false;
  const passed = new Set(passedCats || []);
  const cats = orderedCategories(pool, config.category_order);

  let previousPassed = true; // the first category is always open
  const categories = cats.map((key) => {
    const items = pool.filter((it) => it.category === key);
    const pct = categoryPct(items, masteryById);
    const isPassed = passed.has(key);
    const unlocked = !gate || previousPassed;
    const examUnlocked = unlocked && pct >= threshold;
    previousPassed = previousPassed && isPassed;
    return { key, items, pct, unlocked, examUnlocked, passed: isPassed, threshold };
  });

  const passedCount = categories.filter((c) => c.passed).length;
  const unlockedCats = categories.filter((c) => c.unlocked);
  // Games draw from everything open so far, which is what makes them get harder as the
  // waiter progresses rather than staying stuck on the first category.
  const gamePool = gate ? unlockedCats.flatMap((c) => c.items) : pool;

  const games = GAME_UNLOCKS.map((g) => ({
    ...g,
    unlocked: !gate || passedCount >= g.afterPassed,
    // What still has to happen before this game opens — shown on the locked card so the
    // waiter always knows the next concrete step, never just "locked".
    need: gate && passedCount < g.afterPassed ? g.afterPassed - passedCount : 0,
  }));

  // The single next action, so the home screen can point at one thing.
  const current = categories.find((c) => c.unlocked && !c.passed) || null;
  let nextStep = null;
  if (current) {
    nextStep = current.examUnlocked
      ? { kind: "exam", category: current.key, label: `מבחן ${current.key}` }
      : { kind: "study", category: current.key, label: `למדו ${current.key}`, pct: current.pct, threshold };
  }

  return { categories, games, gamePool, passedCount, current, nextStep, threshold, gated: gate };
}
