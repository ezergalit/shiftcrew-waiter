// The learning path (rewritten 2026-08-13, user spec).
//
// WHAT CHANGED AND WHY. The first version was a chain: category 1, then its exam, then
// category 2, and games unlocked one at a time by how many exams you had passed. That
// made a waiter who already knows the cocktails grind through starters to reach them, and
// it kept most of the app behind locks on day one — the fastest way to make someone give
// up on it.
//
// The model now:
//   · EVERY category is open to study and to be examined, in any order. Start with
//     alcohol, then mains, then starters — the app does not care.
//   · EVERY practice mode is open from the start. Nothing is behind an exam count.
//   · What passing an exam changes is SCOPE, not access: a passed category is "opened"
//     and joins the pool the practice modes draw from. Opened starters ⇒ all practice is
//     starters. Opened starters and desserts ⇒ practice mixes the two.
//   · Before the first exam is passed there is nothing opened, so practice falls back to
//     the RECOMMENDED category. Day one still works, and it is still one topic at a time
//     rather than the whole menu at once.
//   · The recommendation (first unpassed category in the owner's order) is guidance only.
//     It is what the home screen points at; it never blocks anything.
//
// Pure functions only, so tests/path.test.mjs can drive the whole thing without a browser
// or a database.

// Every practice mode, all available from the start. The list survives because the UI
// still renders the modes from it — `afterPassed` is gone along with the gating.
export const GAME_MODES = [
  { mode: "quiz", label: "חידון" },
  { mode: "match", label: "התאמה" },
  { mode: "allergens", label: "אלרגיות" },
  { mode: "speed", label: "מהירות" },
  { mode: "namecomplete", label: "התאמת תיאור" },
];

// Kept as the old name so existing imports keep working.
export const GAME_UNLOCKS = GAME_MODES;

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
 * The whole path state in one object, derived fresh from data — nothing about progress
 * is persisted, so a menu change or a mastery change re-derives correctly.
 *
 * @param pool         dish cards (already scoped to this restaurant)
 * @param masteryById  { dishId: 0..5 }
 * @param passedCats   Set/array of category keys whose exam has been passed
 * @param config       { category_order, pass_threshold, gate_games }
 */
export function pathState(pool, masteryById, passedCats, config = {}) {
  const threshold = config.pass_threshold ?? DEFAULT_PASS_THRESHOLD;
  // The owner's "staged unlocking" switch now means "scope practice to opened categories".
  // Off ⇒ practice always draws from the whole menu.
  const scoped = config.gate_games !== false;
  const passed = new Set(passedCats || []);
  const cats = orderedCategories(pool, config.category_order);

  const categories = cats.map((key) => {
    const items = pool.filter((it) => it.category === key);
    const pct = categoryPct(items, masteryById);
    return {
      key,
      items,
      pct,
      // Always true: any category can be studied whenever the waiter wants.
      unlocked: true,
      // The exam still asks for some study first — being examined on a category you have
      // not opened once is not a test, it is a guess.
      examUnlocked: pct >= threshold,
      passed: passed.has(key),
      threshold,
    };
  });

  const openCategories = categories.filter((c) => c.passed);
  const passedCount = openCategories.length;

  // Where to point someone who does not want to choose: the first category in the owner's
  // order that has not been passed yet. Null once everything is passed — there is nothing
  // left to recommend, and inventing one would put a permanent to-do on the home screen.
  const recommended = categories.find((c) => !c.passed) || null;

  const openItems = openCategories.flatMap((c) => c.items);
  const gamePool = !scoped
    ? pool
    : openItems.length
      ? openItems
      : (recommended?.items || categories[0]?.items || pool);

  // Nothing is locked any more; the shape is kept so the UI can keep rendering from it.
  const games = GAME_MODES.map((g) => ({ ...g, unlocked: true, need: 0, needLabel: null }));

  const current = recommended;
  let nextStep = null;
  if (current) {
    nextStep = current.examUnlocked
      ? { kind: "exam", category: current.key, label: `מבחן ${current.key}` }
      : { kind: "study", category: current.key, label: `למדו ${current.key}`, pct: current.pct, threshold };
  }

  return {
    categories,
    games,
    gamePool,
    passedCount,
    current,
    recommended,
    // Category keys the practice modes are currently drawing from — the UI says so out
    // loud, otherwise "why am I only getting starters?" has no visible answer.
    openKeys: openItems.length ? openCategories.map((c) => c.key) : (recommended ? [recommended.key] : []),
    scopedToOpen: scoped,
    nextStep,
    threshold,
    gated: scoped,
  };
}
