import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, ListChecks, GraduationCap, Wallet, Sparkles, Hand } from "lucide-react";

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
    body: "שלושה שלבים, בסדר הזה: קודם עוברים על התפריט וקוראים את המנות — מרכיבים, אלרגנים ומה חשוב לומר לאורח. אחר כך מתרגלים בכרטיסיות עד שמכירים. ובסוף נבחנים: מבחן לכל קטגוריה, ורק אחרי כולם — מבחן התפריט המלא.",
  },
  {
    tab: "categories", icon: BookOpen, title: "שלב 1 — התפריט עצמו",
    body: "כאן חיים כל התפריטים של המסעדה. נתחיל מלפתוח אחד.",
    target: '[data-tour="browse-menu"]', cue: "הקישו על תפריט כדי לפתוח אותו",
  },
  {
    tab: "categories", icon: BookOpen, title: "בחרו קטגוריה",
    body: "בתוך כל תפריט יש קטגוריות. הקישו על אחת כדי לראות את המנות שבה.",
    target: '[data-tour="browse-category"]', cue: "הקישו על קטגוריה",
  },
  {
    tab: "categories", icon: Sparkles, title: "כל מנה נפתחת בגדול",
    body: "הקשה על מנה פותחת אותה על כל המסך: התיאור המלא, המרכיבים, ומה שאסור לפספס — אלרגנים באדום, רגישות בהריון בסגול ומוקשים בצהוב. החצים למטה מעבירים למנה הבאה, אז אפשר לעבור על קטגוריה שלמה ברצף. ככה עוברים על התפריט לפני שמתחילים לתרגל.",
  },
  {
    tab: "learn", icon: GraduationCap, title: "שלב 2 — לתרגל",
    body: "כאן מתאמנים על מה שקראתם. נפתח קטגוריה ונראה איך זה עובד.",
    target: '[data-tour="learn-menu"], [data-tour="learn-category"]', cue: "הקישו כדי להיכנס",
  },
  {
    tab: "learn", icon: Sparkles, title: "כרטיסיות — עד שמכירים",
    body: "בתרגול מוצג שם המנה, אתם נזכרים מה יש בה, ואז מדרגים 1-5 כמה ידעתם. מנה שתדעו 5 פעמיים ברצף מסומנת ✓ ויוצאת מהסבב, והבאה נכנסת במקומה — כך שאתם מתקדמים ולא חוזרים על מה שכבר ידוע.",
  },
  {
    tab: "learn", icon: GraduationCap, title: "שלב 3 — המבחנים",
    body: "כשתכירו מספיק מנות בקטגוריה, יופיע שם כפתור מבחן — עם שעון. עוברים מבחן אחד לכל קטגוריה, ורק אחרי שעוברים את כולם נפתח מבחן התפריט המלא. הציונים הם התעודה שלכם במסעדה, והמנהל/ת רואה אותם.",
  },
  {
    tab: "home", icon: ListChecks, title: "ומה עושים כל יום?",
    body: "מסך המשימות הוא מה שפותחים בתחילת משמרת: 'משימות היום' — העדכון היומי ומה שהמנהל/ת שלחו; 'משימות כלליות' — הלימוד. כל משימה פותחת את מה שצריך לעשות, והמספר הוא המקום בתור.",
  },
  {
    tab: "home", icon: Wallet, title: "המדדים שלכם — 📊 למעלה",
    body: "כפתור הגרף בפינה פותח את המדדים: כמה מהתפריט אתם יודעים, המקום שלכם בצוות, וההכנסות שלכם אם תבחרו לרשום כמה הרווחתם בסוף משמרת — רק אתם רואים את זה.",
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

export default function AppTour({ onNavigate, onDone }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const rect = useTargetRect(s.target, i);

  const go = useCallback((n) => {
    const next = STEPS[n];
    if (next && next.tab) onNavigate?.(next.tab);
    setI(n);
  }, [onNavigate]);

  // Advance when the waiter taps the real element. Capture phase so we see the tap even
  // though the element's own handler (open the menu, switch tab) also runs — both should
  // happen: the app moves AND the tour moves on.
  // ⚠️ One advance per step, guarded by a ref. The handler waits 260ms so the screen can
  // change first, and a second tap in that window (or a tap on a target that is still on
  // screen in the NEXT step) would otherwise queue a second timeout carrying a stale `i`
  // and shove the tour backwards.
  const firedRef = useRef(-1);
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
    <div className="fixed inset-0 z-50 pointer-events-none" dir="rtl">
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
            <p className="text-[15px] font-black text-[#eef0f6] leading-snug">{s.title}</p>
            <p className="text-[10px] font-bold text-[#5a5a6e] mt-0.5">שלב {i + 1} מתוך {STEPS.length}</p>
          </div>
        </div>

        <p className="text-[13px] text-[#c4c4d4] leading-relaxed">{s.body}</p>

        {s.target ? (
          <>
            {/* No "next" button on purpose — the step ends when the waiter taps the real
                thing. Reading about a screen and using it are not the same lesson. */}
            <div className="flex items-center gap-2 bg-[#15302b] border border-[#22c08c]/40 rounded-xl px-3 py-2.5">
              <Hand size={16} className="text-[#22c08c] flex-shrink-0" />
              <p className="text-[12px] font-black text-[#22c08c]">{s.cue}</p>
            </div>
            {!rect && (
              // The element isn't on screen (a restaurant with a single menu has no menu
              // list at all) — never leave the waiter stuck behind a tap that can't happen.
              <button
                onClick={() => go(i + 1)}
                className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#22252b] text-[#c4c4d4] text-xs font-bold"
              >
                לא רואים את זה? המשיכו הלאה ←
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
