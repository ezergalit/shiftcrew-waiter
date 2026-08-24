// The critic for the service question bank.
//
// This is not a unit test of the builders — it is an adversarial reader. Each gate below
// is one way a question can look fine and still be broken, taken from QUESTION-QUALITY.md
// and extended for the failure modes that are specific to service questions.
//
//   node tests/service.test.mjs
//
// A CRITICAL failure fails the build. A WARN is a content debt that must reach zero before
// the bank ships, but does not block work in progress.

import { BANK, ACTIONS, MODULES, renderQuestion, buildServiceDeck, modulesForRole, shapeOf, homeModule, CONFLICTS } from "../src/lib/serviceBank.js";
import { HOUSE_KEYS, houseQuestion, defaultStandard } from "../src/lib/serviceStandard.js";
import { buildServiceExam, gradeExam, examSeconds, secondsFor, SECTION_PLAN, DEFAULT_PASS } from "../src/lib/serviceExam.js";

const fails = [];
const warns = [];
const bad = (gate, msg) => fails.push(`${gate}: ${msg}`);
const warn = (gate, msg) => warns.push(`${gate}: ${msg}`);

// Deterministic shuffle so a run is reproducible — a critic that reports different
// problems each time cannot be used to tell whether a fix worked.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const words = (s) => (s || "").toString().toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
const jaccard = (a, b) => {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return a === b ? 1 : 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
};

// ── Gate: every action key referenced by the bank exists ─────────────────────────────
// A missing key renders as an option with no text — a question the waiter cannot answer.
const keysOf = (e) => [e.a, ...(e.d || []), ...(e.sequence || []), ...(e.multiAnswers || []), ...(e.multiDistractors || [])].filter(Boolean);
for (const [i, e] of BANK.entries()) {
  if (!MODULES[e.module]) { bad("MODULE", `#${i} references unknown module ${e.module}`); continue; }
  for (const k of keysOf(e)) if (!ACTIONS[k]) bad("ACTION-KEY", `#${i} (${e.module}) references missing action "${k}"`);
}

// ── Gate: everything renders ─────────────────────────────────────────────────────────
const rendered = BANK.map((e, i) => ({ e, i, q: renderQuestion(e, rnd, i) }));
for (const { e, i, q } of rendered) if (!q) bad("RENDER", `#${i} (${e.module}) "${e.prompt.slice(0, 40)}…" failed to render`);

const live = rendered.filter((r) => r.q);

// ── Gate: exactly one correct answer on a single-choice question ─────────────────────
// The oldest rule in QUESTION-QUALITY.md. Two right answers teach the waiter that the app
// is wrong; on a safety question they teach something worse.
for (const { q, i } of live) {
  if (q.kind === "order") continue;
  const n = (q.options || []).filter((o) => o.correct).length;
  if (!q.multi && n !== 1) bad("SINGLE-ANSWER", `#${i} has ${n} correct options`);
  if (q.multi && n < 2) bad("MULTI-ANSWER", `#${i} is multi-select with ${n} correct options`);
}

// ── Gate: ELIMINABLE — every distractor must be a real professional action ───────────
// ⭐ The gate that matters most here, and the reason this bank is built from an action
// pool instead of free text.
//
// A service question is far easier to answer without training than a menu question,
// because the wrong options are usually obviously wrong ("argue with the guest"). The
// automatable proxy for "this distractor is plausible" is: THIS ACTION IS THE RIGHT ANSWER
// SOMEWHERE ELSE IN THE BANK. If an action is never correct anywhere, it is either a straw
// man or a gap in coverage — both worth fixing, and indistinguishable from the outside.
const correctSomewhere = new Set();
for (const e of BANK) {
  if (e.a) correctSomewhere.add(e.a);
  for (const k of e.multiAnswers || []) correctSomewhere.add(k);
  for (const k of e.sequence || []) correctSomewhere.add(k);
}
for (const [i, e] of BANK.entries()) {
  for (const k of [...(e.d || []), ...(e.multiDistractors || [])]) {
    if (!correctSomewhere.has(k))
      bad("ELIMINABLE", `#${i} (${e.module}) uses "${k}" as a distractor, but it is never the right answer anywhere — a waiter can rule it out without knowing anything`);
  }
}

// Same idea from the other end: an action defined but never used is dead weight in the
// pool, and dead weight is where straw men hide.
{
  const used = new Set();
  for (const e of BANK) for (const k of keysOf(e)) used.add(k);
  for (const k of Object.keys(ACTIONS)) {
    if (!used.has(k)) warn("UNUSED-ACTION", `"${k}" is defined but never used`);
    else if (!correctSomewhere.has(k)) warn("NEVER-CORRECT", `"${k}" is only ever a distractor`);
  }
}

// ── Gate: SEMANTIC PAIRS — two options that mean the same thing ──────────────────────
// ⭐ The gate that came out of a bug the other gates could not see. Everything above
// measures how similar options LOOK; this one is the hand-declared list of options a waiter
// would read as the same answer. Found live: an allergy question offering both "bring a new
// dish instead of the one that came out" and "bring a new dish rather than remove an
// ingredient" — two right answers on the one field where that is least acceptable.
//
// ⚠️ Two refinements, both found by the gate being wrong before it was right:
//   • A pair only misleads when ONE of them is the answer. Two conflicting DISTRACTORS are
//     harmless — they are both wrong, and nobody is torn between them.
//   • A pair of consecutive steps is legitimately separated by a "what comes first" prompt,
//     which is the entire point of the "first" kind.
for (const [i, e] of BANK.entries()) {
  const right = new Set([e.a, ...(e.multiAnswers || [])].filter(Boolean));
  const offered = new Set([...right, ...(e.d || []), ...(e.multiDistractors || [])]);
  for (const [x, y, note] of CONFLICTS) {
    if (!offered.has(x) || !offered.has(y)) continue;
    if (right.has(x) === right.has(y)) continue;              // both right, or both wrong
    if (note === "sequence" && (e.kind === "first" || e.kind === "order")) continue;
    bad("SEMANTIC-PAIR", `#${i} (${e.module}) offers "${x}" and "${y}", one as the answer — a waiter reads those as the same answer`);
  }
}

// ── Gate: no duplicate or near-duplicate options ─────────────────────────────────────
for (const { q, i } of live) {
  const opts = q.options || [];
  for (let a = 0; a < opts.length; a++)
    for (let b = a + 1; b < opts.length; b++) {
      if (opts[a].label === opts[b].label) bad("DUPLICATE-OPTION", `#${i} shows "${opts[a].label}" twice`);
      else if (jaccard(opts[a].label, opts[b].label) >= 0.85) bad("NEAR-DUPLICATE", `#${i}: "${opts[a].label}" ≈ "${opts[b].label}"`);
    }
}

// ── Gate: the correct answer is not the longest ──────────────────────────────────────
// Rule 5 in QUESTION-QUALITY.md. Test-takers know the long, hedged option is usually right;
// a bank that keeps that habit is graded on exam technique.
for (const { q, i } of live) {
  if (q.kind === "order" || q.multi) continue;
  const c = q.options.find((o) => o.correct).label.length;
  const others = q.options.filter((o) => !o.correct).map((o) => o.label.length).sort((x, y) => x - y);
  const med = others[Math.floor(others.length / 2)];
  if (c > med * 2 || c * 2 < med) bad("LENGTH-OUTLIER", `#${i}: correct is ${c} chars, distractor median ${med}`);
}

// ── Gate: WORD-OVERLAP — the prompt must not name its own answer ─────────────────────
// Rule 4 in QUESTION-QUALITY.md, and it bit twice while writing this bank: an option that
// read "לשייק משקה עם הדר, ביצה או שמנת" against a prompt about "ויסקי סאוור עם חלבון ביצה"
// is answerable by matching one word. If EXACTLY ONE option shares a content word with the
// prompt and it happens to be the right one, the question is a word-matching exercise.
//
// ⚠️ The gate CALIBRATES ITSELF from the bank instead of carrying a hand-written stop list.
// "אורח", "מנה" and "שולחן" appear in most prompts and most options — sharing one of them
// carries no information, and a fixed list of such words goes stale the moment the bank
// grows. A word that shows up in more than a tenth of the prompts is treated as background.
const PREFIX = /^[ובלהמשכ]/;
const stem = (w) => (w.length > 3 && PREFIX.test(w) ? w.slice(1) : w);
const rawContent = (s) => new Set(words(s).map(stem).filter((w) => w.length > 2));
const df = new Map();
for (const { q } of live) for (const w of rawContent(q.prompt)) df.set(w, (df.get(w) || 0) + 1);
const COMMON = Math.max(3, Math.ceil(live.length * 0.1));
const content = (s) => new Set([...rawContent(s)].filter((w) => (df.get(w) || 0) < COMMON));
for (const { q, i } of live) {
  if (q.kind === "order") continue;
  const p = content(q.prompt);
  const sharing = q.options.filter((o) => [...content(o.label)].some((w) => p.has(w)));
  if (sharing.length === 1 && sharing[0].correct)
    bad("WORD-OVERLAP", `#${i}: only the correct option shares a word with the prompt — "${sharing[0].label}"`);
}

// ── Gate: a distractor must belong to a module this role studies ─────────────────────
// ELIMINABLE proves an action is real. It does not prove it is real TO THIS PERSON: a
// bartender offered "לקפל מחדש מפית" eliminates it without knowing anything about bars.
for (const [i, e] of BANK.entries()) {
  const roles = ["floor", "bar"].filter((r) => modulesForRole(r).includes(e.module));
  for (const k of [...(e.d || []), ...(e.multiDistractors || [])]) {
    const home = homeModule(k);
    if (!home) continue; // already reported by ELIMINABLE
    for (const r of roles)
      if (!modulesForRole(r).includes(home))
        bad("ROLE-DISTRACTOR", `#${i} (${e.module}) offers "${k}" from ${home}, which a "${r}" never studies`);
  }
}

// ── Gate: an explanation is not reused ───────────────────────────────────────────────
// Two questions sharing a "why" means one of them was written by copying the other, and
// copied questions are where near-duplicates come from.
{
  const seen = new Map();
  for (const { q, i } of live) {
    if (seen.has(q.why)) bad("DUPLICATE-WHY", `#${i} reuses the explanation of #${seen.get(q.why)}`);
    seen.set(q.why, i);
  }
}

// ── Gate: at most one negation in a prompt ───────────────────────────────────────────
// Rule 17. Two negations test reading comprehension, not training.
for (const { q, i } of live) {
  const n = (q.prompt.match(/\b(לא|ללא|בלי|אסור|אינו|אינך)\b/g) || []).length;
  if (n >= 2) bad("DOUBLE-NEGATIVE", `#${i} has ${n} negations: "${q.prompt}"`);
}

// ── Gate: every question teaches ─────────────────────────────────────────────────────
// A wrong answer with no explanation trains the waiter to memorise a position, not a rule.
for (const { q, i } of live) {
  if (!q.why || q.why.length < 25) bad("NO-WHY", `#${i} has no usable explanation`);
}

// ── Gate: no prompt appears twice ────────────────────────────────────────────────────
const seenPrompt = new Map();
for (const { q, i } of live) {
  const key = q.prompt.trim();
  if (seenPrompt.has(key)) bad("DUPLICATE-PROMPT", `#${i} repeats #${seenPrompt.get(key)}`);
  seenPrompt.set(key, i);
}
// And near-duplicates, which read as a bug even when the options differ.
for (let a = 0; a < live.length; a++)
  for (let b = a + 1; b < live.length; b++)
    if (live[a].q.module === live[b].q.module && jaccard(live[a].q.prompt, live[b].q.prompt) >= 0.8)
      warn("SIMILAR-PROMPT", `#${live[a].i} ≈ #${live[b].i}`);

// ── Gate: coverage ───────────────────────────────────────────────────────────────────
// A module with two questions cannot carry an exam section: every sitting shows the same
// two, and the second attempt is memory.
const MIN_PER_MODULE = 4;
const MIN_CRITICAL = 6;
for (const [mod, meta] of Object.entries(MODULES)) {
  const n = BANK.filter((e) => e.module === mod).length;
  const need = meta.critical ? MIN_CRITICAL : MIN_PER_MODULE;
  if (n < need) bad("COVERAGE", `${mod} (${meta.title}) has ${n} questions, needs ${need}`);
}

// ── Gate: format mix ─────────────────────────────────────────────────────────────────
// The complaint that started this: the quizzes feel like one long grey list. A module that
// is 100% four-option multiple choice is that list.
for (const mod of Object.keys(MODULES)) {
  const kinds = new Set(BANK.filter((e) => e.module === mod).map((e) => e.kind));
  if (kinds.size < 2) warn("MONOTONE", `${mod} uses only one question format (${[...kinds]})`);
}

// ── Gate: the deck never puts two identical formats back to back ─────────────────────
// The rhythm rule, verified on real decks rather than asserted in a comment.
for (let t = 0; t < 40; t++) {
  const deck = buildServiceDeck({ role: "both", size: 20, standard: defaultStandard(), confirmed: Object.keys(HOUSE_KEYS), rnd });
  if (deck.length < 12) { bad("DECK-SIZE", `deck came back with ${deck.length} questions`); break; }
  for (let i = 1; i < deck.length; i++)
    if (shapeOf(deck[i].kind) === shapeOf(deck[i - 1].kind) && shapeOf(deck[i].kind) !== "single")
      warn("RHYTHM", `two "${shapeOf(deck[i].kind)}" questions in a row at ${i}`);
}

// ── Gate: an unconfirmed house rule never reaches the exam ───────────────────────────
// The safety property of serviceStandard.js. If this breaks, we certify a waiter against
// our guess about their restaurant.
for (let t = 0; t < 20; t++) {
  const deck = buildServiceDeck({ role: "both", size: 40, standard: defaultStandard(), confirmed: ["serve_side"], exam: true, rnd });
  const leaked = deck.filter((q) => q.kind === "house" && q.houseKey !== "serve_side");
  if (leaked.length) { bad("UNCONFIRMED-LEAK", `exam deck contains unconfirmed house rules: ${leaked.map((q) => q.houseKey).join(", ")}`); break; }
}

// ── Gate: role scoping ───────────────────────────────────────────────────────────────
// A waiter examined on double-straining learns that the app does not know what their job
// is. Same failure as asking about a category the waiter never opened (rule 9).
{
  const floor = buildServiceDeck({ role: "floor", size: 60, standard: defaultStandard(), confirmed: Object.keys(HOUSE_KEYS), rnd });
  if (floor.some((q) => q.module === "S7")) bad("ROLE-SCOPE", "a floor deck contains bar questions");
  const bar = buildServiceDeck({ role: "bar", size: 60, standard: defaultStandard(), confirmed: Object.keys(HOUSE_KEYS), rnd });
  if (bar.some((q) => MODULES[q.module]?.role === "floor")) bad("ROLE-SCOPE", "a bar deck contains floor-only questions");
  if (!modulesForRole("both").includes("S7")) bad("ROLE-SCOPE", '"both" must include the bar module');
}

// ── Gate: the correct answer does not sit in a favourite position ────────────────────
// If shuffling is biased, position becomes the answer.
{
  const pos = [0, 0, 0, 0];
  let n = 0;
  for (let t = 0; t < 300; t++)
    for (const e of BANK) {
      const q = renderQuestion(e, rnd, 0);
      if (!q || q.kind === "order" || q.multi) continue;
      pos[q.options.findIndex((o) => o.correct)]++; n++;
    }
  const expected = n / 4;
  pos.forEach((c, i) => {
    if (Math.abs(c - expected) / expected > 0.15) bad("POSITION-BIAS", `correct lands at position ${i} ${(c / n * 100).toFixed(1)}% of the time`);
  });
}

// ── Gate: the bank is much larger than one sitting ───────────────────────────────────
// Anti-memorisation. If a 20-question exam draws from a 25-question bank, the second
// attempt is recall of the app, not of the job.
{
  const EXAM = 20;
  for (const role of ["floor", "bar", "both"]) {
    const n = BANK.filter((e) => modulesForRole(role).includes(e.module)).length + Object.keys(HOUSE_KEYS).length;
    if (n < EXAM * 2.5) bad("BANK-DEPTH", `role "${role}" can draw on ${n} questions for a ${EXAM}-question exam (need ${Math.ceil(EXAM * 2.5)})`);
  }
}

// ── Gate: ordering questions are worth asking ────────────────────────────────────────
for (const { e, q, i } of live) {
  if (q.kind !== "order") continue;
  if (e.sequence.length < 4) bad("ORDER-TRIVIAL", `#${i} orders only ${e.sequence.length} steps`);
  if (new Set(e.sequence).size !== e.sequence.length) bad("ORDER-DUPLICATE", `#${i} repeats a step`);
}

// ── Gate: house questions are well formed ────────────────────────────────────────────
for (const key of Object.keys(HOUSE_KEYS)) {
  const spec = HOUSE_KEYS[key];
  if (!spec.options.some((o) => o.v === spec.def)) bad("HOUSE-DEFAULT", `${key}: default "${spec.def}" is not one of its options`);
  if (!MODULES[spec.module]) bad("HOUSE-MODULE", `${key} points at unknown module ${spec.module}`);
  const q = houseQuestion(key, defaultStandard(), rnd);
  if (!q) { bad("HOUSE-RENDER", `${key} failed to build`); continue; }
  if (q.options.filter((o) => o.correct).length !== 1) bad("HOUSE-ANSWER", `${key} does not have exactly one correct option`);
  if (q.options.length < 3) bad("HOUSE-OPTIONS", `${key} offers only ${q.options.length} options`);
}

// ── Gate: every planned section can actually be filled, for every role ───────────────
// A section that comes back short is a silent shrink of the exam: the waiter sits a
// 19-question exam believing it was 23, and the section percentages stop being comparable
// between people.
for (const role of ["floor", "bar", "both"]) {
  for (let t = 0; t < 30; t++) {
    const sections = buildServiceExam({ role, standard: defaultStandard(), confirmed: [], rnd });
    if (!sections.length) { bad("EXAM-EMPTY", `role "${role}" produced no sections`); break; }
    for (const s of sections) {
      const want = SECTION_PLAN.find((p) => p.module === s.module).count;
      if (s.questions.length < want) {
        bad("SECTION-SHORT", `role "${role}": section ${s.module} returned ${s.questions.length}/${want}`);
        break;
      }
    }
  }
}

// ── Gate: two sittings of the same exam are not the same exam ────────────────────────
// The anti-memorisation property, checked rather than assumed: if a retake repeats most of
// the first sitting, the second score measures recall of the app.
{
  const ids = (secs) => secs.flatMap((s) => s.questions.map((q) => q.houseKey || q.prompt));
  const a = new Set(ids(buildServiceExam({ role: "both", standard: defaultStandard(), confirmed: [], rnd })));
  const b = ids(buildServiceExam({ role: "both", standard: defaultStandard(), confirmed: [], rnd }));
  const overlap = b.filter((x) => a.has(x)).length / b.length;
  if (overlap > 0.7) bad("RETAKE-IDENTICAL", `a retake repeats ${(overlap * 100).toFixed(0)}% of the previous sitting`);
}

// ── Gate: the sitting is a sitting, not a shift ──────────────────────────────────────
// The complaint was that the exam is too long. If the budget creeps past ~15 minutes we are
// back to measuring stamina.
{
  const secs = examSeconds(buildServiceExam({ role: "both", standard: defaultStandard(), confirmed: Object.keys(HOUSE_KEYS), rnd }));
  if (secs > 15 * 60) bad("EXAM-TOO-LONG", `budget is ${Math.round(secs / 60)} minutes`);
  if (secs < 4 * 60) bad("EXAM-TOO-SHORT", `budget is only ${Math.round(secs / 60)} minutes`);
}

// ── Gate: the safety floor actually blocks ───────────────────────────────────────────
// ⭐ The property this whole exam exists for. Someone who aces everything except allergies
// must NOT be certified — and the only way to know the rule is wired up is to grade a
// synthetic sitting that has exactly that shape.
{
  const sections = buildServiceExam({ role: "floor", standard: defaultStandard(), confirmed: [], rnd });
  const s4 = sections.find((s) => s.module === "S4");
  if (!s4) bad("NO-SAFETY-SECTION", "the exam has no allergy section");
  else {
    // Perfect everywhere, one right out of five on safety.
    for (const s of sections) s.correct = s.questions.length;
    s4.correct = 1;
    const r = gradeExam(sections, DEFAULT_PASS);
    if (r.passed) bad("SAFETY-FLOOR", `scored ${r.score}% with ${Math.round((1 / s4.questions.length) * 100)}% on allergies and still passed`);
    if (!r.blockedBy.length) bad("SAFETY-FLOOR", "nothing reported as blocking the pass");
    // And the inverse: the floor must not block someone who actually cleared it.
    for (const s of sections) s.correct = s.questions.length;
    if (!gradeExam(sections, DEFAULT_PASS).passed) bad("SAFETY-FLOOR", "a perfect sitting did not pass");
  }
}

// ── Gate: every question has a clock, and no clock is punishing ──────────────────────
{
  const sections = buildServiceExam({ role: "both", standard: defaultStandard(), confirmed: Object.keys(HOUSE_KEYS), rnd });
  for (const s of sections)
    for (const q of s.questions) {
      const t = secondsFor(q);
      if (!t || t < 15) bad("CLOCK", `a ${q.kind} question gets ${t}s`);
      // Rough reading-speed sanity: Hebrew at ~3 words/second read twice over.
      const load = (q.prompt + " " + (q.options || []).map((o) => o.label).join(" ")).split(/\s+/).length;
      if (t < load / 3) bad("CLOCK-TIGHT", `${load} words to read in ${t}s`);
    }
}

// ── Report ───────────────────────────────────────────────────────────────────────────
const uniq = (a) => [...new Set(a)];
const F = uniq(fails), W = uniq(warns);
console.log(`\nבנק שירות: ${BANK.length} שאלות אוניברסליות + ${Object.keys(HOUSE_KEYS).length} סטנדרט בית`);
console.log(`מודולים: ${Object.keys(MODULES).length}  ·  פעולות: ${Object.keys(ACTIONS).length}\n`);
if (F.length) { console.log(`❌ ${F.length} כשלים קריטיים:`); F.forEach((f) => console.log("   " + f)); }
if (W.length) { console.log(`\n⚠️  ${W.length} אזהרות:`); W.forEach((w) => console.log("   " + w)); }
if (!F.length && !W.length) console.log("✅ כל השערים עברו");
else if (!F.length) console.log(`\n✅ אין כשלים קריטיים (${W.length} אזהרות)`);
console.log("");
process.exit(F.length ? 1 : 0);
