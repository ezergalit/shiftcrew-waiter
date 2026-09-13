// סטנדרט הבית — the service rules that legitimately differ between restaurants.
//
// ⚠️ THE WHOLE POINT OF THIS FILE. A menu question has one authority: the menu. A service
// question does not. "From which side do you serve?" has a professional default, but the
// restaurant that pays us is the only authority on what happens on ITS floor — and a
// confident wrong answer here teaches a waiter something false about their own job. This
// is the same rule already enforced in qServingOrder (serviceScenarios.js): we never guess
// a house rule from a plausible-sounding convention.
//
// So every key below ships with the professional default already filled in (פנקס השותף #8
// — the system proposes, the owner approves), and carries a `confirmed` flag:
//
//   confirmed = false  → the default is shown and PRACTISED, but never examined.
//   confirmed = true   → the owner has said "this is us", and it counts on the exam.
//
// That split is deliberate. The exam is what an owner reads to decide whether someone can
// work the floor; it must not turn our guess into their standard. Practice can safely use
// the default, because being wrong there costs a retry, not a certification.

export const SIDE = { right: "מימין", left: "משמאל" };

// Each key: what the owner is choosing, the professional default, and the options.
// `ask` is the question text the waiter sees — written as "אצלנו", never as a universal
// truth, so nobody learns a house rule as if it were a law of hospitality.
export const HOUSE_KEYS = {
  greet_seconds: {
    label: "כמה זמן עד הברכה הראשונה",
    help: "מרגע שהאורח התיישב ועד שמישהו פנה אליו.",
    def: "60",
    options: [
      { v: "0", label: "מיד עם ההושבה" },
      { v: "30", label: "תוך 30 שניות" },
      { v: "60", label: "תוך דקה" },
      { v: "120", label: "תוך שתי דקות" },
    ],
    ask: "אורחים התיישבו. תוך כמה זמן ניגשים אליהם אצלנו?",
    module: "S1",
  },
  water_timing: {
    label: "מתי מגיעים מים לשולחן",
    def: "greet",
    options: [
      { v: "greet", label: "יחד עם הברכה הראשונה" },
      { v: "order", label: "אחרי לקיחת ההזמנה" },
      { v: "ask", label: "רק אם האורח ביקש" },
    ],
    ask: "מתי מגיעים מים לשולחן אצלנו?",
    module: "S1",
  },
  order_minutes: {
    label: "כמה זמן לפני לקיחת ההזמנה",
    help: "כמה זמן נותנים לאורח עם התפריט לפני שחוזרים.",
    def: "5",
    options: [
      { v: "3", label: "אחרי 3 דקות" },
      { v: "5", label: "אחרי 5 דקות" },
      { v: "8", label: "אחרי 8 דקות" },
      { v: "signal", label: "רק כשהאורח מסמן" },
    ],
    ask: "האורחים קיבלו תפריט. מתי חוזרים לקחת הזמנה אצלנו?",
    module: "S2",
  },
  // ⚠️ Serving side and clearing side are ONE key on purpose. Asked separately each is a
  // coin flip, and the pair is also the thing that actually differs between houses — many
  // serve from one side and clear from the other. Four combinations make it a real question.
  serve_clear_side: {
    label: "מאיזה צד מגישים ומאיזה מפנים",
    help: "ברירת המחדל היא הקונבנציה המקובלת במסעדות שף — הגשה משמאל, פינוי מימין. אם אצלכם אחרת, זה המקום לשנות.",
    def: "left_right",
    options: [
      { v: "left_right", label: "מגישים משמאל, מפנים מימין" },
      { v: "right_left", label: "מגישים מימין, מפנים משמאל" },
      { v: "right_right", label: "מגישים ומפנים מימין" },
      { v: "left_left", label: "מגישים ומפנים משמאל" },
    ],
    ask: "מאיזה צד מגישים מנה ומאיזה צד מפנים צלחת אצלנו?",
    module: "S3",
  },
  clear_policy: {
    label: "מתי מפנים צלחות",
    help: "האם מפנים את מי שסיים, או מחכים לכל השולחן.",
    def: "all_done",
    options: [
      { v: "all_done", label: "רק כשכל השולחן סיים" },
      { v: "each", label: "כל אורח כשהוא מסיים" },
      { v: "ask", label: "שואלים את האורח" },
    ],
    ask: "אורח אחד בשולחן סיים והשאר עדיין אוכלים. מה עושים אצלנו?",
    module: "S3",
  },
  check_back: {
    label: "בדיקת שביעות רצון אחרי ההגשה",
    def: "2min",
    options: [
      { v: "first_bite", label: "אחרי הביס הראשון" },
      { v: "2min", label: "כשתי דקות אחרי ההגשה" },
      { v: "5min", label: "כחמש דקות אחרי ההגשה" },
      { v: "none", label: "לא ניגשים — רק אם קוראים לנו" },
    ],
    ask: "המנות הוגשו. מתי חוזרים לבדוק שהכל בסדר אצלנו?",
    module: "S2",
  },
  napkin_position: {
    label: "איפה המפית בעריכת שולחן",
    def: "plate",
    options: [
      { v: "plate", label: "על צלחת ההגשה" },
      { v: "left", label: "משמאל, מתחת למזלג" },
      { v: "left_of", label: "משמאל לסכו״ם" },
      { v: "glass", label: "בתוך הכוס" },
    ],
    ask: "איפה מניחים את המפית בעריכת שולחן אצלנו?",
    module: "S3",
  },
  service_order: {
    label: "סדר השירות סביב השולחן",
    def: "ladies",
    options: [
      { v: "ladies", label: "נשים ראשונות, אחר כך עם כיוון השעון" },
      { v: "clockwise", label: "עם כיוון השעון מהאורח הראשון" },
      { v: "guest", label: "האורח המבוגר ביותר ראשון" },
      { v: "ready", label: "לפי סדר המנות שיוצאות" },
    ],
    ask: "באיזה סדר מגישים סביב השולחן אצלנו?",
    module: "S3",
  },
  bill_policy: {
    label: "מתי מביאים את החשבון",
    def: "request",
    options: [
      { v: "request", label: "רק כשהאורח מבקש" },
      { v: "dessert", label: "אחרי שסירבו לקינוח" },
      { v: "auto", label: "אוטומטית בסוף הארוחה" },
    ],
    ask: "מתי מביאים את החשבון לשולחן אצלנו?",
    module: "S2",
  },
  crumbing: {
    label: "ניקוי פירורים לפני קינוח",
    def: "dessert",
    options: [
      { v: "dessert", label: "מנקים לפני הקינוח" },
      { v: "every", label: "מנקים בין כל המנות" },
      { v: "no", label: "לא נהוג אצלנו" },
    ],
    ask: "השולחן סיים מנות עיקריות ורוצה קינוח. מה עושים לפני שמגישים אותו?",
    module: "S3",
  },
  allergy_escalation: {
    label: "למי מדווחים על אלרגיה",
    help: "⚠️ שדה בטיחות. זה הנוהל שמונע פינוי לבית חולים.",
    def: "manager_kitchen",
    options: [
      { v: "manager_kitchen", label: "למנהל המשמרת וגם למטבח" },
      { v: "kitchen", label: "למטבח בלבד" },
      { v: "manager", label: "למנהל המשמרת בלבד" },
      { v: "note", label: "מספיק לרשום בהערה בהזמנה" },
    ],
    ask: "אורח מדווח על אלרגיה. למי מעבירים את המידע אצלנו?",
    module: "S4",
  },
  wine_taste: {
    label: "מי טועם את היין",
    def: "orderer",
    options: [
      { v: "orderer", label: "מי שהזמין את הבקבוק" },
      { v: "host", label: "מארח השולחן" },
      { v: "anyone", label: "מי שמבקש" },
    ],
    ask: "נפתח בקבוק יין בשולחן. למי מוזגים את הטעימה אצלנו?",
    module: "S3",
  },
  phone_policy: {
    label: "טלפון אישי במשמרת",
    def: "back",
    options: [
      { v: "back", label: "רק בחדר הצוות / מאחור" },
      { v: "break", label: "רק בהפסקה" },
      { v: "never", label: "לא נכנס למשמרת בכלל" },
    ],
    ask: "מה מדיניות הטלפון האישי במשמרת אצלנו?",
    module: "S6",
  },
};

// ── Which categories leave the kitchen in courses ────────────────────────────────────
// ⚠️ NOT a HOUSE_KEYS entry, because it is a list of the restaurant's own category names
// rather than a choice between our options — the owner ticks their categories.
//
// It exists because nothing in the menu data separates food from drink. On Studio 2026 all
// 22 wines and 62 spirits carry ingredients AND descriptions (a different feature filled
// them in), so every content-based test waves them through, and the exam asked which of a
// beef skewer, a Syrah and a sparkling water "comes out first". There is no answer.
//
// Empty ⇒ a multi-menu restaurant gets NO serving-order question. That is the intended
// behaviour: a missing question costs nothing, a wrong one teaches a waiter something false
// about their own service.
export const COURSE_CATEGORIES_KEY = "course_categories";
export const courseCategories = (standard) => {
  const v = standard?.[COURSE_CATEGORIES_KEY];
  return Array.isArray(v) && v.length ? v : null;
};

// The shape a restaurant's answers arrive in. Missing key ⇒ default, never a hole.
export const defaultStandard = () =>
  Object.fromEntries(Object.entries(HOUSE_KEYS).map(([k, v]) => [k, v.def]));

export const valueOf = (standard, key) =>
  (standard && standard[key] != null && standard[key] !== "" ? standard[key] : HOUSE_KEYS[key]?.def);

export const labelFor = (key, value) =>
  HOUSE_KEYS[key]?.options.find((o) => o.v === value)?.label || null;

// Is this key safe to put on a certification exam? Only once a human at the restaurant
// has said it is theirs. `confirmed` is a list of keys the owner ticked.
export const isConfirmed = (confirmed, key) => Array.isArray(confirmed) && confirmed.includes(key);

// ── Tier B question builder ───────────────────────────────────────────────────────────
// One key ⇒ one question. The distractors are the OTHER options for the same key, which
// makes them plausible by construction: they are real practices at real restaurants, just
// not this one. Nothing here is invented, and nothing needs a similarity heuristic.
export function houseQuestion(key, standard, rnd = Math.random) {
  const spec = HOUSE_KEYS[key];
  if (!spec) return null;
  const val = valueOf(standard, key);
  const correct = spec.options.find((o) => o.v === val);
  // An owner value we don't recognise (hand-edited, or a key we changed): refuse rather
  // than mark every option wrong.
  if (!correct) return null;
  const others = spec.options.filter((o) => o.v !== correct.v);
  if (others.length < 2) return null;
  const opts = shuffleWith([correct, ...others.slice(0, 3)], rnd);
  return {
    kind: "house",
    houseKey: key,
    module: spec.module,
    tier: "B",
    prompt: spec.ask,
    // Said out loud on the result screen: this is a house rule, not a law of hospitality.
    note: "זה סטנדרט הבית — במסעדה אחרת התשובה יכולה להיות אחרת.",
    options: opts.map((o) => ({ id: `${key}:${o.v}`, label: o.label, correct: o.v === correct.v })),
  };
}

function shuffleWith(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
