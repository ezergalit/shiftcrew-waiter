import { useState } from "react";
import { ChevronLeft, ChevronRight, Star, Play } from "lucide-react";

// Tutorial (הדרכה) — the comprehensive onboarding experience for new waiters
// Includes: welcome screen, video with chapters, editing for managers
export default function Tutorial({ onComplete }) {
  const [pane, setPane] = useState("welcome"); // welcome | video | lesson | preview | edit

  if (pane === "welcome") return <WelcomePane onNext={() => setPane("video")} />;
  if (pane === "video") return <VideoPane onNext={() => setPane("lesson")} onBack={() => setPane("welcome")} />;
  if (pane === "lesson") return <LessonPane onBack={() => setPane("video")} onComplete={() => setPane("preview")} />;
  if (pane === "preview") return <PreviewPane onEdit={() => setPane("edit")} onDone={() => onComplete?.()} />;
  if (pane === "edit") return <EditPane onBack={() => setPane("preview")} />;

  return null;
}

// ── Welcome screen ──────────────────────────────────────────────────────────
function WelcomePane({ onNext }) {
  return (
    <div className="h-full flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl font-black mb-2">ברוך הבא לסטודיו תל אביב</h1>
          <p className="text-[#8a8aa0] font-semibold">בואו נתחיל את ההדרכה שלך</p>
        </div>

        {/* Restaurant description */}
        <div className="space-y-4">
          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
            <p className="text-sm font-bold text-[#6d5efc] mb-1">אודות המסעדה</p>
            <p className="text-sm font-semibold text-[#c4c4d4]">
              מסעדה אסייתית עם נגיעת ביסטרו — הכול לשיתוף
            </p>
          </div>

          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
            <p className="text-sm font-bold text-[#6d5efc] mb-1">כיצד לפתוח שיחה עם לקוח</p>
            <p className="text-sm font-semibold text-[#c4c4d4] italic">
              "שלום ובברכה לסטודיו! אני {"{name}"}. רוצה משהו לשתות?"
            </p>
          </div>
        </div>

        <button onClick={onNext}
          className="w-full py-4 bg-gradient-to-r from-[#6d5efc] to-[#9b7bff] text-white font-black rounded-2xl shadow-[0_8px_24px_rgba(109,94,252,0.35)] active:scale-95">
          צפו בהדרכה בוידאו
        </button>
      </div>
    </div>
  );
}

// ── Video with chapters ──────────────────────────────────────────────────────
function VideoPane({ onNext, onBack }) {
  const chapters = [
    { num: 1, title: "התייחסות", desc: "רוצה משהו לשתות?", time: "0:12" },
    { num: 2, title: "שאלת אלרגיות", desc: "יש רגישויות שכדאי שנדע?", time: "0:34" },
    { num: 3, title: "הצגה עצמית והמסעדה", desc: "מי אני והיכן אנחנו", time: "0:58" },
    { num: 4, title: "הצגת המלצות", desc: "מה שווה לנסות היום", time: "1:20" },
    { num: 5, title: "לקיחת ההזמנה", desc: "חוזרים על ההזמנה יחד", time: "1:47" },
  ];

  return (
    <div className="h-full flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {/* Video placeholder */}
        <div className="bg-[#16181c] border border-[#22252b] rounded-2xl h-48 flex items-center justify-center relative">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6d5efc] to-[#9b7bff] flex items-center justify-center mx-auto mb-3">
              <Play size={28} className="text-white" />
            </div>
            <p className="text-sm font-bold text-[#c4c4d4]">וידאו הדרכה — 2:05</p>
          </div>
        </div>

        {/* Chapters */}
        <div className="space-y-2">
          {chapters.map((ch) => (
            <div key={ch.num} className="flex items-center gap-3 bg-[#16181c] border border-[#22252b] rounded-2xl p-3">
              <div className="w-8 h-8 rounded-full bg-[#6d5efc] flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                {ch.num}
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-[#eef0f6]">{ch.title}</p>
                <p className="text-xs text-[#8a8aa0] font-semibold">{ch.desc}</p>
              </div>
              <span className="text-xs font-bold text-[#c4c4d4] flex-shrink-0">{ch.time}</span>
            </div>
          ))}
        </div>

        <button onClick={onNext}
          className="w-full py-4 bg-gradient-to-r from-[#6d5efc] to-[#9b7bff] text-white font-black rounded-2xl shadow-[0_8px_24px_rgba(109,94,252,0.35)] active:scale-95">
          התחילו את ההדרכה המעשית
        </button>
      </div>

      <button onClick={onBack}
        className="px-5 py-3 border-t border-[#22252b] text-[#6d5efc] font-bold text-sm">
        חזרה
      </button>
    </div>
  );
}

// ── Practical lesson — approach customer training ────────────────────────────
function LessonPane({ onBack, onComplete }) {
  const [step, setStep] = useState(1); // 1-5 for each step in the flow
  const steps = [
    {
      title: "שלב 1: התייחסות",
      desc: "ניגש לשולחן תוך דקה",
      instruction: "בהגחלים ניגשים לשולחן תוך דקה — גם אם זה רק כדי לומר שלום ולהביא תפריטים.",
      question: "אחרי כמה זמן מהישיבה צריך לגשת לשולחן?",
      options: ["עד דקה ✓", "2-3 דקות", "5 דקות"],
      correct: 0
    },
    {
      title: "שלב 2: שאלת אלרגיות",
      desc: "בדוק חומריות מזון",
      instruction: "תמיד שאל על אלרגיות קודם לכל. זה חשוב לבטיחות הלקוח.",
      question: "באילו מקרים חייב לשאול על אלרגיות?",
      options: ["תמיד", "רק אם הלקוח ביקש", "לא חייב לשאול"],
      correct: 0
    },
    {
      title: "שלב 3: הצגה עצמית",
      desc: "הציג את עצמך ואת המסעדה",
      instruction: "תגיד את שמך ותספר קצת על המסעדה ועל המנות המיוחדות.",
      question: "כשמציגים את המסעדה, מה הכי חשוב?",
      options: ["להתלהמ על המנות המיוחדות", "להיות חם וידידותי", "לתת את התפריט בלי הקדמה"],
      correct: 1
    },
    {
      title: "שלב 4: הצגת המלצות",
      desc: "המלץ על מנות טובות",
      instruction: "בחר מנות שמתאימות לליקוח — לפי גדלת הקבוצה, תקציב, וטעמים.",
      question: "אילו מנות צריך להמליץ?",
      options: ["רק מנות יקרות", "מנות שמתאימות ללקוח", "לא חייב להמליץ"],
      correct: 1
    },
    {
      title: "שלב 5: לקיחת ההזמנה",
      desc: "חזור על ההזמנה",
      instruction: "כשמסיימים — חזור על כל ההזמנה בקול רם. תפסיק טעויות לפני שזה יגיע למטבח.",
      question: "למה חשוב לחזור על ההזמנה?",
      options: ["כדי לשמור על הלקוח", "כדי למנוע טעויות", "זה לא חשוב"],
      correct: 1
    }
  ];

  const current = steps[step - 1];

  if (step > steps.length) {
    return (
      <div className="h-full flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center justify-center text-center space-y-6">
          <div className="text-6xl">🎉</div>
          <h2 className="text-3xl font-black">כל הכבוד!</h2>
          <p className="text-lg text-[#c4c4d4]">סיימת את כל 5 השלבים בהצלחה</p>
          <p className="text-sm text-[#8a8aa0]">אתה/ת מוכנ/ה לעבודה בהגחלים</p>

          <button onClick={onComplete}
            className="mt-6 w-full py-4 bg-gradient-to-r from-[#6d5efc] to-[#9b7bff] text-white font-black rounded-2xl shadow-[0_8px_24px_rgba(109,94,252,0.35)] active:scale-95">
            עבור ללימוד התפריט
          </button>
        </div>
      </div>
    );
  }

  const handleAnswer = (selected) => {
    if (selected === current.correct) {
      setStep(step + 1);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[#8a8aa0]">שלב {step}/5</span>
            <span className="text-sm font-bold text-[#6d5efc]">{Math.round((step / 5) * 100)}%</span>
          </div>
          <div className="h-2 bg-[#22252b] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#6d5efc] to-[#9b7bff] rounded-full transition-all" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
        </div>

        {/* Step title */}
        <div>
          <h2 className="text-2xl font-black mb-1">{current.title}</h2>
          <p className="text-sm text-[#8a8aa0]">{current.desc}</p>
        </div>

        {/* Instruction */}
        <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
          <p className="text-sm font-semibold text-[#c4c4d4] leading-relaxed">
            {current.instruction}
          </p>
        </div>

        {/* Question */}
        <div className="bg-gradient-to-br from-[#241f3a] to-[#16181c] border border-[#2e2748] rounded-2xl p-4">
          <p className="text-sm font-bold text-[#eef0f6] mb-4">{current.question}</p>
          <div className="space-y-2">
            {current.options.map((opt, idx) => (
              <button key={idx} onClick={() => handleAnswer(idx)}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-right transition-all ${
                  idx === current.correct
                    ? "bg-[#15302b] border border-[#22c08c] text-[#22c08c]"
                    : "bg-[#16181c] border border-[#22252b] text-[#c4c4d4] hover:border-[#6d5efc]"
                }`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 px-5 py-4 border-t border-[#22252b]">
        <button onClick={onBack}
          className="flex-1 py-3 border border-[#22252b] text-[#6d5efc] font-bold rounded-xl hover:bg-[#16181c]">
          חזור
        </button>
      </div>
    </div>
  );
}

// ── Manager preview — show demo of what waiter sees ────────────────────────────
function PreviewPane({ onEdit, onDone }) {
  return (
    <div className="h-full flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-black mb-2">זה כך יראה למלצרים</h2>
          <p className="text-sm text-[#8a8aa0]">כל מה שראית כרגע — זה מה שהמלצרים שלך ילמדו</p>
        </div>

        <div className="space-y-4">
          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
            <p className="text-sm font-bold text-[#6d5efc] mb-2">✅ מסך הפתיחה</p>
            <p className="text-xs text-[#8a8aa0]">ברוך הבא עם תיאור המסעדה שלך</p>
          </div>

          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
            <p className="text-sm font-bold text-[#6d5efc] mb-2">✅ וידאו עם פרקים</p>
            <p className="text-xs text-[#8a8aa0]">5 שלבים בזרימת הלקוח (0:12–1:47)</p>
          </div>

          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
            <p className="text-sm font-bold text-[#6d5efc] mb-2">✅ אימון מעשי</p>
            <p className="text-xs text-[#8a8aa0]">5 שלבים עם שאלות Q&A כדי לבדוק הבנה</p>
          </div>

          <div className="bg-gradient-to-br from-[#241f3a] to-[#16181c] border border-[#2e2748] rounded-2xl p-4">
            <p className="text-sm font-bold text-[#9b7bff] mb-2">💡 כל זה ניתן לעריכה</p>
            <p className="text-xs text-[#8a8aa0]">לחץ על "עריכה" כדי להתאים את הכל לעצמך</p>
          </div>
        </div>

        <div className="space-y-3">
          <button onClick={onEdit}
            className="w-full py-4 bg-[#16181c] border border-[#6d5efc] text-[#6d5efc] font-black rounded-2xl active:scale-95">
            ✏️ התחילו לערוך
          </button>
          <button onClick={onDone}
            className="w-full py-4 bg-gradient-to-r from-[#6d5efc] to-[#9b7bff] text-white font-black rounded-2xl shadow-[0_8px_24px_rgba(109,94,252,0.35)] active:scale-95">
            ✅ סיימתי — מוכן לשימוש
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit tutorial (for managers) ──────────────────────────────────────────────
function EditPane({ onBack }) {
  const [restaurantName, setRestaurantName] = useState("סטודיו תל אביב");
  const [concept, setConcept] = useState("מסעדה אסייתית עם נגיעת ביסטרו");
  const [videoSource, setVideoSource] = useState("ai");
  const [steps, setSteps] = useState([
    { id: 1, prompt: "כמה זמן לגשת אל השולחן לאחר שהלקוח מתיישב?", answer: "דקה אחת" },
    { id: 2, prompt: "מה להגיד בהצגת עצמך?", answer: "שלום, אני [שמך]" },
    { id: 3, prompt: "מה לשאול לפני הצגת תפריט?", answer: "האם יש לך אלרגיות?" },
    { id: 4, prompt: "איזה מנות להמליץ?", answer: "המנות הפופולריות שלנו הן..." },
    { id: 5, prompt: "מה לעשות לפני שהלקוח הולך?", answer: "לאשר את ההזמנה בקול רם" }
  ]);
  const [draggedId, setDraggedId] = useState(null);

  const updateStep = (id, field, value) => {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addStep = () => {
    const newId = Math.max(...steps.map(s => s.id), 0) + 1;
    setSteps([...steps, { id: newId, prompt: "תאר את השלב החדש", answer: "" }]);
  };

  const deleteStep = (id) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const handleDragStart = (id) => {
    setDraggedId(id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const draggedIdx = steps.findIndex(s => s.id === draggedId);
    const targetIdx = steps.findIndex(s => s.id === targetId);
    const newSteps = [...steps];
    const dragged = newSteps[draggedIdx];
    newSteps.splice(draggedIdx, 1);
    newSteps.splice(targetIdx, 0, dragged);
    setSteps(newSteps);
    setDraggedId(null);
  };

  const generatePrompt = () => {
    return "הלקוח מתיישב\n" + steps.map((s, idx) => `${idx + 1}. ${s.answer}`).join("\n");
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-black">עריכת ההדרכה</h2>
          <button onClick={onBack} className="text-[#6d5efc] font-bold text-sm">חזרה</button>
        </div>

        {/* Restaurant info */}
        <div>
          <label className="text-sm font-bold text-[#8a8aa0] block mb-2">שם המסעדה</label>
          <input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)}
            className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-4 py-3 text-[#eef0f6] font-semibold focus:outline-none focus:border-[#6d5efc]" />
        </div>

        <div>
          <label className="text-sm font-bold text-[#8a8aa0] block mb-2">קונספט</label>
          <input value={concept} onChange={(e) => setConcept(e.target.value)}
            className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-4 py-3 text-[#eef0f6] font-semibold focus:outline-none focus:border-[#6d5efc]" />
        </div>

        {/* Video source selector */}
        <div>
          <label className="text-sm font-bold text-[#8a8aa0] block mb-3">מקור הסרטון</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { val: "upload", label: "העלו סרטון", desc: "קובץ מהמכשיר" },
              { val: "ai", label: "AI יוצר", desc: "בלי לצלם כלום" },
            ].map((opt) => (
              <button key={opt.val} onClick={() => setVideoSource(opt.val)}
                className={`p-4 rounded-2xl border-2 text-center transition-all ${
                  videoSource === opt.val
                    ? "border-[#6d5efc] bg-[#241f3a]"
                    : "border-[#22252b] bg-[#16181c]"
                }`}>
                <p className="text-sm font-black text-[#eef0f6]">{opt.label}</p>
                <p className="text-xs text-[#8a8aa0] font-semibold mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {videoSource === "ai" && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#2d2342] to-[#1a1528] border border-[#6d5efc] rounded-2xl p-3">
              <p className="text-xs text-[#9b7bff] font-bold">🎬 איך זה עובד:</p>
              <p className="text-xs text-[#c4c4d4] mt-1">
                סרטון ה-template שלך נשאר זהה. רק הקול משתנה לפי מה שאתה כותב כאן.
                <br/>כל מה שכותבים = בדיוק מה שיהיה בקול בסרטון! היה ספציפי וברור.
              </p>
            </div>

            <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
              <p className="text-sm font-bold text-[#6d5efc] mb-4">תאר את התהליך — השב לכל שלב:</p>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={() => handleDragStart(step.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(step.id)}
                    className={`bg-[#0c0d10] border-2 rounded-xl p-3 transition-all ${
                      draggedId === step.id
                        ? "border-[#6d5efc] opacity-50"
                        : "border-[#22252b] hover:border-[#6d5efc]"
                    } cursor-move`}>
                    <div className="flex items-start gap-3">
                      <span className="text-[#8a8aa0] font-black text-sm flex-shrink-0 mt-2">☰</span>
                      <div className="flex-1">
                        <p className="text-xs text-[#8a8aa0] font-semibold mb-2">{idx + 1}. {step.prompt}</p>
                        <input
                          value={step.answer}
                          onChange={(e) => updateStep(step.id, "answer", e.target.value)}
                          placeholder={`השב לשלב ${idx + 1}`}
                          className="w-full bg-[#16181c] border border-[#22252b] rounded-lg px-3 py-2 text-[#eef0f6] font-semibold text-sm focus:outline-none focus:border-[#6d5efc] text-right"
                        />
                      </div>
                      <button
                        onClick={() => deleteStep(step.id)}
                        className="text-[#ff6b6b] hover:text-[#ff5555] font-black text-lg flex-shrink-0 mt-2">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addStep}
                className="w-full mt-4 py-3 border-2 border-[#22252b] hover:border-[#6d5efc] text-[#8a8aa0] hover:text-[#6d5efc] font-bold rounded-lg transition-all">
                + הוסף שלב נוסף
              </button>
            </div>

            <div className="bg-gradient-to-br from-[#241f3a] to-[#16181c] border border-[#2e2748] rounded-2xl p-4">
              <p className="text-xs text-[#8a8aa0] font-semibold mb-2">🎬 זה מה שנשלח ל-AI:</p>
              <div className="bg-[#0c0d10] border border-[#22252b] rounded-lg p-3">
                <p className="text-xs text-[#eef0f6] font-mono leading-relaxed text-right whitespace-pre-wrap">{generatePrompt()}</p>
              </div>
            </div>
          </div>
        )}

        <button className="w-full py-4 bg-gradient-to-r from-[#6d5efc] to-[#9b7bff] text-white font-black rounded-2xl shadow-[0_8px_24px_rgba(109,94,252,0.35)] active:scale-95">
          שמור הדרכה
        </button>
      </div>
    </div>
  );
}
