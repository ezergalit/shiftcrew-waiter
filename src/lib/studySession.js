// Which dishes to put in front of the waiter *this* session, and in what order.
//
// The problem this solves (user report): opening a 20-dish category dealt all 20, every
// time. That is exhausting, it spends most of the session on dishes already known, and it
// never signals "you've got this one". A study session should be short, weighted toward
// what is shaky, and it should let a dish graduate out.
//
// The rules, all derived from how the waiter did last time — no scheduling clock, no
// review dates, nothing that needs a cron job:
//
//   1. SIZE CAP. At most `size` cards (default 10), however big the category is.
//   2. RETIREMENT. A dish rated 5 on two consecutive sightings leaves the rotation. One
//      perfect rating can be luck or a lucky glance; twice in a row is the confirmation
//      the user asked for. It comes back only if the whole category is retired (below).
//   3. WEAKNESS FIRST. Lower mastery ⇒ earlier in the deck and more likely to be picked.
//   4. REPEATS FOR THE WEAKEST. A dish at mastery ≤2 can appear twice in one session —
//      the repeat is placed near the end, so there is real spacing between the two
//      sightings rather than the same card twice in a row.
//
// Deterministic given the same input except for a small jitter in the pick, so repeat
// sessions on an unchanged menu are not identical decks.

export const SESSION_SIZE = 10;
export const RETIRE_AFTER_FIVES = 2;

// How much a dish deserves attention. Untouched (no progress row) ranks above a dish rated
// 1: never-seen is a bigger gap than seen-and-shaky, and it is also the more useful thing
// to show first on a menu the waiter has just been given.
export function priority(entry) {
  if (!entry || entry.mastery == null) return 7;
  return Math.max(1, 6 - entry.mastery);
}

export const isRetired = (entry) =>
  !!entry && entry.mastery >= 5 && (entry.consecutiveFives || 0) >= RETIRE_AFTER_FIVES;

/**
 * Build one study session.
 *
 * @param items      dishes in scope (a category, or the whole menu)
 * @param progressById  { [dishId]: { mastery, consecutiveFives } }
 * @param size       max cards in the session
 * @param rnd        injectable RNG so tests are deterministic
 * @returns { deck, retiredCount, poolCount, allRetired }
 */
export function buildStudySession(items, progressById = {}, size = SESSION_SIZE, rnd = Math.random) {
  const all = (items || []).filter(Boolean);
  if (!all.length) return { deck: [], retiredCount: 0, poolCount: 0, allRetired: false };

  const retired = all.filter((it) => isRetired(progressById[it.id]));
  let pool = all.filter((it) => !isRetired(progressById[it.id]));

  // Everything has graduated: rather than show an empty session, bring the whole category
  // back for a refresher. Retirement is meant to shorten sessions, not end studying.
  const allRetired = pool.length === 0;
  if (allRetired) pool = all;

  // Weighted pick without replacement: weight = priority, so a mastery-1 dish is ~5x more
  // likely to be drawn than a mastery-5 one, but nothing is ever hard-excluded.
  const scored = pool.map((it) => {
    const p = priority(progressById[it.id]);
    return { it, p, roll: (p + rnd() * 2) };
  });
  scored.sort((a, b) => b.roll - a.roll);

  const chosen = scored.slice(0, Math.min(size, scored.length));
  // Weakest first — the user asked for the hard ones "more at the beginning".
  chosen.sort((a, b) => b.p - a.p);

  const deck = chosen.map((c) => c.it);

  // Second sighting for the dishes actually being got WRONG — rated, and rated low. A
  // never-seen dish ranks highest for being dealt at all, but it isn't something the
  // waiter is failing, so it doesn't earn the repeat; drilling it twice before they have
  // even answered once is just noise.
  const struggling = chosen
    .filter((c) => {
      const m = progressById[c.it.id]?.mastery;
      return m != null && m <= 2;
    })
    .map((c) => c.it);

  for (const it of struggling.slice(0, 3)) {
    // Never immediately after itself — the point of a repeat is the gap before it.
    if (deck[deck.length - 1]?.id === it.id) deck.splice(deck.length - 1, 0, it);
    else deck.push(it);
  }

  return { deck, retiredCount: retired.length, poolCount: pool.length, allRetired };
}

// The rating rule that feeds retirement. Kept here so the UI and the tests agree on it.
export const nextConsecutiveFives = (prev, rating) => (rating >= 5 ? (prev || 0) + 1 : 0);
