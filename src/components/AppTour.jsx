import { useState } from "react";
import { Home, BookOpen, BarChart3, GraduationCap, Wallet, Sparkles, X } from "lucide-react";

// First-run guided tour (user request, 2026-08-20): walks the waiter through the app
// function by function, ON the real screens — each step switches to the tab it talks
// about, with an explanation card pinned to the bottom. Shown once per member (the
// localStorage flag lives in MainApp); skippable at any point. This is the interactive
// counterpart to WelcomeTutorial's slides: that one says what the app is for, this one
// shows where everything actually is.
const STEPS = [
  {
    tab: "home", icon: Home, title: "מסך הבית — הבועה האישית",
    body: "כאן מתחילים: הבועה הירוקה למעלה אומרת שלום, כמה למדתם השבוע ובאיזה מקום אתם בצוות — וכשיש מנות חדשות בתפריט, היא תגיד לכם ותציע ללמוד אותן בלחיצה.",
  },
  {
    tab: "home", icon: Sparkles, title: "שני הכרטיסים — מה עכשיו?",
    body: "הכרטיס הסגול הוא העדכון היומי מהמנהל/ת — מה חסר, מה חדש, על מה ממליצים הערב. הכרטיס הירוק מציע את הקטגוריה הבאה ללמידה עם ההתקדמות שלכם בה. לחיצה על כל אחד מובילה ישר לשם.",
  },
  {
    tab: "home", icon: Sparkles, title: "התרגול — שישה משחקים",
    body: "כרטיסיות ללמידה בקצב שלכם, ועוד חמישה משחקים שבודקים אתכם באמת: חידון, התאמה, אלרגיות, מהירות והתאמת תיאור. נקודות נצברות רק במשחקים שבודקים — לא בדירוג עצמי.",
  },
  {
    tab: "daily", icon: BookOpen, title: "טאב יומי — העדכון מהמנהל/ת",
    body: "בכניסה הראשונה של כל יום העדכון יופיע לפני הכול, עם כמה שאלות הבנה קצרות. כאן אפשר לחזור עליו מתי שרוצים — כדאי להציץ לפני כל משמרת.",
  },
  {
    tab: "categories", icon: BarChart3, title: "טאב תפריט — הלמידה לפי קטגוריות",
    body: "כל קטגוריה פתוחה: לוחצים עליה, רואים את המנות אחת-אחת, ומתרגלים ברצף — מנה שמבינים (שני 5 ברצף) מסומנת ✓ והבאה נכנסת. כל 10 כרטיסיות תישאלו אם להמשיך או לעשות הפסקה.",
  },
  {
    tab: "categories", icon: GraduationCap, title: "המבחנים — זו המטרה",
    body: "כל קטגוריה מסתיימת במבחן עם שעון, ולמעלה מחכה מבחן התפריט המלא — עשרות שאלות על הכול. המשחקים הם האימון; הציונים במבחנים הם התעודה שלכם במסעדה, והמנהל/ת רואה אותם.",
  },
  {
    tab: "home", icon: Wallet, title: "המדדים שלכם — 📊 למעלה",
    body: "כפתור הגרף בפינה פותח את המדדים שלכם: טבעת השליטה בתפריט, המקום שלכם בדירוג הצוות — וגם ההכנסות שלכם, אם תבחרו לרשום בערב כמה הרווחתם במשמרת (רק אתם רואים את זה).",
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
