import { useState } from "react";
import { ChevronRight, GraduationCap, Utensils, BookOpen } from "lucide-react";

// Shown once, right after a brand-new team member is created (see TeamLogin.jsx's
// `showTutorial` flag — not shown when we just matched someone back to an existing
// profile). Slide 1 doubles as the "restaurant brief": the description/service notes
// the owner wrote during onboarding in the owner app (menu_app.restaurants), so new
// staff get that context instead of landing cold on an empty dashboard.
//
// Restyled 2026-09-01 (user: the welcome video is advertising material now — in-app
// onboarding is these slides + the interactive AppTour that opens right after them).
// The slides stay LEAN on purpose: the tour teaches by making the waiter tap the real
// screens; repeating that lesson as text meant every new waiter sat through it twice.
export default function WelcomeTutorial({ session, onDone }) {
  const [step, setStep] = useState(0);
  const trainee = !!session.trainee;
  const tasksOff = session.features?.tasks === false;

  const slides = [
    {
      icon: Utensils,
      title: `ברוכים הבאים${session.restaurantName ? ` ל-${session.restaurantName}` : ""}!`,
      body: (
        <div className="space-y-3">
          {session.restaurantCuisineTypes?.length > 0 && (
            <p className="text-sm text-[#9fe8cd] font-bold">{session.restaurantCuisineTypes.join(" · ")}</p>
          )}
          {session.restaurantDescription && (
            <p className="text-[15px] text-[#d5d8e0] leading-relaxed">{session.restaurantDescription}</p>
          )}
          {/* The full hosting guide is a reference, not a doormat — the welcome screen
              only points at it (user, 2026-08-24: "this shouldn't be the start page").
              It lives in the menu tab under "אודות המסעדה". */}
          {session.restaurantServiceNotes && (
            <div className="rounded-2xl p-3.5 border border-[rgba(34,192,140,0.25)]"
              style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.10),rgba(15,92,70,0.14))" }}>
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
    {
      icon: BookOpen,
      title: "ככה זה עובד",
      body: (
        <div className="space-y-2.5">
          {[
            ["📖", "קוראים את התפריט", "כל מנה עם תמונה, תיאור, וצבעי האזהרה — מה שאסור לפספס לפני שמגישים."],
            ["🎴", "מתרגלים בכרטיסיות", "נזכרים מה יש במנה, הופכים ובודקים. שני 5 ברצף — והמנה בכיס."],
            ["🎓", "נבחנים", "בוחן קצר לכל קטגוריה — עונים בכתיבה, כמו לאורח אמיתי."],
          ].map(([e, t, d]) => (
            <div key={t} className="flex gap-3 items-start bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5">
              <span className="text-xl leading-none pt-0.5">{e}</span>
              <div>
                <p className="text-sm font-black text-[#eef0f6]">{t}</p>
                <p className="text-[12.5px] text-[#a8adb8] leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: GraduationCap,
      title: "המטרה: לעבור את מבחן התפריט",
      body: (
        <div className="space-y-3">
          <p className="text-[15px] text-[#d5d8e0] leading-relaxed">
            התרגול כאן הוא לא המטרה — הוא האימון. המטרה היא לדעת את התפריט
            באמת: מרכיבים, אלרגיות, ומה עונים לאורח ששואל.
          </p>
          <div className="rounded-2xl p-3.5 space-y-1.5 border border-[rgba(34,192,140,0.25)]"
            style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.10),rgba(15,92,70,0.14))" }}>
            <p className="text-[13px] text-[#eef0f6] font-bold">🎓 כל קטגוריה מסתיימת בבוחן קצר</p>
            <p className="text-[13px] text-[#eef0f6] font-bold">🏆 ובסוף — מבחן התפריט המלא, על הכול</p>
            <p className="text-[11px] text-[#8a8aa0]">המנהל/ת רואה את הציונים. את המבחן עצמו עושים במסעדה.</p>
          </div>
          <p className="text-sm text-[#d5d8e0] text-center pt-1 font-bold">
            {trainee || tasksOff ? "עכשיו נעשה סיבוב קצר באפליקציה — מתחילים מהתפריט!" : "עכשיו נעשה סיבוב קצר באפליקציה — בהצלחה!"}
          </p>
        </div>
      ),
    },
  ];

  const s = slides[step];
  const last = step === slides.length - 1;

  return (
    <div className="h-full max-w-md mx-auto flex flex-col text-[#eef0f6] relative overflow-hidden" dir="rtl"
      style={{ background: "#0c0d10" }}>
      {/* aurora glow — the same visual world as the app the waiter is about to enter */}
      <div aria-hidden className="absolute pointer-events-none"
        style={{ top: "-18%", right: "-25%", width: "80%", height: "48%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,192,140,0.20), transparent 68%)", filter: "blur(10px)" }} />
      <div aria-hidden className="absolute pointer-events-none"
        style={{ bottom: "-14%", left: "-20%", width: "70%", height: "40%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(15,92,70,0.30), transparent 70%)", filter: "blur(10px)" }} />

      <div className="flex-1 flex flex-col justify-center px-7 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] overflow-y-auto relative">
        <div key={step} className="animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl text-[#EEF0F6] flex items-center justify-center mb-5 shadow-lg"
            style={{ background: "linear-gradient(135deg,#22c08c,#0F5C46)", boxShadow: "0 8px 28px rgba(34,192,140,0.25)" }}>
            <s.icon size={26} />
          </div>
          <h1 className="text-2xl font-black mb-4" style={{ textWrap: "balance" }}>{s.title}</h1>
          {s.body}
        </div>
      </div>
      <div className="px-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] relative">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {slides.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-[#22c08c]" : "w-1.5 bg-[#22252b]"}`} />
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
            className="flex-1 py-3.5 rounded-2xl font-black text-[15px] text-[#06231a] active:opacity-90"
            style={{ background: "linear-gradient(135deg,#2ed49c,#17a374)" }}
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
