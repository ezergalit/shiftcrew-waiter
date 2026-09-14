// ══ צ׳קפוינטים: כל מסך מסביר את עצמו בפעם הראשונה שמגיעים אליו (יותם, 14.9) ══
//
// הגרסה הקודמת הייתה רצף: חמישה משפטים בסדר שקבענו, שרץ פעם אחת בכניסה הראשונה.
// הוא לימד את חמשת המסכים שבמסלול, ומסך שהמלצר גילה בעצמו נשאר בלי הסבר.
//
// עכשיו לכל מסך יש שורה משלו, והיא מופיעה ברגע שמגיעים אליו — בכל סדר, ולאורך זמן.
// ⚠️ המסך נגזר מ**מצב האפליקציה** (`screenOf`) ולא מה-DOM, בדיוק כמו הפס עצמו:
// אין מדידה, אין עוגנים, ומסך שזז משנה טקסט ולא מנגנון.
//
// ⚠️ רק מסכים שהפס באמת מרונדר בהם נמצאים כאן. הכרטיסיות, הבוחן והמבחן הם
// early-returns ב-MainApp שאינם מרנדרים את המעטפת, ולכן אין להם שורה.

const KEY = "menu-app-coach-seen";

export const STOPS = {
  "menu-door": "זה שער התפריט — כל התפריטים של המסעדה. הקישו על אחד כדי להיכנס.",
  "menu-group": "הקטגוריות של התפריט. הטבעת ליד כל אחת מראה כמה ממנה כבר אצלכם.",
  "menu-cat": "המנות של הקטגוריה. הקשה על מנה פותחת אותה במלואה.",
  "menu-dish": "מסך המנה — תיאור, מרכיבים ואזהרות בצבע. הקישו על אזהרה כדי לראות מה היא כוללת.",
  about: "אודות המסעדה — כללי הבית, שעות הפתיחה וכל מה שהמנהל כתב לכם.",
  "learn-door": "כאן בוחרים מה לתרגל. קטגוריה שמגיעים בה ל-50% פותחת בוחן.",
  "learn-group": "התפריטים לתרגול. בוחרים אחד ואז קטגוריה שבתוכו.",
  "learn-cat": "הקטגוריה שבחרתם. ״תרגול״ פותח סבב כרטיסיות על המנות שבה.",
  tasks: "משימות המשמרת של היום. סימון נשמר לכל הצוות.",
  daily: "העדכון היומי של המנהל — מה חסר, על מה להמליץ ומה חדש.",
};

// מצב האפליקציה ⇒ שם המסך. הסדר הוא סדר העומק: הפנימי ביותר מנצח.
export function screenOf({ tab, stage, showAbout, catView, groupView }) {
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
