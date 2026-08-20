// Progressive-window practice: the continuous flow behind "לתרגול ראשונות" and tapping a
// specific dish. Unlike buildStudySession (a fixed deck built once per round), this picks
// ONE next dish after every rating, so the session never "ends" — it follows the waiter.
//
// The rules (approved demo, 2026-08-19):
//   - A dish is "understood" after two consecutive 5s (menu_progress.consecutive_fives,
//     the same counter buildStudySession retires on).
//   - Only the first WINDOW_SIZE not-yet-understood dishes, in menu order, are active.
//     Understanding one pulls the next menu dish into the window — learning walks the
//     menu front to back instead of spraying the whole category at once.
//   - Inside the window: weaker dishes appear more, a ≤2 rating doubles the odds of an
//     early return, and the same dish never shows twice in a row (unless it is alone).
//   - Sometimes (REFRESH_CHANCE) an already-understood dish is served as a refresher.
import { RETIRE_AFTER_FIVES } from "./studySession.js";

export const WINDOW_SIZE = 4;
export const REFRESH_CHANCE = 0.15;

export const isUnderstood = (consecutiveFives) => (consecutiveFives || 0) >= RETIRE_AFTER_FIVES;

/**
 * Pick the next dish to practice.
 *
 * @param items    dishes in menu order (the caller's list already is — menu_position asc)
 * @param progress id -> { mastery, consecutiveFives }
 * @param prevId   the dish just rated, so it doesn't repeat back-to-back
 * @returns { item, refresh } — refresh=true when serving an already-understood dish
 */
export function pickNext(items, progress, prevId = null, rnd = Math.random) {
  const fives = (it) => progress?.[it.id]?.consecutiveFives;
  const done = (items || []).filter((it) => isUnderstood(fives(it)));
  const active = (items || []).filter((it) => !isUnderstood(fives(it))).slice(0, WINDOW_SIZE);

  // Everything understood: the session becomes refresh rounds instead of a dead end.
  if (!active.length) {
    if (!done.length) return { item: null, refresh: false };
    const pool = done.length > 1 ? done.filter((it) => it.id !== prevId) : done;
    return { item: pool[Math.floor(rnd() * pool.length)], refresh: true };
  }

  if (done.length && rnd() < REFRESH_CHANCE) {
    const r = done[Math.floor(rnd() * done.length)];
    if (r.id !== prevId) return { item: r, refresh: true };
  }

  const pool = active.length > 1 ? active.filter((it) => it.id !== prevId) : active;
  const weight = (it) => {
    const m = progress?.[it.id]?.mastery;
    // Never-seen outranks everything; otherwise weaker = heavier; a recent fail doubles.
    let w = m == null ? 7 : Math.max(1, 6 - m);
    if (m != null && m <= 2) w *= 2;
    return w;
  };
  const total = pool.reduce((s, it) => s + weight(it), 0);
  let r = rnd() * total;
  for (const it of pool) {
    r -= weight(it);
    if (r <= 0) return { item: it, refresh: false };
  }
  return { item: pool[pool.length - 1], refresh: false };
}
