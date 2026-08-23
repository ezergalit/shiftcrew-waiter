import assert from "node:assert";
import {
  qPregnancy, qAllergy, qWithIngredient, qPitfall, qCompose,
  qMenuGroup, qPrice, qFromDescription, qAllergenSet, qServingOrder,
  buildMenuExamDeck, hasIngredient, mentions, MULTI_TARGET,
} from "../src/lib/serviceScenarios.js";

// A small menu shaped like a real one: one category rich enough for every builder, one
// thin category that must never produce a question.
const dish = (id, category, name, o = {}) => ({
  id, category, name,
  ingredients: o.ing || [], allergens: o.all || [], pregnancy: o.preg || [], pitfalls: o.pit || [],
  desc: o.desc || "", price: o.price || 0, menuGroup: o.group || null,
});

const menu = [
  dish("r1", "רולים", "ספייסי סלמון", { ing: ["סלמון", "אורז", "מיונז חריף"], all: ["סויה"], pit: ["חריף"], price: 52, group: "תפריט סושי", desc: "רול במילוי דג עם רוטב פיקנטי ובצל ירוק מעל" }),
  dish("r2", "רולים", "סלמון אבוקדו", { ing: ["סלמון", "אורז", "אבוקדו"], all: ["סויה"], price: 48, group: "תפריט סושי", desc: "רול קלאסי עם פרי ירוק קרמי ואצה בחוץ" }),
  dish("r3", "רולים", "סלמון סקין", { ing: ["סלמון", "אורז", "בצל ירוק"], all: ["סויה"], price: 54, group: "תפריט סושי", desc: "רול עם עור צרוב פריך וציפוי טריאקי מתקתק" }),
  dish("r4", "רולים", "טונה קראנץ׳", { ing: ["טונה", "אורז", "טמפורה"], all: ["גלוטן"], price: 58, group: "תפריט סושי", desc: "רול עם שבבים פריכים מעל ורוטב חמצמץ בצד" }),
  dish("r5", "רולים", "ירקות", { ing: ["מלפפון", "אורז", "אבוקדו"], all: ["שומשום"] }),
  dish("r6", "רולים", "צלופח", { ing: ["צלופח", "אורז"], all: ["סויה"] }),
  dish("s1", "ראשונות", "סשימי בס", { ing: ["בס", "לימון"], preg: ["דג נא"], all: ["סויה"] }),
  dish("s2", "ראשונות", "טרטר טונה", { ing: ["טונה", "שמן זית"], preg: ["דג נא"], all: ["סויה"] }),
  dish("s3", "ראשונות", "קרפצ׳ו בקר", { ing: ["בקר", "פרמזן"], preg: ["בשר נא"], all: ["לקטוז"] }),
  dish("s4", "ראשונות", "אדממה", { ing: ["אדממה", "מלח"], all: ["סויה"] }),
  dish("d1", "קינוחים", "מוצי", { ing: ["אורז דביק", "גלידה"], price: 32, group: "תפריט קינוחים", desc: "כדורי בצק רך במילוי קר ומתוק לסיום הארוחה" }),
  dish("b1", "קוקטיילים", "נגרוני", { ing: ["ג׳ין", "קמפרי", "ורמוט"], price: 62, group: "תפריט בר" }),
  dish("b2", "קוקטיילים", "מוחיטו", { ing: ["רום", "נענע", "ליים"], price: 58, group: "תפריט בר" }),
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

// 8. Menu group: the correct answer is the dish's own menu; distractors are other menus.
{
  for (let i = 0; i < 40; i++) {
    const q = qMenuGroup(menu);
    if (!q) continue;
    assert.equal(q.options.filter((o) => o.correct).length, 1);
    const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
    assert.equal(q.options.find((o) => o.correct).label, byId[q.subjectId].menuGroup);
  }
}

// 9. Price: exactly one correct, and no two options show the same number — two options
//    with the same price would be two correct answers wearing different labels.
{
  let built = 0;
  for (let i = 0; i < 60; i++) {
    const q = qPrice(menu);
    if (!q) continue;
    built++;
    assert.equal(q.options.filter((o) => o.correct).length, 1);
    assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length);
    const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
    assert.equal(q.options.find((o) => o.correct).label, `${byId[q.subjectId].price} ₪`);
  }
  assert.ok(built > 0, "price question must be buildable");
}

// 10. Description: the dish's own name must not survive in the masked prompt.
{
  let built = 0;
  for (let i = 0; i < 60; i++) {
    const q = qFromDescription(menu);
    if (!q) continue;
    built++;
    assert.equal(q.options.filter((o) => o.correct).length, 1);
    const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
    for (const w of byId[q.subjectId].name.split(/\s+/).filter((x) => x.length > 2))
      assert.ok(!q.prompt.includes(w), `name word "${w}" leaked into the description prompt`);
  }
  assert.ok(built > 0, "description question must be buildable");
}

// 11. Allergen set: only for dishes that actually declare allergens, and the chips split
//     cleanly into the dish's own allergens and ones it doesn't have.
{
  const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
  for (let i = 0; i < 40; i++) {
    const q = qAllergenSet(menu);
    if (!q) continue;
    const real = byId[q.subjectId].allergens;
    assert.ok(real.length > 0, "never ask about a dish with no declared allergens");
    for (const o of q.options)
      assert.equal(real.includes(o.label), o.correct, `${o.label} mislabelled`);
  }
}

// 12. Serving order: built only from the owner's category order, and the answer is the
//     dish from the earliest category in it. With no order configured — no question.
{
  const order = ["ראשונות", "רולים", "קוקטיילים", "קינוחים"];
  assert.equal(qServingOrder(menu, Math.random, []), null, "no category order ⇒ no question");
  const byId = Object.fromEntries(menu.map((d) => [d.id, d]));
  for (let i = 0; i < 40; i++) {
    const q = qServingOrder(menu, Math.random, order);
    if (!q) continue;
    assert.equal(q.options.filter((o) => o.correct).length, 1);
    const correct = q.options.find((o) => o.correct);
    const ranks = q.options.map((o) => order.indexOf(byId[o.id].category));
    assert.equal(order.indexOf(byId[correct.id].category), Math.min(...ranks),
      "the correct answer must be the earliest category in the owner's order");
  }
}

// 13. The whole deck, with a category order supplied: still one right answer per
//     single-answer question, and now visibly more varied.
{
  const deck = buildMenuExamDeck(menu, 24, Math.random, ["ראשונות", "רולים", "קוקטיילים", "קינוחים"]);
  assert.ok(new Set(deck.map((q) => q.kind)).size >= 5, `deck not varied enough: ${[...new Set(deck.map((q) => q.kind))]}`);
  for (const q of deck) {
    const correct = q.options.filter((o) => o.correct).length;
    if (!q.multi) assert.equal(correct, 1, `${q.kind}: "${q.prompt}" has ${correct} correct answers`);
    assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, `${q.kind}: duplicate option labels`);
  }
}

console.log("scenarios.test.mjs OK");

const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// ── order: drinks are not a course ─────────────────────────────────────────────────────
// Live on Studio 2026 the order question once asked which of a cocktail, a Campari and an
// iced tea "comes out first" — unanswerable, because drinks reach the table when poured.
{
  const drinks = [
    { id: "d1", name: "קמפרי", category: "אלכוהול", ingredients: [], desc: "" },
    { id: "d2", name: "תה קר", category: "שתייה קלה", ingredients: [], desc: "" },
    { id: "d3", name: "שביל האבנים", category: "קוקטיילים", ingredients: [], desc: "" },
  ];
  const order = ["אלכוהול", "שתייה קלה", "קוקטיילים"];
  let q = null;
  for (let i = 0; i < 50; i++) q = q || qServingOrder(drinks, seeded(i), order);
  assert.equal(q, null, "all-drinks order question must not be built");

  const withFood = [...drinks,
    { id: "f1", name: "סלט", category: "סלטים", ingredients: ["חסה"], desc: "סלט ירוק" },
    { id: "f2", name: "סטייק", category: "עיקריות", ingredients: ["בקר"], desc: "אנטריקוט" },
    { id: "f3", name: "עוגה", category: "קינוחים", ingredients: ["שוקולד"], desc: "עוגת שוקולד" },
  ];
  const foodOrder = ["סלטים", "עיקריות", "קינוחים", "אלכוהול", "שתייה קלה", "קוקטיילים"];
  const fq = qServingOrder(withFood, seeded(1), foodOrder);
  assert.ok(fq, "food order question should still build");
  assert.ok(fq.options.every((o) => ["סלט", "סטייק", "עוגה"].includes(o.label)),
    "order options must be food, got " + fq.options.map((o) => o.label).join(", "));
  console.log("✓ order: drinks excluded, food still works");
}
