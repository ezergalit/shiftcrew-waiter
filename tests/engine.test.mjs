// Quality tests for the question engine. Run: node tests/engine.test.mjs
//
// Every row in QUESTION-QUALITY.md has a check here. A question that can be answered by
// general knowledge, language instinct, or visual pattern is a failure even when the
// trainee would pick the "right" option — that is the whole point of the file.
//
// Menus under test: the two real ones (sushi 38, Greek 19) plus synthetic edge cases that
// isolate a single failure mode.

import { readFileSync } from "node:fs";
import {
  FACETS, RECOMMENDED_FACETS, availableFacets, buildWeightedDeck, buildSmartDeck,
  validateQuestion, maskNameLeak, splitChanges, dishLabel, hebKey,
  qChanges, qNotIngredient, qDescMatch, qWhichDish, qServingStyle, qAllergenDish, qPrice,
} from "../src/lib/questionEngine.js";
import { MOCK_CARDS } from "../src/lib/mockMenu.js";

const ROOT = new URL("..", import.meta.url).pathname;
let failures = 0;
const fail = (menu, msg) => { failures++; console.log(`  ❌ [${menu}] ${msg}`); };
const norm = (s) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2);

// ---------------------------------------------------------------- menus

const sushi = JSON.parse(
  readFileSync("/Users/homestation/Desktop/menu-backups/salon-sushi-demo-2026-08-12.json", "utf8")
).map((d, i) => ({
  id: "s" + i, name: d.name, category: d.category, desc: d.description || "",
  ingredients: d.ingredients || [], allergens: d.allergens || [], price: d.price,
  displayName: qualify(d.name, d.category),
}));

function qualify(name, category) {
  const c = String(category || "").split(/\s*[—–]\s*/)[0].trim();
  return c && !String(name).startsWith(c) ? `${c} ${name}` : name;
}

const greek = MOCK_CARDS.map((c) => ({ ...c, displayName: qualify(c.name, c.category) }));

// Course-name categories: the case where "which serving style?" degenerates into
// "is a sea bass a fish or a vegetable?" — answerable with zero menu knowledge.
const semanticCats = [
  { id: "x1", name: "בס", category: "דגים", desc: "פילה בס צלוי", ingredients: ["בס", "לימון", "שמן זית"], allergens: ["דגים"], price: 90 },
  { id: "x2", name: "אנטריקוט", category: "בשרים", desc: "אנטריקוט על הגריל", ingredients: ["בקר", "מלח", "פלפל"], allergens: [], price: 140 },
  { id: "x3", name: "חציל בטחינה", category: "ירקות", desc: "חציל שרוף בטחינה", ingredients: ["חציל", "טחינה", "לימון"], allergens: ["שומשום"], price: 46 },
  { id: "x4", name: "סלמון", category: "דגים", desc: "סלמון בתנור", ingredients: ["סלמון", "חמאה", "שמיר"], allergens: ["דגים", "חלב"], price: 110 },
].map((d) => ({ ...d, displayName: d.name }));

// Prices baked into the dish name — asking the price is then reading comprehension.
const pricesInNames = [
  { id: "p1", name: "Sea Bass 165", category: "mains", desc: "בס ים שלם צלוי", ingredients: ["בס", "לימון", "תרד"], allergens: ["דגים"], price: 165 },
  { id: "p2", name: "Sea Tuna 168", category: "mains", desc: "סטייק טונה", ingredients: ["טונה", "סויה", "שמן"], allergens: ["דגים"], price: 168 },
  { id: "p3", name: "Sea Fish 155", category: "mains", desc: "דגה טרייה בתנור", ingredients: ["דג", "זעתר", "שמן זית"], allergens: ["דגים"], price: 155 },
  { id: "p4", name: "Full Sea Bass 600", category: "mains", desc: "בס גדול לשולחן", ingredients: ["בס", "עשבים", "שמן"], allergens: ["דגים"], price: 600 },
].map((d) => ({ ...d, displayName: d.name }));

const ALL_BUILDERS = [qChanges, qNotIngredient, qDescMatch, qWhichDish, qServingStyle, qAllergenDish, qPrice];

// ---------------------------------------------------------------- generic checks

function checkQuestion(menu, pool, q) {
  const it = pool.find((d) => d.id === q.itemId);
  if (!it) return fail(menu, `question references unknown dish ${q.itemId}`);

  // #1 leak: no option may contain a bare word of the answer dish's name, except where
  // the option IS a dish label (then the name is legitimately the answer text).
  const optionsAreDishNames = q.options.includes(dishLabel(it));
  // Spelling-variant aware, same as the engine: לימון and למון are one word here.
  const keys = (s) => new Set(norm(s).map(hebKey));
  const shares = (text, k) => norm(text).some((w) => k.has(hebKey(w)));

  if (!optionsAreDishNames && q.facet !== "ingredients" && q.facet !== "serving") {
    const nameKeys = keys(it.name);
    for (const opt of q.options)
      if (shares(opt, nameKeys))
        fail(menu, `[${q.prompt}] option leaks dish name "${it.name}": ${opt.slice(0, 60)}`);
  }

  // #4 single-overlap giveaway — a description that says "מניפת לימון" next to an option
  // called "למון טוויסט" is answerable without knowing the menu.
  const subjKeys = keys(q.subject);
  if (subjKeys.size) {
    const overlapping = q.options.filter((o) => shares(o, subjKeys));
    if (overlapping.length === 1)
      fail(menu, `[${q.prompt}] exactly one option overlaps the subject "${q.subject}": ${overlapping[0].slice(0, 50)}`);
  }

  // #5 length outlier
  const others = q.options.filter((o) => o !== q.correct).map((o) => o.length).sort((a, b) => a - b);
  const median = others[Math.floor(others.length / 2)];
  if (median >= 12 && (q.correct.length > median * 2 || q.correct.length * 2 < median))
    fail(menu, `[${q.prompt}] correct answer is a length outlier (${q.correct.length} vs median ${median})`);

  // #6 duplicates
  if (new Set(q.options).size !== q.options.length) fail(menu, `[${q.prompt}] duplicate options`);
  if (!q.options.includes(q.correct)) fail(menu, `[${q.prompt}] correct not among options`);
  if (q.options.length < 3) fail(menu, `[${q.prompt}] fewer than 3 options`);

  // semantic correctness per builder — the answer must genuinely belong to its dish
  if (q.prompt === "איזו מנה מתאימה לתיאור?" && q.correct !== dishLabel(it))
    fail(menu, `whichDish: correct "${q.correct}" is not the dish "${dishLabel(it)}"`);
  if (q.prompt === "איזה מרכיב לא נמצא במנה?" && (it.ingredients || []).map((x) => x.trim()).includes(q.correct))
    fail(menu, `notIngredient: "${q.correct}" IS in ${it.name}`);
  if (q.prompt === "מה מחיר המנה?" && q.correct !== `₪${Number(it.price)}`)
    fail(menu, `price: correct "${q.correct}" != actual ₪${it.price}`);
  if (q.prompt?.startsWith("אורח מבקש")) {
    const allergen = q.subject;
    if (!(it.allergens || []).includes(allergen)) fail(menu, `allergenDish: ${it.name} has no ${allergen}`);
    for (const opt of q.options.filter((o) => o !== q.correct)) {
      const other = pool.find((d) => dishLabel(d) === opt);
      if (other && (other.allergens || []).includes(allergen))
        fail(menu, `allergenDish: distractor "${opt}" ALSO contains ${allergen} — two right answers`);
    }
  }
}

// ---------------------------------------------------------------- suites

function suiteDecks(menu, pool, runs = 40) {
  const facetSeen = new Set();
  let produced = 0;
  for (let r = 0; r < runs; r++) {
    const deck = buildWeightedDeck(pool, 10, availableFacets(pool));
    produced += deck.length;
    for (const q of deck) { facetSeen.add(q.facet); checkQuestion(menu, pool, q); }
  }
  // A 3-dish menu honestly cannot sustain 10 distinct questions; expect the deck to be
  // as full as the menu allows, not a fixed number.
  const ceiling = Math.min(10, pool.length);
  const avg = produced / runs;
  console.log(`  ${menu}: avg deck ${avg.toFixed(1)}/${ceiling} · facets used: ${[...facetSeen].join(", ") || "none"}`);
  if (avg < ceiling * 0.6) fail(menu, `decks too thin (${avg.toFixed(1)}/${ceiling}) — gates may be over-rejecting`);
}

console.log("\n=== deck quality across menus ===");
suiteDecks("SUSHI", sushi);
suiteDecks("GREEK", greek);
suiteDecks("TINY-3", greek.slice(0, 3));
suiteDecks("SEMANTIC-CATS", semanticCats);
suiteDecks("PRICES-IN-NAMES", pricesInNames);

console.log("\n=== targeted regressions ===");

// #3 general knowledge: serving-style must refuse course-name categories
for (const it of semanticCats)
  if (qServingStyle(semanticCats, it))
    fail("SEMANTIC-CATS", `qServingStyle fired on course-name categories — "${it.name}" → fish/meat/vegetable is general knowledge`);
// …but must still work where the label carries real structure
{
  const fired = sushi.some((it) => qServingStyle(sushi, it));
  if (!fired) fail("SUSHI", "qServingStyle never fires on structural categories — the useful case is gone");
}

// price must refuse dishes whose name contains the price
for (const it of pricesInNames)
  if (qPrice(pricesInNames, it))
    fail("PRICES-IN-NAMES", `qPrice fired on "${it.name}" — the answer is printed in the name`);
// …but must work when the price isn't in the name
{
  const fired = greek.some((it) => qPrice(greek, it));
  if (!fired) fail("GREEK", "qPrice never fires — price facet is dead on a priced menu");
}

// facet availability must reflect the menu, never a fixed list
{
  const g = availableFacets(greek), s = availableFacets(sushi), sem = availableFacets(semanticCats);
  if (g.includes("serving")) fail("GREEK", "serving offered on course-name menu");
  if (!s.includes("serving")) fail("SUSHI", "serving not offered on structural menu");
  if (!s.includes("changes")) fail("SUSHI", "changes not offered though menu has שינויים tails");
  if (g.includes("changes")) fail("GREEK", "changes offered though no dish has a שינויים tail");
  if (!sem.includes("price")) fail("SEMANTIC-CATS", "price not offered though prices are real and absent from names");
  if (sem.includes("serving")) fail("SEMANTIC-CATS", "serving offered on course-name categories");
  console.log(`  facets — greek: [${g}] · sushi: [${s}]`);
}

// owner ranking must actually steer the deck
{
  const deck = buildWeightedDeck(sushi, 12, ["allergens"]);
  const off = deck.filter((q) => q.facet !== "allergens");
  if (off.length) fail("SUSHI", `ranking ignored: ${off.length}/${deck.length} questions outside the chosen facet`);
  if (deck.length < 4) fail("SUSHI", `single-facet deck too thin (${deck.length})`);
}

// validateQuestion must reject the patterns it exists for
{
  const bad = [
    { name: "duplicate options", q: { itemId: "s0", subject: "א", options: ["x", "x", "y"], correct: "x" } },
    { name: "correct missing", q: { itemId: "s0", subject: "א", options: ["x", "y", "z"], correct: "w" } },
    { name: "single overlap", q: { itemId: "s0", subject: "רול סלמון", options: ["יש סלמון כאן", "טונה אדומה", "בס ים"], correct: "יש סלמון כאן" } },
    { name: "length outlier", q: { itemId: "s0", subject: "א", options: ["קצר מאוד כאן", "גם קצר בערך", "x".repeat(90)], correct: "x".repeat(90) } },
  ];
  for (const { name, q } of bad)
    if (validateQuestion(q)) fail("GATE", `validateQuestion accepted a "${name}" question`);
}

// masking basics
if (maskNameLeak("סלמון ואבוקדו בציפוי שומשום", "סלמון אבוקדו") !== "▢▢▢ ▢▢▢ בציפוי שומשום")
  fail("MASK", "prefix-aware masking regressed");
if (splitChanges("בסיס. שינויים: אין").changes !== "אין") fail("MASK", "splitChanges regressed");

// spelling variants — the real leak found in the live baseline exam
if (hebKey("לימון") !== hebKey("למון")) fail("MASK", "hebKey should fold לימון/למון");
if (hebKey("חלב") === hebKey("חלבה")) fail("MASK", "hebKey must NOT fold חלב/חלבה");
if (!maskNameLeak("ומניפת לימון מעל", "למון טוויסט").includes("▢"))
  fail("MASK", 'description "מניפת לימון" must be masked against the dish "למון טוויסט"');
if (maskNameLeak("רוטב טחינה", "חלב").includes("▢")) fail("MASK", "unrelated words must survive masking");

console.log(failures ? `\n❌ ${failures} failures\n` : "\n✅ all quality gates passed\n");
process.exit(failures ? 1 : 0);
