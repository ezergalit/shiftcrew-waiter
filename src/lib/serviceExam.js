// מבחן השירות — the certification sitting.
//
// ── What was wrong with the exam this replaces ────────────────────────────────────────
//
// MenuExam is 40 questions under ONE clock for the whole sitting. Three consequences, all
// of which the user named directly ("too hard and not centred enough"):
//
//   1. ONE CLOCK PUNISHES THE WRONG THING. A waiter who thinks carefully about question 3
//      has less time for question 30. The clock stops measuring service knowledge and
//      starts measuring pacing strategy.
//   2. 40 QUESTIONS OF ONE FLAVOUR IS NOT AN EXAM, IT IS AN ENDURANCE TEST. Past about
//      twenty, the score measures who is still reading.
//   3. A SINGLE PERCENTAGE HIDES THE ONLY THING THAT MATTERS. 72% can mean "solid
//      everywhere" or "excellent everywhere and blank on allergies". Those are not the same
//      person, and only one of them can work the floor.
//
// ── What this does instead ────────────────────────────────────────────────────────────
//
// SECTIONS, one per moment of the shift, so the result is a diagnosis and not a grade;
// a PER-QUESTION clock, so a hard question costs only itself; and a SAFETY FLOOR, because
// allergies are the one section where a good average is not good enough.

import { BANK, MODULES, renderQuestion, modulesForRole, shapeOf } from "./serviceBank.js";
import { HOUSE_KEYS, houseQuestion } from "./serviceStandard.js";

// ── Time ──────────────────────────────────────────────────────────────────────────────
// The clock exists to stop someone looking the answer up mid-question, NOT to make the exam
// hard. These are generous for reading Hebrew and answering, and far too short to search:
// a waiter who knows the answer uses about a third of them.
//
// ⚠️ Per QUESTION, never per exam. Time left does not roll over — carrying it forward is
// exactly what turns the exam into a pacing contest.
export const SECONDS = { single: 25, multi: 40, order: 60 };
export const secondsFor = (q) => SECONDS[shapeOf(q.kind)] || SECONDS.single;

// Running out of time is scored as a wrong answer, not as a skip. A waiter who cannot
// answer inside 25 seconds cannot answer at a table either.
export const TIMEOUT_IS_WRONG = true;

// ── The plan ─────────────────────────────────────────────────────────────────────────
// Twenty-three questions across six sections. Each section is a moment in the shift, which
// is what makes the result readable: "strong on the floor, shaky on allergies" is something
// an owner can act on before the shift, and "72%" is not.
//
// `floor` is a per-section minimum that must be cleared IN ADDITION to the overall pass
// mark. Only the safety section carries one — see PASS below.
export const SECTION_PLAN = [
  { module: "S4", count: 5, floor: 80 },
  { module: "S1", count: 3 },
  { module: "S2", count: 4 },
  { module: "S3", count: 4 },
  { module: "S5", count: 4 },
  { module: "S6", count: 3 },
  { module: "S7", count: 5 },
];

export const DEFAULT_PASS = 75;

// ⚠️ THE SAFETY FLOOR. An allergy question answered wrong is not one question's worth of
// wrong — it is the only failure mode in this whole product that can put a guest in an
// ambulance. A waiter can be excellent everywhere else and still must not be certified
// while they are guessing here. Same reasoning as the "allergens are a closed list" rule in
// the Edge Function: on this field a false confidence is worse than an admitted gap.
export function gradeExam(sections, passMark = DEFAULT_PASS) {
  const asked = sections.reduce((n, s) => n + s.questions.length, 0);
  const right = sections.reduce((n, s) => n + s.correct, 0);
  const score = asked ? Math.round((right / asked) * 100) : 0;

  const bySection = sections.map((s) => {
    const pct = s.questions.length ? Math.round((s.correct / s.questions.length) * 100) : 0;
    const plan = SECTION_PLAN.find((p) => p.module === s.module);
    return {
      module: s.module,
      title: MODULES[s.module]?.title || s.module,
      pct,
      correct: s.correct,
      total: s.questions.length,
      floor: plan?.floor ?? null,
      belowFloor: plan?.floor != null && pct < plan.floor,
      critical: !!MODULES[s.module]?.critical,
    };
  });

  const blocked = bySection.filter((s) => s.belowFloor);
  return {
    score,
    correct: right,
    asked,
    bySection,
    passed: score >= passMark && blocked.length === 0,
    blockedBy: blocked.map((s) => s.title),
    // The single most useful line for the waiter and for the owner: not "72%", but which
    // moment of the shift to go back over.
    weakest: [...bySection].sort((a, b) => a.pct - b.pct)[0] || null,
  };
}

// ── Building the sitting ─────────────────────────────────────────────────────────────
export function buildServiceExam({ role = "floor", standard = {}, confirmed = [], rnd = Math.random } = {}) {
  const mods = new Set(modulesForRole(role));

  // House rules the owner has confirmed, grouped by the section they belong to. Unconfirmed
  // rules never reach this function — see serviceStandard.js for why certifying someone
  // against our own guess is not acceptable.
  const houseByModule = {};
  for (const k of Object.keys(HOUSE_KEYS)) {
    if (!confirmed.includes(k) || !mods.has(HOUSE_KEYS[k].module)) continue;
    (houseByModule[HOUSE_KEYS[k].module] ||= []).push(k);
  }

  const sections = [];
  for (const plan of SECTION_PLAN) {
    if (!mods.has(plan.module)) continue;

    const universal = BANK.filter((e) => e.module === plan.module)
      .map((e, i) => renderQuestion(e, rnd, i))
      .filter(Boolean);
    const house = (houseByModule[plan.module] || []).map((k) => houseQuestion(k, standard, rnd)).filter(Boolean);

    // Draw fresh each sitting from a pool much larger than the section — that is what makes
    // a retake a second exam rather than a memory test of the first.
    const picked = shuffle([...universal, ...house], rnd).slice(0, plan.count);
    if (!picked.length) continue;

    sections.push({
      module: plan.module,
      title: MODULES[plan.module]?.title || plan.module,
      floor: plan.floor ?? null,
      questions: varyShapes(picked, rnd),
      correct: 0,
    });
  }
  return sections;
}

export const examSeconds = (sections) =>
  sections.reduce((n, s) => n + s.questions.reduce((m, q) => m + secondsFor(q), 0), 0);

// Inside a section, avoid two of the same answer shape back to back — the same rhythm rule
// the practice deck uses. Five identical four-option screens in a row is the texture the
// user described as "horrible", and it is fixed by ordering, not by content.
function varyShapes(list, rnd) {
  const rest = shuffle(list, rnd);
  const out = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    let i = rest.findIndex((q) => !prev || shapeOf(q.kind) !== shapeOf(prev.kind));
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
