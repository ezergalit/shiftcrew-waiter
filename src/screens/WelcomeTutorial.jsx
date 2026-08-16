import { useState } from "react";
import { ChevronRight, Home, Target, Sparkles, Utensils } from "lucide-react";

// Shown once, right after a brand-new team member is created (see TeamLogin.jsx's
// `showTutorial` flag — not shown when we just matched someone back to an existing
// profile). Slide 1 doubles as the "restaurant brief": the description/service notes
// the owner wrote during onboarding in the owner app (menu_app.restaurants), so new
// staff get that context instead of landing cold on an empty dashboard.
export default function WelcomeTutorial({ session, onDone }) {
  const [step, setStep] = useState(0);

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
          {session.restaurantServiceNotes && (
            <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3">
              <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">איך אנחנו מארחים כאן</p>
              <p className="text-sm text-[#eef0f6] leading-relaxed">{session.restaurantServiceNotes}</p>
            </div>
          )}
          {!session.restaurantDescription && !session.restaurantServiceNotes && (
            <p className="text-sm text-[#8a8aa0]">בהצלחה בלימוד התפריט!</p>
          )}
        </div>
      ),
    },
    {
      icon: Home,
      title: "איפה כל דבר",
      body: (
        <div className="space-y-2.5">
          {[
            ["בית", "מסך הפתיחה — אתגר יומי, מה קורה בצוות, וקיצורים למשחקים"],
            ["אתגרים", "כל משחקי הלמידה במקום אחד"],
            ["יומי", "עדכון יומי מהמנהל/ת — מה חסר, מה חדש, מה בתנור"],
            ["דירוג", "טבלת הצוות לפי נקודות"],
            ["תפריט", "ההתקדמות שלכם לפי קטגוריה — אפשר גם ללחוץ ולתרגל ישר משם"],
          ].map(([t, d]) => (
            <div key={t} className="flex items-start gap-2">
              <span className="text-sm font-black text-[#6d5efc] w-14 flex-shrink-0">{t}</span>
              <span className="text-sm text-[#c4c4d4]">{d}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Target,
      title: "איך לומדים",
      body: (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-black text-[#eef0f6]">כרטיסיות</p>
            <p className="text-xs text-[#8a8aa0]">לומדים בקצב שלכם, ומדרגים בעצמכם 1-5 כמה ידעתם</p>
          </div>
          <div>
            <p className="text-sm font-black text-[#eef0f6]">חידון · התאמה · מהירות · אלרגיות · התאימו תיאור למנה</p>
            <p className="text-xs text-[#8a8aa0]">משחקים שבודקים אתכם באמת — הציון נקבע לפי תשובה נכונה, לא לפי מה שתגידו על עצמכם</p>
          </div>
          <p className="text-xs text-[#8a8aa0] pt-1">מנה נחשבת "נלמדה" מציון 4/5 ומעלה — והציון יכול גם לרדת אם תטעו בה בהמשך.</p>
        </div>
      ),
    },
    {
      icon: Sparkles,
      title: "בואו נתחיל!",
      body: <p className="text-sm text-[#c4c4d4] text-center">תתחילו מהאתגר היומי בטאב "בית" ותצברו נקודות. בהצלחה!</p>,
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
            {last ? "בואו נתחיל" : "הבא"}
          </button>
        </div>
        {!last && (
          <button onClick={onDone} className="w-full text-center text-xs text-[#8a8aa0] font-bold pt-3">דלגו</button>
        )}
      </div>
    </div>
  );
}
