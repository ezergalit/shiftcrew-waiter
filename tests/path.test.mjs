// Drives the staged learning path end to end without a browser or a database.
// Run: node tests/path.test.mjs

import { pathState, orderedCategories, categoryPct, GAME_UNLOCKS } from "../src/lib/learningPath.js";

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`  ❌ ${msg}`); } };

const pool = [
  ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, category: "ראשונות" })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, category: "עיקריות" })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, category: "קינוחים" })),
];
const setMastery = (prefix, value, n) =>
  Object.fromEntries(pool.filter((p) => p.id.startsWith(prefix)).slice(0, n).map((p) => [p.id, value]));

console.log("\n=== learning path ===");

// Order follows the menu, not the alphabet
check(
  JSON.stringify(orderedCategories(pool)) === JSON.stringify(["ראשונות", "עיקריות", "קינוחים"]),
  "category order should follow menu order"
);
check(
  orderedCategories(pool, ["קינוחים"])[0] === "קינוחים",
  "owner's configured order should win"
);

// Fresh waiter: only the first category, no games, nothing else reachable
{
  const s = pathState(pool, {}, []);
  check(s.categories[0].unlocked, "first category must be open to a brand-new waiter");
  check(!s.categories[1].unlocked, "second category must stay locked");
  check(!s.categories[0].examUnlocked, "exam must not open at 0%");
  check(s.games.every((g) => !g.unlocked), "no game may be open before the first exam is passed");
  check(s.gamePool.length === 5, `games must only see the open category (got ${s.gamePool.length}, want 5)`);
  check(s.nextStep?.kind === "study", "next step should be studying the first category");
}

// Just under the threshold — exam still shut
{
  const s = pathState(pool, setMastery("s", 2, 5), []); // 2/5 everywhere = 40%
  check(s.categories[0].pct === 40, `expected 40%, got ${s.categories[0].pct}`);
  check(!s.categories[0].examUnlocked, "exam must stay shut below the threshold");
}

// At the threshold — exam opens, next category still shut until it is passed
{
  const s = pathState(pool, setMastery("s", 3, 5), []); // 60%
  check(s.categories[0].examUnlocked, "exam must open at/above the threshold");
  check(!s.categories[1].unlocked, "reaching the threshold must not itself open the next category");
  check(s.nextStep?.kind === "exam", "next step should be the exam once it is open");
}

// Passing the first exam: next category opens, first tier of games opens, pool grows
{
  const s = pathState(pool, setMastery("s", 3, 5), ["ראשונות"]);
  check(s.categories[1].unlocked, "passing the first exam must open the second category");
  check(!s.categories[2].unlocked, "the third category must still be locked");
  check(s.gamePool.length === 15, `game pool should now be 5+10=15, got ${s.gamePool.length}`);
  const open = s.games.filter((g) => g.unlocked).map((g) => g.mode);
  check(open.includes("quiz") && open.includes("match"), "quiz and match should open after one pass");
  check(!open.includes("speed"), "speed should wait for a second pass");
  check(s.games.find((g) => g.mode === "speed").need === 1, "locked game should say how many passes are left");
}

// Two passed: second tier opens
{
  const s = pathState(pool, {}, ["ראשונות", "עיקריות"]);
  const open = s.games.filter((g) => g.unlocked).map((g) => g.mode);
  check(open.includes("speed") && open.includes("allergens"), "second tier should open after two passes");
  check(!open.includes("namecomplete"), "last game should wait for three passes");
  check(s.categories[2].unlocked, "third category should be open after two passes");
}

// Everything passed
{
  const s = pathState(pool, {}, ["ראשונות", "עיקריות", "קינוחים"]);
  check(s.games.every((g) => g.unlocked), "all games open once every category is passed");
  check(s.nextStep === null, "no next step when the whole menu is done");
  check(s.gamePool.length === pool.length, "game pool should be the whole menu at the end");
}

// Owner turned gating off — everything open, path UI still meaningful
{
  const s = pathState(pool, {}, [], { gate_games: false });
  check(s.categories.every((c) => c.unlocked), "ungated config must open every category");
  check(s.games.every((g) => g.unlocked), "ungated config must open every game");
  check(s.gamePool.length === pool.length, "ungated game pool is the whole menu");
}

// Owner raised the bar
{
  const s = pathState(pool, setMastery("s", 3, 5), [], { pass_threshold: 80 });
  check(!s.categories[0].examUnlocked, "60% must not open an exam when the owner set 80%");
  check(s.categories[0].threshold === 80, "threshold should be reported for the UI");
}

// Percentage formula matches the rest of the app (sum of mastery / max)
check(categoryPct([{ id: "a" }, { id: "b" }], { a: 5, b: 0 }) === 50, "categoryPct should average over the max, not count passes");
check(categoryPct([], {}) === 0, "empty category is 0%, not NaN");

// A menu with a single category must not deadlock
{
  const one = [{ id: "a", category: "הכל" }, { id: "b", category: "הכל" }];
  const s = pathState(one, { a: 5, b: 5 }, []);
  check(s.categories[0].unlocked && s.categories[0].examUnlocked, "single-category menu must be playable");
}

console.log(failures ? `\n❌ ${failures} failures\n` : "\n✅ learning path behaves as specified\n");
process.exit(failures ? 1 : 0);
