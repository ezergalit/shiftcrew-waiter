// Adapter: the app's card shape → the exam engine's dish shape.
//
// The prototype was fed a `menu.json` built offline by `fetch-menu.mjs`. In the app the
// same rows arrive as `cards` (see pubToCard in MainApp), so the engine gets its menu from
// live data and a menu change reaches the exam with no rebuild step.
import { isKnowledgeCard } from "./examFixed.js";

// ⚠️ Knowledge cards ("הדרכת שירות", "מה חשוב לדעת על…") are teaching material, not dishes.
// Feeding them to the generator produces questions like "what is in 'kashrut and our
// kitchen'?" — the same exclusion MenuExam already applies.
export function menuFromCards(cards) {
  return (cards || [])
    .filter((c) => !isKnowledgeCard(c))
    .map((c) => ({
      name: c.name,
      category: c.category || "",
      // ⚠️ pubToCard names the field `desc`; only the offline fetch script used
      // `description`. Reading description-only left desc EMPTY for every real card —
      // which meant "words from the dish's own description are free" never actually
      // held in the app, and the cocktail flavor questions found no text to read.
      desc: c.desc || c.description || "",
      ingredients: c.ingredients || [],
      allergens: c.allergens || [],
      pitfalls: c.pitfalls || [],
      pregnancy: c.pregnancy || [],
      // Drink questions ask for a description, not contents — the generator words the
      // situation by kind ("שתתאר לו את הסאקה"), and builds recommendation questions.
      drink: c.drink || null,
    }));
}
