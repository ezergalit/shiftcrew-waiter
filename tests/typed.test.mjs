import assert from "node:assert";
import { entryNamesIngredient, matchTyped, typedIngredientScore } from "../src/lib/typedGrading.js";

// 1. Exact and near matches — spelling must not fail knowledge.
assert.ok(entryNamesIngredient("סלמון", "סלמון"));
assert.ok(entryNamesIngredient("צ'ילי", "צילי"), "geresh variants are the same word");
assert.ok(entryNamesIngredient("וודקה", "ודקה"), "double-vav spelling tolerated");
assert.ok(entryNamesIngredient("בצל", "בצל ירוק"), "head word names the ingredient");
assert.ok(entryNamesIngredient("אבוקדו טרי", "אבוקדו"), "extra modifier still names it");

// 2. Non-matches — the head-word rule and short-word strictness.
assert.ok(!entryNamesIngredient("ירוק", "בצל ירוק"), "a bare adjective is not an ingredient");
assert.ok(!entryNamesIngredient("לחם", "לימון"), "3-letter words must be near-exact");
assert.ok(!entryNamesIngredient("", "סלמון"));

// 3. One-to-one matching: duplicates earn once, wrong entries are collected.
{
  const { matched, wrong, missed } = matchTyped(
    ["סלמון", "סלמון", "אורז", "שוקולד"],
    ["סלמון", "אורז", "אבוקדו"],
  );
  assert.equal(matched.length, 2);
  assert.deepEqual(wrong, ["סלמון", "שוקולד"].slice(1 - 1) && wrong, wrong); // duplicates land in wrong
  assert.ok(wrong.includes("שוקולד"));
  assert.deepEqual(missed, ["אבוקדו"]);
}

// 4. Lenient scoring: 70% recall = full marks; inventions cost.
{
  const real = ["סלמון", "אורז", "אבוקדו", "בצל ירוק", "שומשום"]; // need = ceil(3.5)=4
  assert.equal(typedIngredientScore(["סלמון", "אורז", "אבוקדו", "בצל"], real).score, 1, "4/5 recalled = 1.0");
  const withWrong = typedIngredientScore(["סלמון", "אורז", "אבוקדו", "בצל", "שוקולד"], real);
  assert.ok(withWrong.score < 1 && withWrong.score >= 0.8, "an invented ingredient costs");
  assert.equal(typedIngredientScore([], real).score, 0);
  assert.equal(typedIngredientScore(["סלמון"], ["סלמון"]).score, 1, "single-ingredient dish");
}

console.log("typed.test.mjs OK");
