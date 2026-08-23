import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, ListChecks, GraduationCap, Wallet, Sparkles, Hand } from "lucide-react";
import { gz } from "../lib/shiftChoice";

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
    body: "לדוגמה: מנה עם תגית אדומה \u05f4שומשום\u05f4 היא מנה שאסור להגיש לאורח עם אלרגיה לשומשום, ותגית צהובה \u05f4חריף\u05f4 היא רק עניין של טעם. החצים למטה מעבירים למנה הבאה, אז אפשר לעבור על קטגוריה שלמה ברצף — וזה בדיוק מה שעושים לפני שמתחילים לתרגל.",
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
    body: "כשתכיר/י מספיק מנות בקטגוריה, יופיע בה כפתור בוחן — עם שעון. עוברים בוחן בכל קטגוריה, ורק אחרי שעוברים את כולם נפתח מבחן התפריט המלא — המבחן שלך על התפריט. את המבחן עצמו צריך לעשות במסעדה.",
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

// The target may not exist the moment the step opens (tab switch, list still rendering),
// so poll briefly rather than measure once.
function useTargetRect(selector, step) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!selector) { setRect(null); return; }
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const t = setInterval(measure, 300);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector, step]);
  return rect;
}

// ⚠️ The step index lives in MainApp, not here. A step can point INTO a full-screen view
// (the metrics screen), and MainApp returns that view from a different branch of its tree —
// React sees a different parent, unmounts the tour and mounts a fresh one, which with local
// state meant landing on the metrics screen and being thrown back to step 1.
export default function AppTour({ onNavigate, onDone, step = 0, onStep }) {
  const i = step;
  const setI = onStep;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const rect = useTargetRect(s.target, i);

  const firedRef = useRef(-1);
  const go = useCallback((n) => {
    const back = n < i;
    // ⚠️ Going back has to land on a screen the app can actually be put back into.
    // Steps marked `deep` live inside a drill-down (a category, an open dish) that only
    // the waiter's own taps can reach, so stepping back past one rewinds to the last
    // reachable step instead of leaving a spotlight hunting for an element that is no
    // longer on screen — which is exactly what "stuck" looked like.
    if (back) while (n > 0 && STEPS[n].deep) n--;
    const next = STEPS[n];
    if (next?.tab) onNavigate?.(next.tab, back || !!next.reset);
    else if (back) {
      // "Back" moves the screen back too (user, 2026-08-23): a step that points at the
      // bottom nav has no tab of its own, so its backdrop is wherever the step before it
      // stood — walk backwards to the nearest step that names a tab, home if there is none.
      // Going forward we deliberately do NOT navigate for those steps: the tap the waiter
      // is about to make is what moves the app.
      let t = "home";
      for (let k = n; k >= 0; k--) { if (STEPS[k]?.tab) { t = STEPS[k].tab; break; } }
      onNavigate?.(t, true);
    }
    // Re-arm the tap detector for the steps we just left — without this, firedRef (the
    // double-tap guard) would swallow the tap on a revisited step.
    if (back) firedRef.current = n - 1;
    setI(n);
  }, [onNavigate, i]);

  // Advance when the waiter taps the real element. Capture phase so we see the tap even
  // though the element's own handler (open the menu, switch tab) also runs — both should
  // happen: the app moves AND the tour moves on.
  // ⚠️ One advance per step, guarded by a ref. The handler waits 260ms so the screen can
  // change first, and a second tap in that window (or a tap on a target that is still on
  // screen in the NEXT step) would otherwise queue a second timeout carrying a stale `i`
  // and shove the tour backwards.
  useEffect(() => {
    if (!s.target) return;
    const onClick = (e) => {
      if (firedRef.current >= i) return;
      const el = document.querySelector(s.target);
      if (el && (el === e.target || el.contains(e.target))) {
        firedRef.current = i;
        setTimeout(() => go(i + 1), 260);   // let the screen change first
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [s.target, i, go]);

  // Scroll the target into view — a spotlight on something below the fold is just a
  // dimmed screen with nothing to tap.
  useEffect(() => {
    if (!s.target) return;
    const el = document.querySelector(s.target);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [s.target, i]);

  const pad = 6;
  const hole = rect && {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  // The card must not cover the thing it is pointing at.
  const cardAtTop = hole ? hole.top + hole.height > window.innerHeight * 0.55 : false;

  const Dim = ({ style }) => <div className="absolute bg-black/70 pointer-events-auto" style={style} />;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none" dir="rtl">
      {/* Four rectangles around the target instead of one full-screen overlay: the hole in
          the middle is a real hole, so the tap lands on the app, not on the dimmer. */}
      {hole ? (
        <>
          <Dim style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <Dim style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <Dim style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <Dim style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div
            className="absolute rounded-2xl pointer-events-none animate-pulse"
            style={{ ...hole, boxShadow: "0 0 0 3px #22c08c, 0 0 24px rgba(34,192,140,0.55)" }}
          />
        </>
      ) : (
        <Dim style={{ inset: 0 }} />
      )}

      <div
        className={`absolute inset-x-0 pointer-events-auto bg-[#16181c] border-[#22252b] p-5 space-y-3 ${
          cardAtTop
            ? "top-0 border-b rounded-b-3xl pt-[max(1.25rem,env(safe-area-inset-top))]"
            : "bottom-0 border-t rounded-t-3xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span
            className="w-10 h-10 rounded-xl text-white flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#22c08c,#0F5C46)" }}
          >
            <s.icon size={19} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-black text-[#eef0f6] leading-snug">{gz(s.title)}</p>
            <p className="text-[10px] font-bold text-[#5a5a6e] mt-0.5">שלב {i + 1} מתוך {STEPS.length}</p>
          </div>
        </div>

        <p className="text-[13px] text-[#c4c4d4] leading-relaxed">{gz(s.body)}</p>

        {s.target ? (
          <>
            {/* No "next" button on purpose — the step ends when the waiter taps the real
                thing. Reading about a screen and using it are not the same lesson. */}
            <div className="flex items-center gap-2 bg-[#15302b] border border-[#22c08c]/40 rounded-xl px-3 py-2.5">
              <Hand size={16} className="text-[#22c08c] flex-shrink-0" />
              <p className="text-[12px] font-black text-[#22c08c]">{gz(s.cue)}</p>
            </div>
            {!rect && (
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
            className="w-full py-3 min-h-[44px] rounded-xl font-black text-sm bg-[#22c08c] text-[#06231a]"
          >
            {last ? "יאללה, מתחילים" : "הבא"}
          </button>
        )}

        <div className="flex items-center justify-between">
          <button onClick={onDone} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">דלגו על הסיור</button>
          {i > 0 && (
            <button onClick={() => go(i - 1)} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">→ אחורה</button>
          )}
        </div>
      </div>
    </div>
  );
}
