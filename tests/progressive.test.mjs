// Progressive-window session (2026-08-19): the picker behind the menu tab's continuous
// practice. Run: node tests/progressive.test.mjs
import assert from "node:assert/strict";
import { pickNext, isUnderstood, WINDOW_SIZE } from "../src/lib/progressiveSession.js";
import { RETIRE_AFTER_FIVES, nextConsecutiveFives } from "../src/lib/studySession.js";

const dishes = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, name: `Dish ${i}` }));
const fresh = () => ({});

// 1. Only the first WINDOW_SIZE untouched dishes are ever served.
{
  const progress = fresh();
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const { item } = pickNext(dishes, progress);
    seen.add(item.id);
  }
  const allowed = new Set(dishes.slice(0, WINDOW_SIZE).map((d) => d.id));
  for (const id of seen) assert.ok(allowed.has(id), `served ${id} outside the window`);
}

// 2. Understanding a dish (two consecutive 5s) pulls the NEXT menu dish into the window.
{
  const progress = fresh();
  progress.d0 = { mastery: 5, consecutiveFives: RETIRE_AFTER_FIVES };
  assert.ok(isUnderstood(progress.d0.consecutiveFives));
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const { item, refresh } = pickNext(dishes, progress);
    if (!refresh) seen.add(item.id);
  }
  assert.ok(seen.has("d4"), "d4 should enter the window after d0 retires");
  assert.ok(!seen.has("d5"), "d5 must stay out while only one dish is understood");
}

// 3. The same dish never repeats back-to-back (when alternatives exist).
{
  const progress = fresh();
  for (let i = 0; i < 300; i++) {
    const { item } = pickNext(dishes, progress, "d1");
    assert.notEqual(item.id, "d1");
  }
}

// 4. All understood → refresh rounds, never a dead end.
{
  const progress = {};
  for (const d of dishes) progress[d.id] = { mastery: 5, consecutiveFives: RETIRE_AFTER_FIVES };
  const { item, refresh } = pickNext(dishes, progress);
  assert.ok(item, "must still serve a dish");
  assert.ok(refresh, "and mark it as a refresher");
}

// 5. A ≤2 rating resets the streak (via the shared counter) and keeps the dish in play.
{
  assert.equal(nextConsecutiveFives(1, 2), 0);
  const progress = { d0: { mastery: 2, consecutiveFives: 0 } };
  // ⚠️ This is a sampling assertion, so the sample has to be big enough to out-shout
  // the noise. At 400 draws the expected share (8/29 ≈ 110) sat barely above the 100
  // threshold — about one standard deviation — so the test failed on roughly 1 run in
  // 20 with nothing wrong. A flaky test is worse than no test: it teaches you to
  // re-run instead of to look. 4000 draws puts the same threshold ~3.5σ away.
  const DRAWS = 4000;
  const count = {};
  for (let i = 0; i < DRAWS; i++) {
    const { item } = pickNext(dishes, progress);
    count[item.id] = (count[item.id] || 0) + 1;
  }
  // Doubled weight: d0 (weight 8) vs d1-d3 untouched (7 each) — should lead the pack.
  assert.ok((count.d0 || 0) > DRAWS / WINDOW_SIZE, `weak dish under-served: ${count.d0}`);
  const rival = Math.max(...Object.entries(count).filter(([id]) => id !== "d0").map(([, n]) => n));
  assert.ok(count.d0 > rival, `weak dish did not lead: ${JSON.stringify(count)}`);
}

// 6. Empty scope → null, no crash.
{
  const { item } = pickNext([], {});
  assert.equal(item, null);
}

console.log("progressive.test: all assertions passed");
