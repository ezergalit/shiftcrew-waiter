// Service scenarios — the exam questions a waiter actually faces at a table.
//
// The category exam asks "what is in this dish?". That is knowledge of the menu. This
// module asks the harder question: given a guest in front of you, WHICH dish do you say
// out loud? A pregnant guest asking for a starter, an allergy, "recommend me three rolls
// with salmon" — the answer is always a dish NAME, in full, the way you'd say it at the
// table (user request, 2026-08-20).
//
// Every builder is deterministic (no AI at runtime — see CLAUDE.md) and every one of them
// returns null rather than guessing when the menu can't support a question with exactly
// one right answer. That rule is the whole safety model here: see QUESTION-QUALITY.md,
// line 16 — a question with a second correct answer teaches the waiter that the app is
// wrong, and on a pregnancy or allergy question it teaches something worse.

import { maskNameLeak } from "./questionEngine.js";  // explicit extension: the tests import this module in plain node

export const norm = (s) => (s || "").toString().trim().toLowerCase();

// Token match, not substring: "אגוזי מלך" must not make "אגוז" match "אגוזי לוז" by
// accident, and a substring test would also match inside unrelated words.
const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const hasIngredient = (dish, ing) => {
  const target = norm(ing);
  return (dish.ingredients || []).some((x) => norm(x) === target);
};

// For "which dishes contain X" we must also be sure the NEGATIVE options really are
// negative. A dish whose name or description mentions the thing is not safe to use as a
// "does not contain" option even when its ingredient list omits it — the list may simply
// be incomplete, and the waiter would be marked wrong for being right.
export const mentions = (dish, ing) => {
  const target = norm(ing);
  if (hasIngredient(dish, ing)) return true;
  const hay = [dish.name, dish.displayName, dish.desc, ...(dish.ingredients || [])].join(" ");
  return words(hay).some((w) => w === target || w.startsWith(target));
};

const shuffleWith = (arr, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const label = (d) => d.displayName || d.name;

// ── 1. Pregnancy ──────────────────────────────────────────────────────────────────────
// "A pregnant guest wants a starter — what do you recommend?" One dish with no pregnancy
// flag at all, three that carry one. Built per category so the recommendation is actually
// answering what she asked for.
export function qPregnancy(cards, rnd = Math.random) {
  const byCat = groupBy(cards, (c) => c.category);
  const cats = shuffleWith(Object.keys(byCat), rnd);
  for (const cat of cats) {
    const items = byCat[cat];
    const safe = items.filter((c) => !(c.pregnancy || []).length);
    const risky = items.filter((c) => (c.pregnancy || []).length);
    if (!safe.length || risky.length < 3) continue;
    const correct = pick(safe, rnd);
    const distractors = shuffleWith(risky, rnd).slice(0, 3);
    return {
      kind: "pregnancy",
      subjectId: correct.id,
      prompt: `אורחת בהריון מבקשת המלצה מתוך ${cat}. איזו מנה מתאימה לה?`,
      hint: "מנה שאין בה סיכון להריון — דג נא, בשר נא, ביצה חיה וכדומה.",
      options: shuffleWith([correct, ...distractors], rnd).map((d) => ({
        id: d.id, label: label(d), correct: d.id === correct.id,
        why: (d.pregnancy || []).length ? `מכילה ${(d.pregnancy || []).join(", ")}` : "אין בה סיכון להריון",
      })),
    };
  }
  return null;
}

// ── 2. Allergy ────────────────────────────────────────────────────────────────────────
// Same shape, but the constraint is one specific allergen the guest named.
export function qAllergy(cards, rnd = Math.random) {
  const allergens = shuffleWith([...new Set(cards.flatMap((c) => c.allergens || []))], rnd);
  for (const allergen of allergens) {
    const byCat = groupBy(cards, (c) => c.category);
    for (const cat of shuffleWith(Object.keys(byCat), rnd)) {
      const items = byCat[cat];
      const withIt = items.filter((c) => (c.allergens || []).includes(allergen));
      // A dish is only "safe to serve" here if it declares allergens at all — an empty
      // list can equally mean "nobody filled this in", and that is not a safe answer to
      // put in a waiter's mouth.
      const without = items.filter((c) => (c.allergens || []).length && !(c.allergens || []).includes(allergen));
      if (withIt.length < 3 || !without.length) continue;
      const correct = pick(without, rnd);
      return {
        kind: "allergy",
        subjectId: correct.id,
        prompt: `אורח מדווח על אלרגיה ל${allergen}. איזו מנה מ${cat} אפשר להגיש לו?`,
        hint: "המנה היחידה כאן שאין בה את האלרגן הזה.",
        options: shuffleWith([correct, ...shuffleWith(withIt, rnd).slice(0, 3)], rnd).map((d) => ({
          id: d.id, label: label(d), correct: d.id === correct.id,
          why: (d.allergens || []).includes(allergen) ? `מכילה ${allergen}` : `אין בה ${allergen}`,
        })),
      };
    }
  }
  return null;
}

// ── 3. "Recommend three dishes with salmon" ───────────────────────────────────────────
// The user's own example. Multi-select, and the answer is the full names — which is the
// point: at the table you have to say them, not recognise them.
export const MULTI_TARGET = 3;
export function qWithIngredient(cards, rnd = Math.random) {
  const counts = new Map();
  for (const c of cards) for (const ing of c.ingredients || []) {
    const k = norm(ing);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  // Exactly MULTI_TARGET dishes carrying it inside one category: fewer and there is no
  // question, more and "choose three" has several equally correct answers.
  const byCat = groupBy(cards, (c) => c.category);
  const cats = shuffleWith(Object.keys(byCat), rnd);
  for (const cat of cats) {
    const items = byCat[cat];
    if (items.length < MULTI_TARGET + 3) continue;
    const ings = shuffleWith([...new Set(items.flatMap((c) => c.ingredients || []))], rnd);
    for (const ing of ings) {
      const withIt = items.filter((c) => hasIngredient(c, ing));
      if (withIt.length !== MULTI_TARGET) continue;
      const clean = items.filter((c) => !mentions(c, ing));
      if (clean.length < 3) continue;
      const options = shuffleWith([...withIt, ...shuffleWith(clean, rnd).slice(0, 3)], rnd);
      return {
        kind: "multi",
        subjectId: withIt[0].id,
        multi: true,
        prompt: `אורח מבקש שתמליצו לו על ${MULTI_TARGET} מנות מ${cat} עם ${ing}. אילו מנות תציעו?`,
        hint: `בחרו בדיוק ${MULTI_TARGET}.`,
        options: options.map((d) => ({
          id: d.id, label: label(d), correct: withIt.some((w) => w.id === d.id),
          why: hasIngredient(d, ing) ? `מכילה ${ing}` : `אין בה ${ing}`,
        })),
      };
    }
  }
  return null;
}

// ── 4. Pitfalls ───────────────────────────────────────────────────────────────────────
// Preferences, not safety: coriander, spicy, garlic. Phrased positively on purpose —
// "which dish contains X", never "which dish is not without X" (QUESTION-QUALITY line 17).
export function qPitfall(cards, rnd = Math.random) {
  const pitfalls = shuffleWith([...new Set(cards.flatMap((c) => c.pitfalls || []))], rnd);
  for (const p of pitfalls) {
    const withIt = cards.filter((c) => (c.pitfalls || []).includes(p));
    const without = cards.filter((c) => (c.pitfalls || []).length && !(c.pitfalls || []).includes(p));
    // One carrier only — otherwise several options are equally correct.
    if (withIt.length !== 1 || without.length < 3) continue;
    const correct = withIt[0];
    return {
      kind: "pitfall",
      subjectId: correct.id,
      prompt: `אורח שואל אילו מהמנות האלה מכילות ${p}. איזו מהן?`,
      hint: "אחת בלבד מכילה את זה.",
      options: shuffleWith([correct, ...shuffleWith(without, rnd).slice(0, 3)], rnd).map((d) => ({
        id: d.id, label: label(d), correct: d.id === correct.id,
        why: (d.pitfalls || []).includes(p) ? `מכילה ${p}` : `אין בה ${p}`,
      })),
    };
  }
  return null;
}

// ── 5. Compose the dish ───────────────────────────────────────────────────────────────
// The category-exam question, kept in the mix: the guest asks what is in it, and the
// answer has to be the exact set. Decoys come from the same category — the near-misses
// that actually separate two similar dishes.
export function qCompose(cards, rnd = Math.random) {
  const pool = cards.filter((c) => (c.ingredients || []).length >= 2);
  if (pool.length < 3) return null;
  const it = pick(pool, rnd);
  const siblings = pool.filter((c) => c.id !== it.id && c.category === it.category);
  const from = siblings.length >= 3 ? siblings : pool.filter((c) => c.id !== it.id);
  const real = it.ingredients || [];
  const near = [...new Set(from.flatMap((c) => c.ingredients || []))].filter((x) => !hasIngredient(it, x));
  if (near.length < 2) return null;
  return {
    kind: "compose",
    subjectId: it.id,
    multi: true,
    exactSet: true,
    prompt: `אורח שואל מה יש ב${label(it)}. מה תגידו לו?`,
    hint: "בחרו את כל המרכיבים שבמנה — ורק אותם.",
    options: shuffleWith([
      ...real.map((x) => ({ id: `r:${x}`, label: x, correct: true })),
      ...shuffleWith(near, rnd).slice(0, Math.min(5, Math.max(3, real.length))).map((x) => ({ id: `d:${x}`, label: x, correct: false })),
    ], rnd),
  };
}


// ── 6. Which menu is it on? ───────────────────────────────────────────────────────────
// A guest asks for something and the waiter has to know which menu it lives on. Only
// built for a restaurant whose menu is actually split into several (bar, sushi, food…).
export function qMenuGroup(cards, rnd = Math.random) {
  const groups = [...new Set(cards.map((c) => c.menuGroup).filter(Boolean))];
  if (groups.length < 3) return null;
  const pool = cards.filter((c) => c.menuGroup);
  if (!pool.length) return null;
  const it = pick(pool, rnd);
  const others = shuffleWith(groups.filter((g) => g !== it.menuGroup), rnd).slice(0, 3);
  if (others.length < 2) return null;
  return {
    kind: "menugroup",
    subjectId: it.id,
    prompt: `אורח מבקש את ${label(it)}. באיזה תפריט זה נמצא?`,
    options: shuffleWith([it.menuGroup, ...others], rnd).map((g) => ({
      id: `g:${g}`, label: g, correct: g === it.menuGroup,
    })),
  };
}

// ── 7. Price ──────────────────────────────────────────────────────────────────────────
// The one question a guest asks that has exactly one right answer and no room to
// improvise. Distractors are real prices from the same category — a waiter who knows the
// range but not this dish still has to actually know this dish.
export function qPrice(cards, rnd = Math.random) {
  const priced = cards.filter((c) => Number(c.price) > 0);
  if (priced.length < 4) return null;
  const it = pick(priced, rnd);
  const real = Number(it.price);
  const sameCat = priced.filter((c) => c.category === it.category && Number(c.price) !== real);
  const from = sameCat.length >= 3 ? sameCat : priced.filter((c) => Number(c.price) !== real);
  // Distinct prices only — two options showing the same number is two correct answers.
  const decoys = [...new Set(shuffleWith(from, rnd).map((c) => Number(c.price)))].slice(0, 3);
  if (decoys.length < 3) return null;
  return {
    kind: "price",
    subjectId: it.id,
    prompt: `אורח שואל כמה עולה ${label(it)}. מה תגידו לו?`,
    options: shuffleWith([real, ...decoys], rnd).map((p) => ({
      id: `p:${p}`, label: `${p} ₪`, correct: p === real,
    })),
  };
}

// ── 8. Guest describes a dish ─────────────────────────────────────────────────────────
// The guest doesn't remember the name, only what's in it — the everyday version of
// "table 6 wants the one with the truffle". The description is masked so the dish name
// can't leak out of its own description (see maskNameLeak in questionEngine).
export function qFromDescription(cards, rnd = Math.random) {
  const pool = cards.filter((c) => (c.desc || "").split(/\s+/).length >= 5);
  if (pool.length < 4) return null;
  const it = pick(pool, rnd);
  const masked = maskNameLeak(it.desc, it.name);
  if (masked.split(/\s+/).filter(Boolean).length < 4) return null;
  const siblings = pool.filter((c) => c.id !== it.id && c.category === it.category);
  const from = siblings.length >= 3 ? siblings : pool.filter((c) => c.id !== it.id);
  const decoys = shuffleWith(from, rnd).slice(0, 3);
  if (decoys.length < 3) return null;
  return {
    kind: "describe",
    subjectId: it.id,
    prompt: `אורח מתאר: "${masked}" — על איזו מנה הוא מדבר?`,
    options: shuffleWith([it, ...decoys], rnd).map((d) => ({
      id: d.id, label: label(d), correct: d.id === it.id,
    })),
  };
}

// ── 9. Allergens of one dish ──────────────────────────────────────────────────────────
// Closed list, exact set — the same contract as the category exam's allergen chips, but
// asked the way a guest asks it. Only for dishes whose allergens were actually filled in:
// an empty list can mean "none" or "nobody wrote it down", and we must not test the
// difference between those.
export function qAllergenSet(cards, rnd = Math.random) {
  const declared = cards.filter((c) => (c.allergens || []).length);
  if (declared.length < 3) return null;
  const it = pick(declared, rnd);
  const real = it.allergens || [];
  const others = [...new Set(declared.flatMap((c) => c.allergens || []))].filter((a) => !real.includes(a));
  if (!others.length) return null;
  return {
    kind: "allergenset",
    subjectId: it.id,
    multi: true,
    exactSet: true,
    prompt: `אורח שואל אילו אלרגנים יש ב${label(it)}. מה תגידו לו?`,
    hint: "בחרו את כל האלרגנים שבמנה — ורק אותם.",
    options: shuffleWith([
      ...real.map((a) => ({ id: `a:${a}`, label: a, correct: true })),
      ...shuffleWith(others, rnd).slice(0, 3).map((a) => ({ id: `a:${a}`, label: a, correct: false })),
    ], rnd),
  };
}

// ── 10. What comes out first ──────────────────────────────────────────────────────────
// ⚠️ Built ONLY from the owner's own category order (exam_config.category_order). We do
// not guess a course from a category name: "ראשונות" reads like a starter to us, but the
// restaurant that wrote the menu is the only authority on what leaves the pass first, and
// a wrong answer here teaches the waiter something false about their own service.
export function qServingOrder(cards, rnd = Math.random, categoryOrder = []) {
  const rank = new Map(categoryOrder.map((c, i) => [c, i]));
  const usable = cards.filter((c) => rank.has(c.category));
  const cats = [...new Set(usable.map((c) => c.category))];
  if (cats.length < 3) return null;
  const chosen = shuffleWith(cats, rnd).slice(0, 3).sort((a, b) => rank.get(a) - rank.get(b));
  const dishes = chosen.map((c) => pick(usable.filter((x) => x.category === c), rnd));
  const first = dishes[0];
  return {
    kind: "order",
    subjectId: first.id,
    prompt: `שולחן הזמין: ${dishes.map((d) => label(d)).join(" · ")}. מה יוצא ראשון?`,
    hint: "לפי סדר ההגשה שהמסעדה קבעה.",
    options: shuffleWith(dishes, rnd).map((d) => ({
      id: d.id, label: label(d), correct: d.id === first.id,
      why: d.category,
    })),
  };
}

// Rotation order decides the exam's texture: compose → guest scenario → recall → back.
// qServingOrder takes the owner's category order as a third argument; the rest ignore it.
const BUILDERS = [
  qCompose, qPregnancy, qFromDescription, qAllergy, qPrice, qWithIngredient,
  qCompose, qAllergenSet, qMenuGroup, qPitfall, qServingOrder, qFromDescription,
];

// Rotate through the builders so the deck mixes types, and skip any that this particular
// menu can't support — a bar with no pregnancy data simply gets more of the others.
// Duplicate prompts are dropped: the same "which starter suits a pregnant guest" twice in
// one exam reads as a bug even when the options differ.
export function buildMenuExamDeck(cards, size = 40, rnd = Math.random, categoryOrder = []) {
  const list = (cards || []).filter((c) => c.id && (c.name || c.displayName));
  const deck = [];
  const seen = new Set();
  let guard = 0;
  while (deck.length < size && guard < size * 12) {
    const build = BUILDERS[guard % BUILDERS.length];
    guard++;
    const q = build(list, rnd, categoryOrder);
    if (!q) continue;
    const key = `${q.kind}|${q.prompt}`;
    if (seen.has(key)) continue;
    // Last line of defence: never ship a single-answer question with two correct options,
    // whatever the builder believed.
    const correct = q.options.filter((o) => o.correct).length;
    if (!q.multi && correct !== 1) continue;
    if (q.multi && correct === 0) continue;
    seen.add(key);
    deck.push(q);
  }
  return deck;
}

function groupBy(arr, fn) {
  const out = {};
  for (const x of arr) {
    const k = fn(x) || "—";
    (out[k] = out[k] || []).push(x);
  }
  return out;
}
function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }
