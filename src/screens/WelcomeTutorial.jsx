import { useState } from "react";
import { ChevronRight, GraduationCap, Utensils } from "lucide-react";

// Shown once, right after a brand-new team member is created (see TeamLogin.jsx's
// `showTutorial` flag — not shown when we just matched someone back to an existing
// profile). Slide 1 doubles as the "restaurant brief": the description/service notes
// the owner wrote during onboarding in the owner app (menu_app.restaurants), so new
// staff get that context instead of landing cold on an empty dashboard.
export default function WelcomeTutorial({ session, onDone }) {
  const [step, setStep] = useState(0);
  // Trainee (learning-only) mode has no tasks tab — its tutorial only covers the menu
  // and learning sections (user, 2026-08-24: "a custom tutorial for waiters only with
  // the menu section").
  const trainee = !!session.trainee;

  const slides = [
    {
      icon: Utensils,
      title: `ברוכים הבאים${session.restaurantName ? ` ל-${session.restaurantName}` : ""}!`,
      body: (
        <div className="space-y-3">
          {session.restaurantCuisineTypes?.length > 0 && (
            <p className="text-sm text-[#c4c4d4]">{session.restaurantCuisineTypes.join(" · ")}</p>
          )}
          {session.restaurantDescription && (
            <p className="text-sm text-[#c4c4d4] leading-relaxed">{session.restaurantDescription}</p>
          )}
          {/* The full hosting guide is a reference, not a doormat — the welcome screen
              only points at it (user, 2026-08-24: "this shouldn't be the start page").
              It lives in the menu tab under "אודות המסעדה". */}
          {session.restaurantServiceNotes && (
            <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3">
              <p className="text-sm text-[#eef0f6] leading-relaxed">
                📖 יש לנו מדריך אירוח — כללי הבית, מה מגישים ואיך. תמצאו אותו בטאב
                התפריט, תחת <span className="font-black">״אודות המסעדה״</span>. שווה
                לקרוא לפני המשמרת הראשונה.
              </p>
            </div>
          )}
          {!session.restaurantDescription && !session.restaurantServiceNotes && (
            <p className="text-sm text-[#8a8aa0]">בהצלחה בלימוד התפריט!</p>
          )}
        </div>
      ),
    },
    // The "where is everything" and "how to learn" slides were cut on purpose: the
    // interactive tour (AppTour) opens right after this screen and teaches exactly those
    // two things by having the waiter tap the real elements. Reading the same lesson as
    // text first meant every new waiter sat through the whole explanation twice.
    {
      icon: GraduationCap,
      title: "המטרה: לעבור את מבחן התפריט",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-[#c4c4d4] leading-relaxed">
            התרגול כאן הוא לא המטרה — הוא האימון. המטרה היא לדעת את התפריט
            באמת: מרכיבים, אלרגיות, ומה עונים לאורח ששואל.
          </p>
          <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3 space-y-1.5">
            <p className="text-xs text-[#eef0f6] font-bold">🎓 כל קטגוריה מסתיימת בבוחן קצר עם שעון</p>
            <p className="text-xs text-[#eef0f6] font-bold">🏆 ובסוף — מבחן התפריט המלא, על הכול</p>
            <p className="text-[11px] text-[#8a8aa0]">המנהל/ת רואה את הציונים. את המבחן עצמו עושים במסעדה.</p>
          </div>
          <p className="text-sm text-[#c4c4d4] text-center pt-1">
            {trainee ? "מתחילים מהתפריט — בהצלחה!" : "מתחילים מהמשימות של היום — בהצלחה!"}
          </p>
        </div>
      ),
    },
  ];

  const s = slides[step];
  const last = step === slides.length - 1;

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 flex flex-col justify-center px-7 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] overflow-y-auto">
        <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          <s.icon size={26} />
        </div>
        <h1 className="text-2xl font-black mb-4">{s.title}</h1>
        {s.body}
      </div>
      <div className="px-7 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {slides.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-[#6d5efc]" : "w-1.5 bg-[#22252b]"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep((v) => v - 1)}
              className="px-4 py-3.5 rounded-2xl font-bold text-sm bg-[#16181c] border border-[#22252b] text-[#c4c4d4]">
              <ChevronRight size={18} />
            </button>
          )}
          <button
            onClick={() => (last ? onDone() : setStep((v) => v + 1))}
            className="flex-1 py-3.5 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0]"
          >
            {last ? "יאללה, מתחילים" : "הבא"}
          </button>
        </div>
        {!last && (
          <button onClick={onDone} className="w-full text-center text-xs text-[#8a8aa0] font-bold pt-3">דילוג</button>
        )}
      </div>
    </div>
  );
}
