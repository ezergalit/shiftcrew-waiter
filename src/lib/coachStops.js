// ══ צ׳קפוינטים: כל מסך מסביר את עצמו בפעם הראשונה שמגיעים אליו (יותם, 14.9) ══
//
// הגרסה הקודמת הייתה רצף: חמישה משפטים בסדר שקבענו, שרץ פעם אחת בכניסה הראשונה.
// הוא לימד את חמשת המסכים שבמסלול, ומסך שהמלצר גילה בעצמו נשאר בלי הסבר.
//
// עכשיו לכל מסך יש שורה משלו, והיא מופיעה ברגע שמגיעים אליו — בכל סדר, ולאורך זמן.
// ⚠️ המסך נגזר מ**מצב האפליקציה** (`screenOf`) ולא מה-DOM, בדיוק כמו הפס עצמו:
// אין מדידה, אין עוגנים, ומסך שזז משנה טקסט ולא מנגנון.
//
// ⚠️ כל שורה כאן היא הבטחה שהמסך צריך לקיים. סבב תיקונים (יותם, 14.9) מצא חמש
// שורות שתיארו משהו אחר ממה שיש על המסך — ר' ההערות בכל אחת. **לפני שמשנים טקסט
// כאן: לפתוח את המסך ולבדוק שהוא באמת עושה את זה.**

// ⚠️ הגרסה הראשונה סימנה שורה כ«נראתה» ברגע שהוצגה — אז מקש «אחורה» העלים אותה
// לתמיד (יותם, 14.9: «כשלוחצים אחורה זה מוחק אותו»). מעכשיו שורה ננעלת רק
// ב«הבנתי» או אחרי כמה צעדים קדימה — לכן מפתח אחסון חדש: מה שהסימון הישן «שרף»
// בטעות חוזר להופיע פעם אחת תחת הכללים הנכונים.
const KEY = "menu-app-coach-seen2";

// כמה צעדי «קדימה» מעלימים שורה שלא אושרה ב«הבנתי». חזרה אחורה ומעבר בין
// טאבים אינם קדימה — השורה תופיע שוב בביקור הבא באותו מסך.
export const FORWARD_DISMISS = 3;

// עומק לכל מסך — הציר שעליו «קדימה» נמדד. מסכי שורש = 0.
const DEPTH = {
  "menu-door": 0, "menu-group": 1, "menu-cat": 2, "menu-dish": 3, about: 1,
  "learn-door": 0, "learn-group": 1, "learn-cat": 2, cards: 3,
  tasks: 0, daily: 0,
};

// prev ⇒ next הוא צעד קדימה? `null` הוא פעילות בלי שורה (סבב/בוחן/מבחן) —
// כניסה אליה היא קדימה, יציאה ממנה חזרה.
export function isForward(prev, next) {
  if (prev === next || prev == null) return false;
  if (next == null) return true;
  return (DEPTH[next] ?? 0) > (DEPTH[prev] ?? 0);
}

// כמה כרטיסיות מדרגים לפני ששורת «כמה עוד עד הבוחן» מופיעה (יותם, 14.9:
// "אחרי שסיימו 10 כרטיסיות אפשר לכתוב נדרש לכם עוד 4 דקות"). לפני זה המספר
// עוד לא אומר כלום, ושורה שקופצת על הכרטיס הראשון רק חוסמת את הלימוד.
export const CARDS_BEFORE_GATE_HINT = 10;

export const STOPS = {
  // 🔴 «שער התפריט» ירד (יותם, 14.9) — זה מונח שלנו, לא שלו. וההדרכות יושבות כאן
  // בדיוק כמו התפריטים, אז השורה אומרת את שניהם.
  "menu-door": "כאן ניתן לראות את התפריט כולל הדרכות והסברים.",
  // 🔴 היה: «הטבעת ליד כל אחת מראה כמה ממנה כבר אצלכם» — אין טבעת ואין אחוז על
  // שורות הקטגוריה. מה שכן כתוב שם הוא כמה מנות יש בכל אחת.
  "menu-group": "הקטגוריות של התפריט הזה, וכמה מנות בכל אחת.",
  "menu-cat": "המנות של הקטגוריה. הקשה על מנה פותחת אותה במלואה.",
  "menu-dish": "כל מה שצריך לדעת על המנה. הקישו על אזהרה בצבע כדי לראות מה היא כוללת.",
  // 🔴 היה «שעות הפתיחה» — המסך מציג «מי אנחנו» וכללי הבית, ואין בו שעות.
  about: "מי אנחנו וכללי הבית — מה שהמנהל רוצה שתדעו לפני משמרת.",
  // 🔴 שתי השורות היו הפוכות: המסך הזה הוא רשימת התפריטים, לא הקטגוריות.
  // הנוסח מיותם (14.9), מילה במילה.
  "learn-door": "פה מתרגלים בעזרת כרטיסיות. ניתן להיבחן אחרי הגעה ל-50% בכל קטגוריה.",
  "learn-group": "תיכנסו על מנת לתרגל לקראת הבוחן.",
  "learn-cat": "תיכנסו על מנת לתרגל לקראת הבוחן.",
  // 🔴 היה «סימון נשמר לכל הצוות» — `shift_task_done` ממופתח על team_member_id,
  // כלומר כל מלצר מסמן לעצמו והמנהל רואה כמה סימנו.
  tasks: "משימות המשמרת של היום. כל אחד מסמן לעצמו, והמנהל רואה מי סימן.",
  daily: "העדכון היומי של המנהל — מה חסר, על מה להמליץ ומה חדש.",
};

// שורת הכרטיסיות היא היחידה שנושאת מספר חי, אז היא פונקציה ולא מחרוזת.
// שלושה מצבים, ו**אסור לאחד אותם**: `0` = השער פתוח · מספר = כמה תרגול נשאר ·
// `null` = סף ה-50% עוד לא הושג, ואז אין מספר דקות להבטיח ואומרים מה כן נכון.
export function cardsText(needMin) {
  if (needMin === 0) return "סיימתם מספיק תרגול — הבוחן פתוח לכם.";
  if (needMin == null) return "כל כרטיסייה מקרבת אתכם לבוחן של הקטגוריה.";
  return `נדרש לכם עוד ${needMin === 1 ? "דקה" : `${needMin} דקות`} של תרגול על מנת להיכנס לבוחן.`;
}

export function textFor(screen, ctx = {}) {
  if (screen === "cards") return cardsText(ctx.needMin);
  return STOPS[screen] || null;
}

// מצב האפליקציה ⇒ שם המסך. הסדר הוא סדר העומק: הפנימי ביותר מנצח.
export function screenOf({ tab, stage, showAbout, catView, groupView, mode, ratedInMode = 0 }) {
  // הכרטיסיות הן early-return שאינו מרנדר את המעטפת, ולכן הפס מתארח בתוכן דרך
  // `coachSlot` — בדיוק כמו מסך המנה. הבוחן והמבחן נשארים בלי שורה: שם מודדים,
  // וזה לא הרגע ללמד.
  if (mode) {
    // ⚠️ `groupcards` לא ברשימה — GroupFlashcards אינו מארח `coachSlot`, ושורה
    // שאין לה איפה להיות מסומנת כנראה בלי להיראות (הכלל מ-14.9).
    if (mode === "progressive" || mode === "flashcards" || mode === "quick")
      return ratedInMode >= CARDS_BEFORE_GATE_HINT ? "cards" : null;
    return null;
  }
  if (showAbout) return "about";
  if (tab === "categories") {
    // ⚠️ ריבוע ההסבר הוא overlay ב-z-90 שמכסה את הפס, ולכן אין לו עצירה משלו —
    // השורה של מסך המנה כבר אומרת להקיש על אזהרה.
    if (stage?.idx !== null && stage?.idx !== undefined) return "menu-dish";
    if (stage?.cat) return "menu-cat";
    if (stage?.menu) return "menu-group";
    return "menu-door";
  }
  if (tab === "learn") {
    if (catView) return "learn-cat";
    if (groupView) return "learn-group";
    return "learn-door";
  }
  if (tab === "home") return "tasks";
  if (tab === "daily") return "daily";
  return null;
}

// ⚠️ פר-חבר ופר-מכשיר, כמו שאר מוני ההרגל באפליקציה. מכשיר חדש מתחיל מחדש —
// זה הרגל, לא אבטחה, והחזרה עולה שורה אחת למסך.
export function loadSeen(memberId) {
  if (!memberId) return new Set();
  try {
    const raw = localStorage.getItem(`${KEY}-${memberId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export function markSeen(memberId, screen, seen) {
  const next = new Set(seen);
  next.add(screen);
  if (memberId) {
    try { localStorage.setItem(`${KEY}-${memberId}`, JSON.stringify([...next])); } catch { /* storage full / private mode */ }
  }
  return next;
}

// «להריץ שוב» ממסך המדדים: מנקה את מה שנראה, וכל שורה חוזרת בדרכה.
export function resetSeen(memberId) {
  if (memberId) {
    try { localStorage.removeItem(`${KEY}-${memberId}`); } catch { /* private mode */ }
  }
  return new Set();
}
