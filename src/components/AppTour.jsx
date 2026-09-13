import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ListChecks, GraduationCap, Wallet, Sparkles, Hand } from "lucide-react";
import { gz } from "../lib/shiftChoice";
import AnswerInput from "./AnswerInput";
import { buildVocab } from "../lib/examSuggest";
import { menuFromCards } from "../lib/examMenu";

// First-run guided tour — rebuilt 2026-08-20 to actually be guided.
//
// The old version was a stack of explanation cards with a "next" button: the waiter read
// seven paragraphs, pressed next seven times, and arrived at a screen they had still never
// touched. Now a step can name a REAL element (`target`, matched on a data-tour attribute)
// — the screen behind it is dimmed except for that element, and the only way forward is to
// tap the thing itself. You can't skim your way through a tap.
//
// The content is the learning path, in order, because that is what a new waiter is actually
// missing: read the menu → practise it → sit the category exam → the full menu exam last.
const STEPS = [
  {
    icon: GraduationCap, title: "ככה לומדים כאן",
    body: "שלושה שלבים, בסדר הזה: קודם עוברים על התפריט וקוראים את המנות — מרכיבים, אלרגיות ומה חשוב לומר לאורח. אחר כך מתרגלים בכרטיסיות עד שמכירים. ובסוף נבחנים: בוחן קצר על כל קטגוריה, ורק אחרי שעוברים את כולם — מבחן התפריט המלא.",
  },
  {
    // No `tab` here on purpose: the point of the step is that the waiter finds the tab
    // in the bottom bar and taps it — the tap itself does the navigation.
    icon: BookOpen, title: "שלב 1 — התפריט עצמו",
    body: "הכל מתחיל בטאב \u05f4תפריט\u05f4 בסרגל למטה — שם חיים כל תפריטי המסעדה.",
    target: '[data-tour="nav-categories"]', cue: "הקש/י על טאב התפריט למטה",
  },
  {
    tab: "categories", reset: true, icon: BookOpen, title: "בחר/י תפריט",
    body: "אלה התפריטים של המסעדה. נתחיל מלפתוח אחד.",
    target: '[data-tour="browse-menu"]', cue: "הקש/י על תפריט כדי לפתוח אותו",
  },
  {
    tab: "categories", deep: true, icon: BookOpen, title: "בחר/י קטגוריה",
    body: "בתוך כל תפריט יש קטגוריות. הקש/י על אחת כדי לראות את המנות שבה.",
    target: '[data-tour="browse-category"]', cue: "הקש/י על קטגוריה",
  },
  {
    tab: "categories", deep: true, icon: Sparkles, title: "עכשיו נפתח מנה",
    body: "אלה המנות של הקטגוריה. הקשה על אחת פותחת אותה על כל המסך — התיאור המלא, המרכיבים, ומה שאסור לפספס: אלרגיות באדום, רגישות בהריון בסגול ומוקשים בצהוב.",
    target: '[data-tour="browse-dish"]', cue: "הקש/י על המנה הראשונה",
  },
  {
    tab: "categories", deep: true, icon: Sparkles, title: "ככה נראית מנה",
    body: "תגית אדומה היא אלרגיה — מה שאסור להגיש לאורח שרגיש לה; תגית צהובה היא העדפה — רק עניין של טעם. החצים למטה מעבירים למנה הבאה, אז אפשר לעבור על קטגוריה שלמה ברצף — וזה בדיוק מה שעושים לפני שמתחילים לתרגל.",
  },
  {
    // ⚠️ Needs `tab`+`reset` even though it points at the bottom nav: the previous step
    // leaves the waiter inside the full-screen dish view, which covers the nav bar. The
    // spotlight was measured on the hidden nav and the tap landed on the dish's own
    // "next dish" button instead. Resetting the browser closes the dish and puts the nav
    // back on screen, which is where this step is pointing.
    tab: "categories", reset: true,
    icon: GraduationCap, title: "שלב 2 — לתרגל",
    body: "את התרגול מוצאים בטאב \u05f4תרגול ובחינה\u05f4 בסרגל למטה.",
    target: '[data-tour="nav-learn"]', cue: "הקש/י על טאב התרגול למטה",
  },
  {
    tab: "learn", reset: true, icon: GraduationCap, title: "לתרגל את מה שקראת",
    body: "כאן בוחרים מה לתרגל. נתחיל מאחד ונראה איך זה עובד.",
    target: '[data-tour="learn-menu"], [data-tour="learn-category"]', cue: "הקש/י כדי להיכנס",
  },
  {
    tab: "learn", icon: Sparkles, title: "כרטיסיות",
    body: "בחזית הכרטיס מופיע שם המנה בלבד. נזכרים מה יש בה — ורק כשיודעים, הופכים: בגב מחכים התיאור המלא, המרכיבים, האלרגיות והרגישויות. אחרי ההיפוך מדרגים 1-5 כמה ידעת. מנה שמקבלת 5 פעמיים ברצף מסומנת ✓ ויוצאת מהסבב, והבאה נכנסת במקומה.",
  },
  {
    tab: "learn", icon: GraduationCap, title: "שלב 3 — הבחנים והמבחן",
    body: "כשתכיר/י מספיק מנות בקטגוריה, יופיע בה כפתור בוחן — עם שעון. עוברים בוחן בכל קטגוריה, ורק אחרי שעוברים את כולם נפתח מבחן התפריט המלא — המבחן שלך על התפריט. את מבחן התפריט עושים יחד עם המנהל/ת, במסעדה.",
  },
  {
    tab: "home", icon: ListChecks, title: "ומה עושים כל יום?",
    body: "מסך המשימות הוא מה שפותחים בתחילת משמרת: 'משימה יומית' — העדכון היומי והמשימות מהמנהל/ת; 'משימות כלליות' — הלימוד. כל משימה פותחת את מה שצריך לעשות, והמספר הוא המקום בתור.",
  },
  {
    tab: "home", icon: Wallet, title: "המדדים שלך",
    body: "כפתור הגרף בפינה השמאלית העליונה פותח את המדדים שלך. נפתח אותו עכשיו.",
    target: '[data-tour="metrics"]', cue: "הקש/י על כפתור הגרף למעלה",
  },
  {
    // Deliberately no `tab`: navigating would close the metrics screen this step is
    // standing on. `deep` so stepping back rewinds to the button that opens it.
    deep: true, icon: Wallet, title: "אלה הנתונים שלך",
    body: "כמה מהתפריט כבר בכיס ובאיזו רמת שליטה, המקום שלך בצוות, וגם ההכנסות שלך אם בא לך לרשום כמה הרווחת בסוף משמרת — רק לך יש גישה לזה. מכאן אפשר גם להריץ את הסיור הזה שוב, מתי שרוצים.",
  },
];

// The 2-tab world (aurora/tasksOff restaurants + trainees): no tasks tab, written
// quizzes with the study-time gate, end-of-category chaining. Kept as a SEPARATE list
// so the classic flow (CREWDEMO, the store reviewers) is untouched (user, 1.9: bring
// the tour back for both apps, video is advertising now).
const AURORA_STEPS = [
  {
    icon: GraduationCap, title: "ככה לומדים כאן",
    body: "הסדר פשוט: קודם עוברים על התפריט וקוראים את המנות. אחר כך מתרגלים בכרטיסיות עד שמכירים. כשמכירים מספיק — בוחן קצר על כל קטגוריה, ובסוף מבחן התפריט המלא. בוא/י נעבור על זה יחד, צעד-צעד.",
  },
  {
    icon: BookOpen, title: "שלב 1 — התפריט עצמו",
    body: "הכול מתחיל בטאב \u05f4תפריט\u05f4 בסרגל למטה — שם חיים כל תפריטי המסעדה.",
    target: '[data-tour="nav-categories"]', cue: "הקש/י על טאב התפריט למטה",
  },
  {
    tab: "categories", reset: true, icon: BookOpen, title: "בחר/י תפריט",
    body: "אלה התפריטים של המסעדה. נתחיל מלפתוח אחד.",
    target: '[data-tour="browse-menu"]', cue: "הקש/י על תפריט כדי לפתוח אותו",
  },
  {
    tab: "categories", deep: true, icon: BookOpen, title: "בחר/י קטגוריה",
    body: "בתוך כל תפריט יש קטגוריות. הקש/י על אחת כדי לראות את המנות שבה.",
    target: '[data-tour="browse-category"]', cue: "הקש/י על קטגוריה",
  },
  {
    tab: "categories", deep: true, icon: Sparkles, title: "עכשיו נפתח מנה",
    body: "אלה המנות. הקשה על מנה פותחת אותה על כל המסך — תמונה, תיאור מלא, ומה שאסור לפספס לפני שמגישים.",
    target: '[data-tour="browse-dish"]', cue: "הקש/י על המנה הראשונה",
  },
  {
    // ⚠️ היה כאן `autoAfter: 3200` (3.9) — הוחלף בכפתור «הבנתי» (יותם, 6.9): במסך הזה יש מה
    // לקרוא ומה להקיש (קבוצת אזהרה פותחת הסבר), ודילוג אוטומטי חתך את זה באמצע.
    tab: "categories", deep: true, ack: "הבנתי", noDim: true, free: true, cardTop: true, icon: Sparkles, title: "ככה נראית מנה",
    body: "תמונה, תיאור ומרכיבים — ולמטה האזהרות בצבע. אדום זה אלרגיות, מה שיכול לסכן אורח. החצים למטה מעבירים למנה הבאה.",
  },
  {
    // «תוסיף ל-tutorial את החלק שבו הוא מקיש על אלרגיות ורואה את ההגדרה» (יותם, 13.9).
    // skipIfMissing: מנה בלי שום אזהרה (ולכן בלי כרטיס) מדלגת על שני הצעדים האלה.
    tab: "categories", deep: true, skipIfMissing: true, icon: Sparkles, title: "מה זה בעצם אומר?",
    body: "לא בטוח/ה מה זה אלרגיה, רגישות או מוקש? הקשה על קבוצת אזהרה במנה פותחת הסבר קצר.",
    target: '[data-tour="dish-warning"]', cue: "הקש/י על קבוצת האזהרה",
  },
  {
    // הריבוע בצבע הקבוצה. היעד הוא כל השכבה — «הקשה בכל מקום סוגרת» — והחור הוא הריבוע עצמו.
    tab: "categories", deep: true, skipIfMissing: true, noDim: true, free: true, icon: Sparkles, title: "ככה זה נראה",
    body: "ההסבר בצבע הקבוצה, עם מילה על כל פריט. אותו דבר עובד גם על צ׳יפי המקרא בשער התפריט. הקשה בכל מקום סוגרת.",
    hole: '[data-tour="explain-box"]', target: '[data-tour="explain-layer"]', cue: "הקש/י כדי לסגור",
  },
  {
    tab: "categories", deep: true, icon: Sparkles, title: "וכשסיימת — יוצאים מהמנה",
    body: "כפתור הסגירה למעלה מחזיר לרשימת המנות. ככה חוזרים החוצה מכל מנה.",
    target: '[data-tour="dish-close"]', cue: "הקש על סגירה",
  },
  {
    tab: "categories", reset: true,
    icon: GraduationCap, title: "שלב 2 — לתרגל",
    body: "את התרגול מוצאים בטאב \u05f4תרגול ובחינה\u05f4 בסרגל למטה.",
    target: '[data-tour="nav-learn"]', cue: "הקש/י על טאב התרגול למטה",
  },
  {
    tab: "learn", reset: true, icon: GraduationCap, title: "לתרגל את מה שקראת",
    body: "כאן בוחרים מה לתרגל, והטבעות מראות כמה כבר בכיס. נתחיל מאחד.",
    target: '[data-tour="learn-menu"], [data-tour="learn-category"]', cue: "הקש/י כדי להיכנס",
  },
  {
    // Restaurants with several menus show the menu's categories first — one more tap
    // before the practice button exists. A flat restaurant lands on the category page
    // straight away, so this step skips itself when there is nothing to tap.
    tab: "learn", deep: true, skipIfMissing: true, icon: GraduationCap, title: "בחר/י קטגוריה לתרגול",
    body: "בתוך התפריט — הקטגוריות. נכנסים לאחת.",
    target: '[data-tour="learn-category"]', cue: "הקש/י על קטגוריה",
  },
  {
    // From here the tour walks through ONE real flashcard and then a short written
    // test about that very dish (Yotam, 3.9: "guide you through like 1 example
    // flashcard and then a test about it") — no mock, the real screens.
    tab: "learn", deep: true, icon: Sparkles, title: "נתרגל כרטיסייה אחת יחד",
    body: "התרגול הוא בכרטיסיות. נפתח סבב ונעבור על כרטיס אחד לדוגמה.",
    target: '[data-tour="learn-practice"]', cue: "הקש/י על תרגול",
  },
  {
    tab: "learn", deep: true, icon: Sparkles, title: "בחזית — רק שם המנה",
    body: "נסה/י להיזכר מה יש במנה הזו: מרכיבים, אלרגיות, מוקשים. כשמוכן — הופכים את הכרטיס ובודקים.",
    hole: '[data-tour="flashcard"]', target: '[data-tour="flashcard-front"]', cue: "הקש/י על הכרטיס כדי להפוך",
  },
  {
    tab: "learn", deep: true, icon: Sparkles, title: "בגב — התשובה. עכשיו דרג/י",
    body: "5 = ידעת הכל, 1 = בכלל לא. הדירוג קובע מה תחזור/י עליו — מנה שמקבלת 5 פעמיים ברצף יוצאת מהסבב.",
    hole: '[data-tour="flashcard"]', target: '[data-tour="flashcard-rate"]', cue: "בחר/י דירוג 1-5",
    captureDish: true,
  },
  {
    // The written test, for real: same input as the quiz, on the dish just rated.
    // Deliberately NO verdict afterwards (Yotam, 3.9: "in the test you don't show the
    // results") — this is a taste of the format, not a grade.
    tab: "learn", deep: true, quiz: true, icon: GraduationCap, title: "ועכשיו — בוחן קצר על המנה שראית",
    body: "בבוחן האמיתי עונים בכתיבה חופשית, כמו לאורח — לא צריך לדייק באיות. הנה תשובה מלאה לדוגמה, מוכנה מראש:",
  },
  {
    tab: "learn", icon: GraduationCap, title: "ובסוף — מבחן התפריט המלא",
    body: "עוברים את הבוחן בכל קטגוריה, ואז נפתח מבחן התפריט המלא — עושים אותו במסעדה, והמנהל/ת עובר/ת על התשובות ומודיע/ה לך. כל הכללים מופיעים במסך שנפתח לפני המבחן.",
  },
  {
    // ⚠️ tab+reset are load-bearing: the waiter arrives here still inside the learn
    // drill-down from step 8, and the header row that holds the metrics button is
    // hidden there — the spotlight was pointing at nothing (caught live, 1.9).
    // ⚠️ metricsStep: both aurora restaurants currently run features.metrics === false,
    // so these two steps are filtered out for them — the button they point at does not
    // exist (also caught live, same round).
    metricsStep: true,
    tab: "categories", reset: true,
    icon: Wallet, title: "המדדים שלך",
    body: "כפתור הגרף למעלה פותח את המדדים שלך. נפתח אותו עכשיו.",
    target: '[data-tour="metrics"]', cue: "הקש/י על כפתור הגרף למעלה",
  },
  {
    metricsStep: true,
    deep: true, icon: Wallet, title: "אלה הנתונים שלך",
    body: "כמה מהתפריט כבר בכיס והמקום שלך בצוות. מכאן גם מריצים את הסיור הזה שוב.",
  },
  {
    // The closing step for metrics-off restaurants — a tour must end on a full
    // sentence, not evaporate mid-list when the metrics steps are filtered out.
    noMetricsOnly: true,
    tab: "categories", reset: true,
    icon: GraduationCap, title: "זהו — הכול אצלך",
    body: "זה כל המסלול: קוראים את התפריט, מתרגלים בכרטיסיות, עוברים את הבחנים — ובסוף מבחן התפריט המלא. בהצלחה, מתחילים מהתפריט!",
  },
];

// ── הזרקור ───────────────────────────────────────────────────────────────────
// ⚠️ 13.9 (יותם: «כל ה-tutorial מרגיש ונראה זול — יש דיליי אחרי כל לחיצה»). שלושה שורשים,
// כולם היו כאן: (1) `Dim` הוגדר בתוך הרנדור ⇒ קומפוננטה חדשה בכל רנדר ⇒ ארבעת המלבנים נוצרו
// מחדש בכל רנדר, אז ה-transition והפעימה לעולם לא רצו — כל צעד קפץ; (2) פולינג כל 60ms קרא
// setRect עם אובייקט חדש ⇒ 16 רינדורים בשנייה גם כשכלום לא זז, וכל אחד מהם הרכיב מחדש את
// (1); (3) ההתקדמות חיכתה 40ms אחרי ההקשה, והמדידה הראשונה החזירה null ⇒ הבזק של החשכה מלאה
// וכפתור «לא רואים את זה?» לפריים אחד בכל מעבר. עכשיו: Dim ברמת מודול · מדידה ב-layout effect
// לפני הצבעה + MutationObserver/ResizeObserver במקום שעון · setRect רק כשהגאומטריה השתנתה ·
// ההתקדמות סינכרונית בהקשה · החור נשמר עד שהיעד הבא נמדד ⇒ הזרקור גולש ליעד, לא קופץ.
const GLIDE_MS = 170;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const GLIDE = ["top", "left", "width", "height"].map((k) => `${k} ${GLIDE_MS}ms ${EASE}`).join(", ");

// שלושת השלבים כבר כתובים בכותרות («שלב 2 — לתרגל»), אז הכותרת הקטנה נגזרת מהן ולא משוכפלת.
// «צעד 7 מתוך 21» הפך סיור לרשימת מטלות ארוכה; שם השלב + פס דק אומרים כמה נשאר בלי להפחיד.
const STAGE_NAMES = ["", "התפריט", "תרגול", "בחנים ומבחן"];
function stageOf(list, i) {
  let st = 0;
  for (let k = 0; k <= i; k++) {
    const m = /^שלב\s*([1-9])/.exec(list[k]?.title || "");
    if (m) st = +m[1];
  }
  return st;
}

// `free` (13.9): המלבנים לא חוסמים כלום — לצעד שבו המלצר אמור לגלול ולקרוא את המנה («הבנתי»), ולצעד
// ריבוע ההסבר שבו «הקשה בכל מקום סוגרת» חייבת להגיע לרקע של הריבוע ולא להיבלע כאן.
function Dim({ style, clear, free }) {
  return (
    <div
      className={`absolute ${free ? "pointer-events-none" : "pointer-events-auto"}`}
      style={{ background: clear ? "transparent" : "rgba(0,0,0,0.62)", backdropFilter: clear ? undefined : "blur(2px)", WebkitBackdropFilter: clear ? undefined : "blur(2px)", transition: `${GLIDE}, background 160ms`, touchAction: free ? "auto" : "none", overscrollBehavior: "contain", ...style }}
      onWheel={free ? undefined : (e) => e.preventDefault()}
    />
  );
}

// שורד remount של הסיור (MainApp מחליף ענף רינדור בכניסה לכרטיסיות) — אחרת החור נפתח מנקודה במרכז
let LAST_HOLE = null;
const near = (a, b) => Math.abs(a - b) < 0.5;
const sameRect = (a, b) => a === b || (!!a && !!b && near(a.top, b.top) && near(a.left, b.left) && near(a.width, b.width) && near(a.height, b.height));

// מודד את `holeSel` (מה שנשאר מואר) ומגלגל את `targetSel` לתצוגה פעם אחת בכניסה לצעד —
// מיידית, לא smooth: גלילה חלקה משאירה את הטבעת רודפת אחרי היעד.
function useTargetRect(holeSel, targetSel, step) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!holeSel) { setRect(null); return; }
    let alive = true, raf = 0, ro = null, watched = null, scrolled = false;
    const schedule = () => { if (alive && !raf) raf = requestAnimationFrame(measure); };
    const measure = () => {
      raf = 0;
      if (!alive) return;
      const el = document.querySelector(holeSel);
      if (el && !scrolled) {
        scrolled = true;
        (document.querySelector(targetSel) || el).scrollIntoView({ block: "center", behavior: "auto" });
      }
      if (el !== watched) {
        ro?.disconnect(); ro = null; watched = el;
        if (el && typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(schedule); ro.observe(el); }
      }
      const r = el ? el.getBoundingClientRect() : null;
      const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    measure();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-tour", "hidden", "aria-expanded"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("animationend", schedule, true);
    document.addEventListener("transitionend", schedule, true);
    // רשת ביטחון למה שהצופים לא רואים (פונטים, תמונות שנטענות) — איטית, לא שעון
    const t = setInterval(schedule, 400);
    return () => {
      alive = false; mo.disconnect(); ro?.disconnect(); clearInterval(t);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      document.removeEventListener("transitionend", schedule, true);
    };
  }, [holeSel, targetSel, step]);
  return rect;
}

// ⚠️ The step index lives in MainApp, not here. A step can point INTO a full-screen view
// (the metrics screen), and MainApp returns that view from a different branch of its tree —
// React sees a different parent, unmounts the tour and mounts a fresh one, which with local
// state meant landing on the metrics screen and being thrown back to step 1.
export default function AppTour({ onNavigate, onDone, step = 0, onStep, aurora = false, metricsOff = false, demoItems = [] }) {
  // metricsOff restaurants have no metrics button at all — the steps that point at it
  // are filtered out, and they get the dedicated closing step instead.
  const LIST = (aurora ? AURORA_STEPS : STEPS)
    .filter((st) => !(metricsOff ? st.metricsStep : st.noMetricsOnly));
  const i = step;
  const setI = onStep;
  const s = LIST[i];
  const last = i === LIST.length - 1;
  // `hole` (optional) is what the spotlight leaves lit; `target` is what advances the
  // step. On a flashcard the waiter must READ the whole card while the cue points at
  // the rating row — dimming the answer they are rating defeats the step (Yotam, 3.9).
  const rect = useTargetRect(s.hole || s.target, s.target, i);

  const firedRef = useRef(-1);
  // The dish the waiter just rated — read off the card the moment the rating tap fires,
  // so the written test that follows asks about the exact card they saw.
  const [tourDish, setTourDish] = useState("");
  const [quizAnswer, setQuizAnswer] = useState([]);
  const vocab = useMemo(() => {
    try { return buildVocab(menuFromCards(demoItems || [])); } catch { return []; }
  }, [demoItems]);
  const go = useCallback((n) => {
    const back = n < i;
    // ⚠️ Going back has to land on a screen the app can actually be put back into.
    // Steps marked `deep` live inside a drill-down (a category, an open dish) that only
    // the waiter's own taps can reach, so stepping back past one rewinds to the last
    // reachable step instead of leaving a spotlight hunting for an element that is no
    // longer on screen — which is exactly what "stuck" looked like.
    if (back) while (n > 0 && LIST[n].deep) n--;
    const next = LIST[n];
    if (next?.tab) onNavigate?.(next.tab, back || !!next.reset);
    else if (back) {
      // "Back" moves the screen back too (user, 2026-08-23): a step that points at the
      // bottom nav has no tab of its own, so its backdrop is wherever the step before it
      // stood — walk backwards to the nearest step that names a tab, home if there is none.
      // Going forward we deliberately do NOT navigate for those steps: the tap the waiter
      // is about to make is what moves the app.
      let t = "home";
      for (let k = n; k >= 0; k--) { if (LIST[k]?.tab) { t = LIST[k].tab; break; } }
      onNavigate?.(t, true);
    }
    // Re-arm the tap detector for the steps we just left — without this, firedRef (the
    // double-tap guard) would swallow the tap on a revisited step.
    if (back) firedRef.current = n - 1;
    setI(n);
  }, [onNavigate, i]);

  // Advance when the waiter taps the real element. Capture phase so we see the tap even
  // though the element's own handler (open the menu, switch tab) also runs — both should
  // happen: the app moves AND the tour moves on. ⚠️ Synchronous (13.9): both updates land
  // within the same frame (the tour's in a microtask, the app's right after its onClick),
  // and the layout-effect measurement runs before that frame paints — the 40ms wait was a
  // visible beat of nothing. One advance per step, guarded by firedRef.
  useEffect(() => {
    if (!s.target) return;
    const onClick = (e) => {
      if (firedRef.current >= i) return;
      const el = document.querySelector(s.target);
      if (el && (el === e.target || el.contains(e.target))) {
        firedRef.current = i;
        if (s.captureDish) {
          const nm = document.querySelector('[data-tour="flashcard-name"]')?.textContent?.trim();
          if (nm) {
            setTourDish(nm);
            // The example test comes PRE-ANSWERED with the dish's real ingredients — the
            // waiter sees what a full answer looks like and only taps "send"
            // (Yotam, 3.9: "תשלים לבד מה הוא צריך לכתוב ושרק ילחץ להגיש").
            const it = (demoItems || []).find((d) => (d.name || "").trim() === nm);
            setQuizAnswer((it?.ingredients || []).filter(Boolean).slice(0, 8));
          }
        }
        go(i + 1);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [s.target, s.captureDish, i, go, demoItems]);

  // ⚠️ Timed effects must NOT depend on `go`: it is rebuilt every render (its onNavigate
  // prop is an inline arrow in MainApp), and MainApp re-renders every second while the
  // study-time ticker runs — a timer keyed on `go` was cleared and restarted before it
  // could ever fire (caught live by Yotam, 3.9).
  const goRef = useRef(go);
  goRef.current = go;

  // `skipIfMissing`: a step that only applies to some restaurants (an extra drill-down
  // level, a dish with no warning card) walks on by itself when its target is not on
  // screen after a short grace.
  useEffect(() => {
    if (!s.skipIfMissing || !s.target) return;
    const sel = s.target;
    const t = setTimeout(() => { if (!document.querySelector(sel)) goRef.current(i + 1); }, 150);
    return () => clearTimeout(t);
  }, [s.skipIfMissing, s.target, i]);

  // «לא רואים את זה?» רק אחרי חסד של 700ms בלי יעד — לא בפריים הראשון של כל צעד.
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    if (!s.target || rect) return;
    const t = setTimeout(() => setMissing(true), 700);
    return () => clearTimeout(t);
  }, [s.target, rect, i]);

  const pad = 6;
  const live = rect && {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  if (live) LAST_HOLE = live;
  // ארבעת המלבנים תמיד מורכבים — הגאומטריה היא שמשתנה, ולכן היא גולשת מיעד ליעד. בלי יעד חי (צעד
  // הסבר, או יעד שעוד לא נמדד) הגאומטריה קופאת במקום, ומלבן-כיסוי מלא נכנס ב-fade מעליה — בלי
  // «חור שקורס לקו» על מסך שזה עתה נפתח, ובלי זרקור על קואורדינטות של מסך קודם.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const hole = live;
  const geo = hole || LAST_HOLE || { top: vh / 2, left: vw / 2, width: 0, height: 0 };
  // The card must not cover the thing it is pointing at. `cardTop` pins it (the dish step:
  // the arrows and the warnings live at the bottom of that screen).
  const cardAtTop = s.cardTop ?? (hole ? hole.top + hole.height > vh * 0.55 : false);
  const stage = stageOf(LIST, i);

  // ⚠️ Portaled to <body> at z-100. The dish view (MenuBrowser's Overlay) is a body portal at
  // z-70 and the explain box at z-90 — the tour must sit above both (it points at the box).
  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none" dir="rtl">
      {/* Four rectangles around the target instead of one full-screen overlay: the hole in
          the middle is a real hole, so the tap lands on the app, not on the dimmer. */}
      <Dim clear={s.noDim} free={s.free} style={{ top: 0, left: 0, right: 0, height: geo.top }} />
      <Dim clear={s.noDim} free={s.free} style={{ top: geo.top + geo.height, left: 0, right: 0, bottom: 0 }} />
      <Dim clear={s.noDim} free={s.free} style={{ top: geo.top, left: 0, width: geo.left, height: geo.height }} />
      <Dim clear={s.noDim} free={s.free} style={{ top: geo.top, left: geo.left + geo.width, right: 0, height: geo.height }} />
      {/* הכיסוי המלא לצעד בלי יעד — נכנס ויוצא ב-fade, ולא חוסם כשיש חור או כשהצעד חופשי */}
      <Dim clear={s.noDim} free={s.free || !!hole} style={{ inset: 0, opacity: hole ? 0 : 1, transition: "opacity 160ms" }} />
      <div
        className="absolute rounded-2xl pointer-events-none animate-tour-ring"
        style={{ ...geo, opacity: hole ? 1 : 0, transition: `${GLIDE}, opacity 160ms` }}
      />

      {/* ⚠️ The dimming is viewport-wide on purpose, but the CARD is part of the app and
          must sit in the same phone-width column it does. Without this it stretched the
          full browser width on a desktop screen while the app stayed at max-w-md. */}
      <div
        key={cardAtTop ? "top" : "bottom"}
        className={`absolute inset-x-0 mx-auto w-full max-w-md pointer-events-auto bg-[#16181c] border-[#22252b] p-5 space-y-3 animate-tour-step ${
          cardAtTop
            ? "top-0 border-b rounded-b-3xl pt-[max(1.25rem,env(safe-area-inset-top))]"
            : "bottom-0 border-t rounded-t-3xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        }`}
      >
        {/* פס דק על השפה הפנימית של הכרטיס — כמה נשאר, בלי מספר צעד */}
        <div
          className="absolute inset-x-0 h-[2px] bg-[#22252b] overflow-hidden pointer-events-none"
          style={cardAtTop ? { bottom: 0 } : { top: 0 }}
        >
          <div
            className="h-full bg-[#22c08c] transition-[width] duration-300 ease-out"
            style={{ width: `${((i + 1) / LIST.length) * 100}%` }}
          />
        </div>
        <div key={i} className="animate-tour-step space-y-3">
          <div className="flex items-start gap-2.5">
            <span
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#22c08c,#0F5C46)" }}
            >
              <s.icon size={19} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-[#eef0f6] leading-snug">{gz(s.title)}</p>
              {stage > 0 && (
                <p className="text-[10px] font-bold text-[#5a5a6e] mt-0.5">שלב {stage} מתוך 3 · {STAGE_NAMES[stage]}</p>
              )}
            </div>
          </div>

          <p className="text-[13px] text-[#c4c4d4] leading-relaxed">{gz(s.body)}</p>

          {s.quiz ? (
            <div className="space-y-2.5" dir="rtl">
              <p className="text-[14px] font-black text-[#eef0f6]">מה יש ב<span className="text-[#22c08c]">{tourDish || "המנה"}</span>?</p>
              <AnswerInput vocab={vocab} values={quizAnswer} onChange={setQuizAnswer} label="מרכיבים" />
              <button
                disabled={quizAnswer.length === 0}
                onClick={() => { setQuizAnswer([]); go(i + 1); }}
                className="w-full py-3 min-h-[44px] rounded-xl font-black text-sm bg-[#22c08c] text-[#06231a] disabled:opacity-40"
              >
                שליחה
              </button>
              <p className="text-[11px] text-[#5a5a6e]">ככה נראית תשובה טובה. בבוחן האמיתי כותבים לבד — כאן רק לוחצים שליחה.</p>
            </div>
          ) : s.target ? (
            <>
              {/* No "next" button on purpose — the step ends when the waiter taps the real
                  thing. Reading about a screen and using it are not the same lesson. */}
              <div className="flex items-center gap-2 bg-[#15302b] border border-[#22c08c]/40 rounded-xl px-3 py-2.5">
                <Hand size={16} className="text-[#22c08c] flex-shrink-0" />
                <p className="text-[12px] font-black text-[#22c08c]">{gz(s.cue)}</p>
              </div>
              {missing && !s.skipIfMissing && (
                // The element isn't on screen (a restaurant with a single menu has no menu
                // list at all) — never leave the waiter stuck behind a tap that can't happen.
                <button
                  onClick={() => go(i + 1)}
                  className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#22252b] text-[#c4c4d4] text-xs font-bold"
                >
                  לא רואים את זה? אפשר להמשיך הלאה ←
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => (last ? onDone?.() : go(i + 1))}
              className={`w-full rounded-xl font-black bg-[#22c08c] text-[#06231a] ${s.ack ? "py-4 min-h-[52px] text-[16px]" : "py-3 min-h-[44px] text-sm"}`}
            >
              {last ? "יאללה, מתחילים" : s.ack ? gz(s.ack) : "הבא"}
            </button>
          )}

        </div>
        <div className="flex items-center justify-between">
          <button onClick={onDone} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">דילוג על הסיור</button>
          {i > 0 && (
            <button onClick={() => go(i - 1)} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">→ אחורה</button>
          )}
        </div>
      </div>
    </div>
  , document.body);
}
