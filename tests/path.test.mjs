// Drives the learning path end to end without a browser or a database.
// Run: node tests/path.test.mjs
//
// The spec these assertions encode (user, 2026-08-13):
//   "all practice open from the start, but only for specific topics"
//   "opened starters ⇒ all practice is starters; starters + desserts ⇒ mixed"
//   "not progressive — you can learn mains, starters, desserts whenever you want"
//   "you could start with alcohol, then mains"
//   "recommend starting with starters and steer, but the point is they don't get fed up"

import { pathState, orderedCategories, categoryPct, GAME_MODES } from "../src/lib/learningPath.js";

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`  ❌ ${msg}`); } else console.log(`  ✅ ${msg}`); };

const pool = [
  ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, category: "ראשונות" })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, category: "עיקריות" })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, category: "קינוחים" })),
];
const setMastery = (prefix, value, n) =>
  Object.fromEntries(pool.filter((p) => p.id.startsWith(prefix)).slice(0, n).map((p) => [p.id, value]));

console.log("\n=== order ===");
check(
  JSON.stringify(orderedCategories(pool)) === JSON.stringify(["ראשונות", "עיקריות", "קינוחים"]),
  "category order follows menu order, not the alphabet"
);
check(orderedCategories(pool, ["קינוחים"])[0] === "קינוחים", "owner's configured order wins");

console.log("\n=== nothing is locked ===");
{
  const s = pathState(pool, {}, []);
  check(s.categories.every((c) => c.unlocked), "every category is open to study from the start");
  check(s.games.every((g) => g.unlocked), "every practice mode is open from the start");
  check(s.games.length === GAME_MODES.length, "all modes are listed");
  check(s.games.every((g) => !g.needLabel), "no mode advertises an unlock requirement any more");
  check(s.recommended?.key === "ראשונות", "the first category is recommended, not required");
  check(s.nextStep?.kind === "study", "the next step points at studying the recommendation");
}

console.log("\n=== practice is scoped to what you opened ===");
{
  // Day one: nothing passed. Practice still works, scoped to the recommendation.
  const fresh = pathState(pool, {}, []);
  check(fresh.gamePool.length === 5, `day one practice is the recommended category only (got ${fresh.gamePool.length}, want 5)`);
  check(fresh.gamePool.every((it) => it.category === "ראשונות"), "day one practice is starters only");

  // "opened starters ⇒ all practice is starters"
  const starters = pathState(pool, {}, ["ראשונות"]);
  check(starters.gamePool.length === 5, "opened starters ⇒ pool is the 5 starters");
  check(starters.gamePool.every((it) => it.category === "ראשונות"), "opened starters ⇒ practice is starters only");

  // "starters + desserts ⇒ mixed between them" — and mains stay out.
  const both = pathState(pool, {}, ["ראשונות", "קינוחים"]);
  const kinds = new Set(both.gamePool.map((it) => it.category));
  check(both.gamePool.length === 9, `starters+desserts ⇒ 5+4=9 dishes (got ${both.gamePool.length})`);
  check(kinds.has("ראשונות") && kinds.has("קינוחים"), "practice mixes both opened categories");
  check(!kinds.has("עיקריות"), "an unopened category never leaks into practice");
}

console.log("\n=== any order — start wherever you like ===");
{
  // "you could start with alcohol, then mains": pass a LATER category first and the path
  // must not object, and practice must scope to it rather than to the first category.
  const mainsFirst = pathState(pool, {}, ["עיקריות"]);
  check(mainsFirst.gamePool.every((it) => it.category === "עיקריות"), "passing mains first scopes practice to mains");
  check(mainsFirst.gamePool.length === 10, "pool is the 10 mains");
  check(mainsFirst.categories.every((c) => c.unlocked), "starting out of order locks nothing");
  check(mainsFirst.recommended?.key === "ראשונות", "the recommendation still steers to starters");

  const dessertsFirst = pathState(pool, {}, ["קינוחים"]);
  check(dessertsFirst.gamePool.every((it) => it.category === "קינוחים"), "passing desserts first scopes practice to desserts");
}

console.log("\n=== exams still need study first ===");
{
  const none = pathState(pool, {}, []);
  check(!none.categories[0].examUnlocked, "an untouched category cannot be examined");

  const half = pathState(pool, setMastery("s", 3, 5), []);       // 3/5 on all 5 = 60%
  check(half.categories[0].examUnlocked, "reaching the threshold opens that category's exam");
  check(!half.categories[1].examUnlocked, "the threshold is per category, not global");
  check(half.nextStep?.kind === "exam", "next step becomes the exam once it is reachable");

  // Out-of-order study: mains studied, starters untouched.
  const mainsStudied = pathState(pool, setMastery("m", 4, 10), []);
  check(mainsStudied.categories[1].examUnlocked, "you can qualify for the mains exam without touching starters");
}

console.log("\n=== everything passed ===");
{
  const s = pathState(pool, {}, ["ראשונות", "עיקריות", "קינוחים"]);
  check(s.gamePool.length === pool.length, "all opened ⇒ practice draws from the whole menu");
  check(s.recommended === null, "nothing left to recommend");
  check(s.nextStep === null, "no next step when everything is passed");
  check(s.passedCount === 3, "passedCount counts opened categories");
}

console.log("\n=== owner switched scoping off ===");
{
  const s = pathState(pool, {}, [], { gate_games: false });
  check(s.gamePool.length === pool.length, "unscoped config practices on the whole menu");
  check(s.categories.every((c) => c.unlocked), "unscoped config still opens every category");
}

console.log("\n=== single-category menu ===");
{
  const one = pool.filter((p) => p.category === "ראשונות");
  const s = pathState(one, setMastery("s", 5, 5), []);
  check(s.categories[0].unlocked && s.categories[0].examUnlocked, "a one-category menu is playable");
  check(s.gamePool.length === 5, "its practice pool is that category");
}

console.log("\n=== percentages ===");
check(categoryPct(pool.filter((p) => p.category === "ראשונות"), setMastery("s", 4, 5)) === 80,
  "4-of-5 on every dish reads as 80%, not 100%");

console.log(failures ? `\n❌ ${failures} failures\n` : "\n✅ learning path behaves as specified\n");
process.exit(failures ? 1 : 0);
