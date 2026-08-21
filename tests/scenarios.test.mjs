import assert from "node:assert";
import {
  qPregnancy, qAllergy, qWithIngredient, qPitfall, qCompose,
  buildMenuExamDeck, hasIngredient, mentions, MULTI_TARGET,
} from "../src/lib/serviceScenarios.js";

// A small menu shaped like a real one: one category rich enough for every builder, one
// thin category that must never produce a question.
const dish = (id, category, name, o = {}) => ({
  id, category, name,
  ingredients: o.ing || [], allergens: o.all || [], pregnancy: o.preg || [], pitfalls: o.pit || [],
  desc: o.desc || "",
});

const menu = [
  dish("r1", "רולים", "ספייסי סלמון", { ing: ["סלמון", "אורז", "מיונז חריף"], all: ["סויה"], pit: ["חריף"] }),
  dish("r2", "רולים", "סלמון אבוקדו", { ing: ["סלמון", "אורז", "אבוקדו"], all: ["סויה"] }),
  dish("r3", "רולים", "סלמון סקין", { ing: ["סלמון", "אורז", "בצל ירוק"], all: ["סויה"] }),
  dish("r4", "רולים", "טונה קראנץ׳", { ing: ["טונה", "אורז", "טמפורה"], all: ["גלוטן"] }),
  dish("r5", "רולים", "ירקות", { ing: ["מלפפון", "אורז", "אבוקדו"], all: ["שומשום"] }),
  dish("r6", "רולים", "צלופח", { ing: ["צלופח", "אורז"], all: ["סויה"] }),
  dish("s1", "ראשונות", "סשימי בס", { ing: ["בס", "לימון"], preg: ["דג נא"], all: ["סויה"] }),
  dish("s2", "ראשונות", "טרטר טונה", { ing: ["טונה", "שמן זית"], preg: ["דג נא"], all: ["סויה"] }),
  dish("s3", "ראשונות", "קרפצ׳ו בקר", { ing: ["בקר", "פרמזן"], preg: ["בשר נא"], all: ["לקטוז"] }),
  dish("s4", "ראשונות", "אדממה", { ing: ["אדממה", "מלח"], all: ["סויה"] }),
  dish("d1", "קינוחים", "מוצי", { ing: ["אורז דביק", "גלידה"] }),
];

const seq = (nums) => { let i = 0; return () => nums[i++ % nums.length]; };

// 1. Pregnancy: the correct answer carries no pregnancy flag, every distractor does.
{
  const q = qPregnancy(menu, seq([0.9, 0.1, 0.3, 0.5, 0.7]));
  assert.ok(q, "pregnancy question must be buildable on this menu");
  const correct = q.options.filter((o) => o.correct);
  assert.equal(correct.length, 1, "exactly one correct answer");
  const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
  assert.equal((byId[correct[0].id].pregnancy || []).length, 0, "recommended dish is pregnancy-safe");
  for (const o of q.options.filter((x) => !x.correct))
    assert.ok((byId[o.id].pregnancy || []).length > 0, `distractor ${o.label} must carry a pregnancy flag`);
}

// 2. Allergy: distractors all contain the named allergen; the answer declares allergens
//    of its own (an empty list is "nobody filled it in", not "safe").
{
  for (let i = 0; i < 40; i++) {
    const q = qAllergy(menu);
    if (!q) continue;
    const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
    const allergen = q.prompt.match(/אלרגיה ל(\S+)/)[1].replace(/\.$/, "");
    const correct = q.options.filter((o) => o.correct);
    assert.equal(correct.length, 1);
    assert.ok(!(byId[correct[0].id].allergens || []).includes(allergen), "answer must not contain the allergen");
    assert.ok((byId[correct[0].id].allergens || []).length > 0, "answer must declare allergens at all");
    for (const o of q.options.filter((x) => !x.correct))
      assert.ok((byId[o.id].allergens || []).includes(allergen), "distractor must contain the allergen");
  }
}

// 3. "Recommend three with X": exactly MULTI_TARGET correct, and no distractor mentions
//    the ingredient anywhere — not in its name, not in its description.
{
  let built = 0;
  for (let i = 0; i < 60; i++) {
    const q = qWithIngredient(menu);
    if (!q) continue;
    built++;
    assert.equal(q.options.filter((o) => o.correct).length, MULTI_TARGET);
    const ing = q.prompt.match(/עם (.+?)\./)[1];
    const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
    for (const o of q.options.filter((x) => !x.correct))
      assert.ok(!mentions(byId[o.id], ing), `distractor ${o.label} must not mention ${ing}`);
  }
  assert.ok(built > 0, "the salmon-style question must be buildable");
}

// 4. Pitfall: built only when exactly one dish carries it.
{
  for (let i = 0; i < 40; i++) {
    const q = qPitfall(menu);
    if (!q) continue;
    assert.equal(q.options.filter((o) => o.correct).length, 1);
  }
}

// 5. Compose: every correct chip is a real ingredient, every decoy is not.
{
  const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
  for (let i = 0; i < 40; i++) {
    const q = qCompose(menu);
    if (!q) continue;
    const it = byId[q.subjectId];
    for (const o of q.options)
      assert.equal(hasIngredient(it, o.label), o.correct, `${o.label} mislabelled for ${it.name}`);
  }
}

// 6. Deck: mixed, never repeats a prompt, and every single-answer question has exactly
//    one right option. This is the gate that matters — see QUESTION-QUALITY line 16.
{
  const deck = buildMenuExamDeck(menu, 20);
  assert.ok(deck.length >= 8, `deck too thin: ${deck.length}`);
  assert.equal(new Set(deck.map((q) => q.prompt)).size, deck.length, "no duplicate prompts");
  assert.ok(new Set(deck.map((q) => q.kind)).size >= 3, "deck must mix question types");
  for (const q of deck) {
    const correct = q.options.filter((o) => o.correct).length;
    if (q.multi) assert.ok(correct >= 1, `${q.kind}: multi needs a correct set`);
    else assert.equal(correct, 1, `${q.kind}: "${q.prompt}" has ${correct} correct answers`);
    assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, "no duplicate option labels");
  }
}

// 7. A menu too thin to ask anything returns an empty deck instead of inventing one.
{
  assert.deepEqual(buildMenuExamDeck([dish("x", "קפה", "אספרסו")], 10), []);
  assert.deepEqual(buildMenuExamDeck([], 10), []);
}

console.log("scenarios.test.mjs OK");
