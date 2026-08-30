// Autocomplete for the open answers: the waiter types "sal" and gets "סלמון".
//
// ⚠️ THE POOL IS THE WHOLE RESTAURANT, NEVER THE CURRENT DISH.
// Suggesting from the dish's own ingredients would hand over the answer — the waiter would
// type one letter and read the solution off the screen, and the exam would measure typing.
// Drawn from every ingredient and allergen on the menu, the list is an input aid: it fixes
// spelling and saves keystrokes, and tells you nothing about whether this dish contains it.
import { norm, toks, wMatch } from "./examEngine.js";

// Consonant skeleton, so a waiter typing on an English keyboard finds a Hebrew ingredient.
//
// ⚠️ Two rules earn their keep, and without either one this silently fails:
//  1. א ה ו י ע are dropped. They are usually vowels — "אבוקדו" is a-vo-ca-do, and keeping
//     ו as "v" produced "bbkdb" against Latin "vcd", which matches nothing.
//  2. Confusable consonants fold together: b/v/w, k/c/q, p/f, g/j, s/z. Hebrew ב is both
//     b and v; "avocado" and "אבוקדו" only meet once they agree on that.
// Verified against the live menu: avo→אבוקדו, sal→סלמון, tuna→טונה, glut→גלוטן, shrim→שרימפס.
const H2L = { "ב":"b","ג":"g","ד":"d","ז":"s","ח":"h","ט":"t","כ":"k","ל":"l","מ":"m","נ":"n",
              "ס":"s","פ":"p","צ":"c","ק":"k","ר":"r","ש":"s","ת":"t",
              "ף":"p","ך":"k","ם":"m","ן":"n","ץ":"c" };
const FOLD = { v:"b", w:"b", c:"k", q:"k", f:"p", j:"g", z:"s" };
const fold = (t) => [...t].map((c) => FOLD[c] || c).join("");
const skel = (w) => /[א-ת]/.test(w)
  ? fold([...w].map((c) => H2L[c] || "").join(""))
  : fold(w.toLowerCase().replace(/[aeiouwy'h]/g, ""));

const isHeb = (t) => /[א-ת]/.test(t);
const sameScript = (a, b) => isHeb(a) === isHeb(b);

/** Every ingredient and allergen this restaurant uses, deduped, with a search key each. */
export function buildVocab(menu) {
  const seen = new Map();
  for (const d of menu || []) {
    for (const v of [...(d.ingredients || []), ...(d.allergens || [])]) {
      const label = String(v).trim();
      if (!label) continue;
      const key = norm(label);
      if (key && !seen.has(key)) seen.set(key, { label, key, skel: skel(key.replace(/ /g, "")) });
    }
  }
  return [...seen.values()];
}

/** Suggestions for what the waiter has typed so far. Ranked: prefix, then skeleton, then fuzzy. */
export function suggest(vocab, query, { limit = 6, exclude = [] } = {}) {
  const q = norm(String(query || "")).trim();
  if (q.length < 1) return [];
  const qs = skel(q.replace(/ /g, ""));
  const taken = new Set((exclude || []).map((x) => norm(x)));
  const out = [];
  for (const v of vocab) {
    if (taken.has(v.key)) continue;
    let rank = -1;
    if (v.key.startsWith(q)) rank = 0;                                   // "סל" → "סלמון"
    else if (v.key.split(" ").some((w) => w.startsWith(q))) rank = 1;    // second word
    // ⚠️ TWO consonants minimum, judged on the skeleton. "avo" folds to a single "b" and
    // then prefixes every b-word on the menu — בס, בצל, בצק — burying the one the waiter
    // meant. One more keystroke ("avoc" → "bk") resolves it, and showing nothing beats
    // showing six wrong words confidently.
    // ⚠️ Sub-rank inside the skeleton match. Skeletons drop vowels, so "avoc" ("bk") prefixes
    // both אבוקדו and בצל equally and the word the waiter meant sank to fourth. A Latin query
    // opening on a vowel almost always corresponds to a Hebrew word opening on א/ה/ע/י — that
    // one bit of the vowel we threw away is enough to order the list correctly.
    else if (qs.length >= 2 && v.skel.startsWith(qs)) {
      const qVowel = !isHeb(q) && /^[aeiou]/.test(q);
      rank = qVowel ? (/^[אהעי]/.test(v.label.trim()) ? 2 : 2.5) : 2;
    }
    // Typo tolerance, SAME SCRIPT ONLY. Cross-script similarity is what rank 2 is for, and
    // allowing it here made short words collide: "salm" folds close enough to "שום" that a
    // Levenshtein of 1 accepted it, so the list filled with unrelated ingredients.
    else if (q.length >= 3 && sameScript(v.key, q)
             && toks(v.label).some((w) => Math.abs(w.length - q.length) <= 2 && wMatch(w, q))) rank = 3;
    if (rank >= 0) out.push({ ...v, rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label, "he"));

  // ⚠️ Collapse spellings of the same thing. A menu that writes "עגבניות" on one dish and
  // "עגבנייה" on another produced two suggestions side by side, and the waiter has to
  // decide which of two identical answers is the right one (user, 30.8: "מה ההבדל בין
  // עגבניה לעגבניות"). `wMatch` already folds plurals and one-letter slips — the same
  // rule the grader uses, so anything shown as distinct here is genuinely distinct there.
  // Compared token-by-token, so "עגבניות שרי" and "חמאת עגבניות" stay separate.
  const sameThing = (a, b) => {
    const A = toks(a.label), B = toks(b.label);
    return A.length > 0 && A.length === B.length && A.every((w, i) => wMatch(w, B[i]));
  };
  const uniq = [];
  for (const v of out) {
    if (uniq.some((u) => sameThing(u, v))) continue;   // keep the better-ranked spelling
    uniq.push(v);
    if (uniq.length >= limit) break;
  }
  return uniq;
}
