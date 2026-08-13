// Study-session rules. The user's ask, restated as assertions:
//   "20 dishes shouldn't all open at once — 10 at a time"
//   "the ones you do well on appear less, the ones you struggle with appear more, and earlier"
//   "once you mark 5 twice on the same dish it should skip it"
import {
  buildStudySession, priority, isRetired, nextConsecutiveFives,
  SESSION_SIZE, RETIRE_AFTER_FIVES,
} from "../src/lib/studySession.js";

let failures = 0;
const fail = (suite, msg) => { failures++; console.log(`  ❌ [${suite}] ${msg}`); };
const ok = (suite, msg) => console.log(`  ✅ [${suite}] ${msg}`);

// A fixed RNG so the weighted pick is reproducible in tests.
const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const menu = (n) => [...Array(n)].map((_, i) => ({ id: `d${i}`, name: `מנה ${i}` }));

console.log("\n=== SESSION SIZE ===");
{
  const items = menu(20);
  const { deck } = buildStudySession(items, {}, SESSION_SIZE, seeded(1));
  const unique = new Set(deck.map((d) => d.id)).size;
  if (unique > SESSION_SIZE) fail("SIZE", `got ${unique} distinct dishes, cap is ${SESSION_SIZE}`);
  else ok("SIZE", `20-dish category deals ${unique} distinct dishes, not 20`);
  if (deck.length === 0) fail("SIZE", "empty deck");
}

console.log("\n=== RETIREMENT ===");
{
  const items = menu(6);
  // First three are locked in (5 twice), rest untouched.
  const progress = {
    d0: { mastery: 5, consecutiveFives: 2 },
    d1: { mastery: 5, consecutiveFives: 3 },
    d2: { mastery: 5, consecutiveFives: 2 },
  };
  const { deck, retiredCount } = buildStudySession(items, progress, SESSION_SIZE, seeded(2));
  const ids = new Set(deck.map((d) => d.id));
  if (retiredCount !== 3) fail("RETIRE", `retiredCount ${retiredCount}, expected 3`);
  for (const id of ["d0", "d1", "d2"]) {
    if (ids.has(id)) fail("RETIRE", `${id} is retired (5 twice) but still dealt`);
  }
  if (!failures) ok("RETIRE", "dishes rated 5 twice in a row are skipped");

  // One 5 is not enough — that could be luck.
  const once = buildStudySession(items, { d0: { mastery: 5, consecutiveFives: 1 } }, SESSION_SIZE, seeded(3));
  if (!once.deck.some((d) => d.id === "d0")) fail("RETIRE", "a single 5 must NOT retire a dish");
  else ok("RETIRE", `a single 5 keeps the dish in rotation (retires at ${RETIRE_AFTER_FIVES})`);

  // Everything retired ⇒ refresher rather than an empty screen.
  const allDone = Object.fromEntries(items.map((it) => [it.id, { mastery: 5, consecutiveFives: 2 }]));
  const refresher = buildStudySession(items, allDone, SESSION_SIZE, seeded(4));
  if (!refresher.deck.length) fail("RETIRE", "fully-retired category produced an empty session");
  else if (!refresher.allRetired) fail("RETIRE", "allRetired flag not set");
  else ok("RETIRE", "fully-retired category comes back as a refresher, not an empty screen");
}

console.log("\n=== WEAK DISHES COME FIRST AND MORE OFTEN ===");
{
  const items = menu(10);
  const progress = {
    d0: { mastery: 1, consecutiveFives: 0 },  // weakest
    d1: { mastery: 1, consecutiveFives: 0 },
    d2: { mastery: 5, consecutiveFives: 0 },  // strong but not retired
    d3: { mastery: 5, consecutiveFives: 0 },
    d4: { mastery: 5, consecutiveFives: 0 },
  };
  const { deck } = buildStudySession(items, progress, SESSION_SIZE, seeded(5));

  const posOf = (id) => deck.findIndex((d) => d.id === id);
  const weakPos = Math.min(posOf("d0"), posOf("d1"));
  const strongPos = Math.max(posOf("d2"), posOf("d3"));
  if (weakPos === -1) fail("ORDER", "weakest dish was not dealt at all");
  else if (strongPos !== -1 && weakPos > strongPos)
    fail("ORDER", `weak dish at ${weakPos} came after strong dish at ${strongPos}`);
  else ok("ORDER", "weaker dishes are dealt before stronger ones");

  const count = (id) => deck.filter((d) => d.id === id).length;
  if (count("d0") < 2 && count("d1") < 2)
    fail("REPEAT", "no weak dish got a second sighting in the session");
  else ok("REPEAT", "a weak dish appears more than once in the same session");

  // ...and the repeat is spaced, not back-to-back.
  for (let i = 1; i < deck.length; i++) {
    if (deck[i].id === deck[i - 1].id) fail("REPEAT", `${deck[i].id} repeats back-to-back at ${i}`);
  }
}

console.log("\n=== PRIORITY / STREAK RULES ===");
{
  if (!(priority(null) > priority({ mastery: 1 }))) fail("PRIORITY", "never-seen should outrank mastery 1");
  else ok("PRIORITY", "never-seen dishes rank above seen-but-weak");
  if (!(priority({ mastery: 1 }) > priority({ mastery: 5 }))) fail("PRIORITY", "mastery 1 should outrank mastery 5");
  else ok("PRIORITY", "lower mastery ⇒ higher priority");

  if (nextConsecutiveFives(1, 5) !== 2) fail("STREAK", "a 5 must increment the streak");
  if (nextConsecutiveFives(3, 4) !== 0) fail("STREAK", "anything below 5 must reset the streak");
  if (isRetired({ mastery: 4, consecutiveFives: 5 })) fail("STREAK", "mastery<5 must not count as retired");
  if (!failures) ok("STREAK", "5 increments, <5 resets, retirement needs mastery 5");
}

console.log(failures ? `\n❌ ${failures} failures\n` : "\n✅ study session behaves as specified\n");
process.exit(failures ? 1 : 0);
