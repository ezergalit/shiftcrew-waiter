import { useState } from "react";
import { BookOpen, ListChecks, GraduationCap, Wallet, Sparkles, X } from "lucide-react";

// First-run guided tour (user request, 2026-08-20): walks the waiter through the app
// function by function, ON the real screens — each step switches to the tab it talks
// about, with an explanation card pinned to the bottom. Shown once per member (the
// localStorage flag lives in MainApp); skippable at any point. This is the interactive
// counterpart to WelcomeTutorial's slides: that one says what the app is for, this one
// shows where everything actually is.
const STEPS = [
  {
    tab: "home", icon: ListChecks, title: "משימות — מה עליי היום",
    body: "זה המסך הראשון, והוא מחולק לשניים: 'משימות היום' — הבריף, הפתיחה, הסגירה ומה שהמנהל/ת שלחו למשמרת; ו'משימות כלליות' — למידת התפריט ותרגול. המספר הוא המקום שלכם בתור: סיימתם את 1, וזו שהייתה 2 הופכת ל-1.",
  },
  {
    tab: "home", icon: Sparkles, title: "כל משימה פותחת משהו",
    body: "אין כאן סימון ריק: הקשה על משימה לוקחת אתכם לעשות אותה — לעדכון היומי, לכרטיסיות, או להוראה של המנהל/ת עצמה. משימה שסיימתם הופכת ירוקה ויורדת למטה, והבאה בתור מסומנת. אין משימות היום? המסך פשוט יהיה ריק.",
  },
  {
    tab: "categories", icon: BookOpen, title: "תפריט — התפריט עצמו",
    body: "כאן חיים התפריטים של המסעדה: אוכל, סושי, קינוחים, בר ושתייה. נכנסים לתפריט, בוחרים קטגוריה — ומקבלים את המנות שבה. זה המקום להציץ באמצע משמרת כשאורח שואל.",
  },
  {
    tab: "categories", icon: Sparkles, title: "מנה נפתחת בגדול",
    body: "הקשה על מנה פותחת אותה על כל המסך: התיאור המלא, המרכיבים, ומה שחשוב לדעת — אלרגנים באדום, רגישות בהריון בסגול ומוקשים בצהוב. החצים למטה מעבירים למנה הבאה בלי לחזור לרשימה, אז אפשר פשוט לעבור על קטגוריה שלמה.",
  },
  {
    tab: "learn", icon: GraduationCap, title: "תרגול ובחינה — כאן לומדים",
    body: "בוחרים תפריט וקטגוריה ומתרגלים בכרטיסיות ברצף: מנה שאתם מכירים (שני 5 ברצף) מסומנת ✓ והבאה נכנסת במקומה. כל 10 כרטיסיות נשאל אם להמשיך או לעצור.",
  },
  {
    tab: "learn", icon: GraduationCap, title: "המבחנים — זו המטרה",
    body: "כל קטגוריה מסתיימת במבחן משלה, ורק אחרי שעוברים את כולן נפתח מבחן התפריט המלא — הוא הסיום, לא קיצור דרך. הציונים הם התעודה שלכם במסעדה והמנהל/ת רואה אותם; התרגול הוא האימון לקראתם.",
  },
  {
    tab: "home", icon: Wallet, title: "המדדים שלכם — 📊 למעלה",
    body: "כפתור הגרף בפינה פותח את המדדים: כמה מהתפריט אתם שולטים, המקום שלכם בצוות, וגם ההכנסות שלכם אם תבחרו לרשום בסוף משמרת כמה הרווחתם — רק אתם רואים את זה.",
  },
];

export default function AppTour({ onNavigate, onDone }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = (n) => {
    const next = STEPS[n];
    if (next && next.tab) onNavigate?.(next.tab);
    setI(n);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none" dir="rtl">
      {/* Dim everything except the explanation card — the real screen behind stays
          visible, because the whole point is pointing at the actual UI. */}
      <div className="absolute inset-0 bg-black/55 pointer-events-auto" />
      <div className="relative pointer-events-auto bg-[#16181c] border-t border-[#22252b] rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl text-white flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
              <s.icon size={19} />
            </span>
            <p className="text-sm font-black text-[#eef0f6] leading-snug">{s.title}</p>
          </div>
          <button onClick={onDone} title="סגירת הסיור"
            className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0] flex-shrink-0">
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-[#c4c4d4] leading-relaxed">{s.body}</p>
        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((_, j) => (
            <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? "w-6 bg-[#6d5efc]" : "w-1.5 bg-[#22252b]"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {i > 0 && (
            <button onClick={() => go(i - 1)}
              className="px-4 py-3 min-h-[44px] rounded-xl font-bold text-xs bg-[#22252b] text-[#c4c4d4]">
              הקודם
            </button>
          )}
          <button
            onClick={() => (last ? onDone() : go(i + 1))}
            className="flex-1 py-3 min-h-[44px] rounded-xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0]"
          >
            {last ? "סיימנו — בואו נתחיל!" : `הבא (${i + 1}/${STEPS.length})`}
          </button>
        </div>
        {!last && (
          <button onClick={onDone} className="w-full text-center text-[11px] text-[#8a8aa0] font-bold">דלגו על הסיור</button>
        )}
      </div>
    </div>
  );
}
