// מבחן ובחני השירות.
//
// Two things live here, matching the app's existing vocabulary (בוחן = one unit, מבחן = all
// of it — see CLAUDE.md, "מינוח אחיד"):
//
//   buildServiceQuiz  — בוחן שירות: one module, the way CategoryExam is one category.
//   buildFinalExam    — המבחן הסופי: menu AND service together, in sections (user, 2026-08-24).
//
// ── What was wrong with the exam this replaces ────────────────────────────────────────
//
// MenuExam is 40 questions under ONE clock. Three consequences, all named by the user
// ("too hard and not centred enough"):
//
//   1. ONE CLOCK PUNISHES THE WRONG THING. Thinking carefully about question 3 costs you
//      question 30. The clock stops measuring knowledge and starts measuring pacing.
//   2. 40 QUESTIONS OF ONE FLAVOUR IS AN ENDURANCE TEST. Past about twenty-five, the score
//      measures who is still reading.
//   3. ONE PERCENTAGE HIDES THE ONLY THING THAT MATTERS. 72% can mean "solid everywhere" or
//      "excellent everywhere and blank on allergies". Only one of those can work the floor.

import { BANK, MODULES, renderQuestion, modulesForRole, shapeOf } from "./serviceBank.js";
import { HOUSE_KEYS, houseQuestion, courseCategories } from "./serviceStandard.js";
import { buildMenuExamDeck } from "./serviceScenarios.js";

// ── Time ──────────────────────────────────────────────────────────────────────────────
// The clock exists to stop someone looking an answer up mid-question, NOT to make the exam
// hard. Generous for reading Hebrew and answering; far too short to search. Someone who
// knows the answer uses about a third of it.
//
// ⚠️ Per QUESTION, never per exam, and time never rolls over — carrying it forward is
// exactly what turns an exam into a pacing contest.
export const SECONDS = { single: 25, multi: 40, order: 60 };
export const secondsFor = (q) => SECONDS[shapeOf(q)] || SECONDS.single;

// Running out of time scores as wrong, not as a skip: a waiter who cannot answer inside
// twenty-five seconds cannot answer at a table either.
export const TIMEOUT_IS_WRONG = true;

// ── The safety floor ─────────────────────────────────────────────────────────────────
// ⚠️ 100% — zero mistakes (user decision, 2026-08-24). An allergy answered wrong is not one
// question's worth of wrong; it is the only failure mode in this product that ends in an
// ambulance. A waiter can be excellent everywhere else and still must not be certified
// while they are guessing here.
//
// ⚠️ The cost of 100%, stated so nobody rediscovers it as a bug: ONE mis-tap under the
// clock fails the whole sitting. That is the intended trade — but it means retakes must
// stay free and unlimited, and it is why SAFETY_COUNT is small.
export const SAFETY_FLOOR = 100;
export const SAFETY_MODULE = "S4";
const SAFETY_COUNT = 4;

export const DEFAULT_PASS = 75;

// Service sections for a standalone service exam. `count` is per section.
export const SECTION_PLAN = [
  { module: "S4", count: SAFETY_COUNT, floor: SAFETY_FLOOR },
  { module: "S1", count: 3 },
  { module: "S2", count: 3 },
  { module: "S3", count: 3 },
  { module: "S5", count: 3 },
  { module: "S6", count: 2 },
  { module: "S7", count: 4 },
];

// In the combined final exam the menu carries its own section, and the service sections
// shrink so the whole sitting stays inside a coffee break.
const FINAL_MENU_COUNT = 12;

// ⚠️ The sitting has a TIME BUDGET, not a question count. A waiter who is both floor and bar
// studies two extra sections, and sizing by question count pushed that sitting to sixteen
// minutes — straight back into the endurance test this rewrite exists to remove. Sections
// shrink to fit the budget instead.
const MAX_EXAM_SECONDS = 13 * 60;

// ── Grading ──────────────────────────────────────────────────────────────────────────
export function gradeExam(sections, passMark = DEFAULT_PASS) {
  const asked = sections.reduce((n, s) => n + s.questions.length, 0);
  const right = sections.reduce((n, s) => n + s.correct, 0);
  const score = asked ? Math.round((right / asked) * 100) : 0;

  const bySection = sections.map((s) => {
    const pct = s.questions.length ? Math.round((s.correct / s.questions.length) * 100) : 0;
    return {
      key: s.key,
      title: s.title,
      pct,
      correct: s.correct,
      total: s.questions.length,
      floor: s.floor ?? null,
      belowFloor: s.floor != null && pct < s.floor,
      critical: !!s.floor,
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
    // The single most useful line for both the waiter and the owner: not "72%", but which
    // moment of the shift to go back over.
    weakest: [...bySection].sort((a, b) => a.pct - b.pct)[0] || null,
  };
}

// ── בוחן שירות — one module ───────────────────────────────────────────────────────────
export function buildServiceQuiz({ module, size = 8, standard = {}, confirmed = [], exam = false, rnd = Math.random } = {}) {
  const universal = BANK.filter((e) => e.module === module)
    .map((e, i) => renderQuestion(e, rnd, i))
    .filter(Boolean);
  // An unconfirmed house rule may be PRACTISED but never examined — see serviceStandard.js.
  const house = Object.keys(HOUSE_KEYS)
    .filter((k) => HOUSE_KEYS[k].module === module && (!exam || confirmed.includes(k)))
    .map((k) => houseQuestion(k, standard, rnd))
    .filter(Boolean);
  return varyShapes(shuffle([...universal, ...house], rnd), rnd).slice(0, size);
}

// ── המבחן הסופי — menu AND service ────────────────────────────────────────────────────
//
// ⚠️ The allergy section draws from BOTH sides. A menu allergy scenario ("this guest is
// allergic to sesame — which dish can you serve?") and a service allergy procedure ("who do
// you tell?") are the same competence, and putting them in different sections would let
// someone clear a 100% floor while failing the half that happens to sit elsewhere.
export function buildFinalExam({
  cards = [], categoryOrder = [], role = "waiter",
  standard = {}, confirmed = [], menuCount = FINAL_MENU_COUNT, rnd = Math.random,
} = {}) {
  const mods = new Set(modulesForRole(role));
  const sections = [];

  // Over-draw the menu deck so there is something left for the menu section after the
  // allergy questions are pulled out of it.
  const menuDeck = buildMenuExamDeck(cards, menuCount + SAFETY_COUNT * 2, rnd, categoryOrder, courseCategories(standard));
  const isMenuSafety = (q) => q.kind === "allergy" || q.kind === "allergenset";
  const menuSafety = menuDeck.filter(isMenuSafety);
  const menuRest = menuDeck.filter((q) => !isMenuSafety(q));

  // 1 — Safety first, and it is the section that can block on its own.
  const svcSafety = buildServiceQuiz({ module: SAFETY_MODULE, size: 99, standard, confirmed, exam: true, rnd });
  const safety = shuffle([...svcSafety, ...menuSafety], rnd).slice(0, SAFETY_COUNT);
  if (safety.length) {
    sections.push({
      key: SAFETY_MODULE,
      title: MODULES[SAFETY_MODULE].title,
      floor: SAFETY_FLOOR,
      questions: varyShapes(safety, rnd),
      correct: 0,
    });
  }

  // 2 — The menu itself.
  if (menuRest.length) {
    sections.push({ key: "menu", title: "התפריט", floor: null, questions: menuRest.slice(0, menuCount), correct: 0 });
  }

  // 3 — The rest of the shift, one section per moment.
  for (const plan of SECTION_PLAN) {
    if (plan.module === SAFETY_MODULE || !mods.has(plan.module)) continue;
    // Sections are smaller here than in a standalone service exam: the menu section is
    // already carrying twelve questions of the sitting.
    const size = Math.max(2, plan.count - 1);
    const qs = buildServiceQuiz({ module: plan.module, size, standard, confirmed, exam: true, rnd });
    if (qs.length) sections.push({ key: plan.module, title: MODULES[plan.module].title, floor: null, questions: qs, correct: 0 });
  }

  return fitBudget(sections);
}

// Trim the sitting to the time budget by dropping the last question from the longest
// section, repeatedly.
//
// ⚠️ THE SAFETY SECTION IS NEVER TRIMMED, in either direction. It cannot grow (with a 100%
// floor every extra question is one more chance to fail on a mis-tap) and it cannot shrink
// (fewer questions makes the floor easier to clear by luck). Its size is a deliberate number,
// not a leftover of whatever fitted.
function fitBudget(sections, max = MAX_EXAM_SECONDS) {
  let guard = 0;
  while (examSeconds(sections) > max && guard++ < 200) {
    const trimmable = sections.filter((s) => s.floor == null && s.questions.length > 2);
    if (!trimmable.length) break;
    const biggest = trimmable.reduce((a, b) => (b.questions.length > a.questions.length ? b : a));
    biggest.questions.pop();
  }
  return sections.filter((s) => s.questions.length);
}

// ── Standalone service exam (no menu) ────────────────────────────────────────────────
export function buildServiceExam({ role = "waiter", standard = {}, confirmed = [], rnd = Math.random } = {}) {
  const mods = new Set(modulesForRole(role));
  const sections = [];
  for (const plan of SECTION_PLAN) {
    if (!mods.has(plan.module)) continue;
    const qs = buildServiceQuiz({ module: plan.module, size: plan.count, standard, confirmed, exam: true, rnd });
    if (!qs.length) continue;
    sections.push({ key: plan.module, title: MODULES[plan.module].title, floor: plan.floor ?? null, questions: qs, correct: 0 });
  }
  return sections;
}

export const examSeconds = (sections) =>
  sections.reduce((n, s) => n + s.questions.reduce((m, q) => m + secondsFor(q), 0), 0);

export const examLength = (sections) => sections.reduce((n, s) => n + s.questions.length, 0);

// Inside a section, avoid two of the same ANSWER SHAPE back to back. Five identical
// four-option screens in a row is the texture the user called "horrible", and it is fixed by
// ordering rather than by content.
function varyShapes(list, rnd) {
  const rest = shuffle(list, rnd);
  const out = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    let i = rest.findIndex((q) => !prev || shapeOf(q) !== shapeOf(prev));
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
