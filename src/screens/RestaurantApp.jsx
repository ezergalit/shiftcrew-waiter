import { useState, useMemo } from "react";
import {
  Sun, Sunset, Moon, Check, Trophy, GraduationCap, Bell, Flame, Repeat,
  HelpCircle, ChevronLeft, Soup, Utensils, IceCream, Wine, Layers, Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// RestaurantApp — אתר למסעדה יוונית "סלון יווני צומת סביון"
// Login → Learn Menu + Daily Brief + Team Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  card: "bg-[#161925] rounded-2xl border border-[#22252b]",
};

// סלון יווני צומת סביון - תפריט (רק מוצרים עם שם וחיר)
const GREEK_MENU = [
  // Greek Salads
  { id: "1", name: "Greek Caesar Salad", cat: "starters", price: 78, allergens: ["חלב"], description: "סלט קיסר בסגנון יווני עם עלי סלט הרומן טרי, פרמזן קשה, חומוס בתנור, ורוטב קיסר קלאסי", isSpecial: true },
  { id: "2", name: "Helios", cat: "starters", price: 78, allergens: ["חלב"], description: "סלט עדין עם גבינת פתה, עגבניות שרי, מלפפון, זיתים שחורים, ובורסט בצל אדום וזית צעיר" },

  // Greek Truffle Cream
  { id: "3", name: "Greek Truffle Cream 44", cat: "starters", price: 44, allergens: ["חלב"], description: "קרם שמנת משובח בטעם כמהין שחור, מוגש עם לחם ים לבן חם ומצעי עדשים" },
  { id: "4", name: "Greek Truffle Cream 38", cat: "starters", price: 38, allergens: ["חלב"], description: "קרם שמנת בטעם כמהין שחור, מוגש עם צלחת הורדבור וקרקרים" },
  { id: "5", name: "Greek Truffle Cream 48", cat: "starters", price: 48, allergens: ["חלב"], description: "קרם שמנת עשיר בטעם כמהין שחור, מוגש עם לחם בחמאה צעירה וזיתים" },

  // Greek Pasta Experience
  { id: "6", name: "Mykonos Tuna", cat: "mains", price: 98, allergens: ["דגים"], description: "פסטת פטוצ'יני טריה עם סלמון אדום וטונה בדקואז' וכוסקוס, סלט ירוק צעיר" },
  { id: "7", name: "Truffle Olympus", cat: "mains", price: 98, allergens: ["חלב"], description: "פסטה מטרופל שחור, בולוטיני אלפונסו, קציפת פרמזן, רוטב חמאה טריא" },
  { id: "8", name: "Greek Pomodoro", cat: "mains", price: 92, allergens: [], description: "פסטה עם רוטב עגבניות טרי (סן מרזנו), שום, בזיליקום, זית ירוק עתיק, ללא קרם" },
  { id: "9", name: "Santorini Puttanesca", cat: "mains", price: 96, allergens: ["דגים"], description: "פסטה לינגווינה עם זיתים שחורים, קישואים מלוחים, טונה ודגים, שום וגרדל מלח" },
  { id: "10", name: "Spanakopita Pasta", cat: "mains", price: 92, allergens: ["חלב"], description: "פסטה עם טעם בורקה יווני - תערובת תרד וגבינת פתה, רוטב שמנת, אייר קטיב" },
  { id: "11", name: "Greek Cheese Clouds", cat: "mains", price: 110, allergens: ["חלב"], description: "תופעה של מנה עשירה - פסטה משופרת עם שלוש גבינות יווניות, פרמזן, מוצרלה וגרדל" },

  // From the Sea
  { id: "12", name: "Sea Fish 155", cat: "mains", price: 155, allergens: ["דגים"], description: "דגה מלחה במעלה של 350-400 גרם, מיוד, צלויה בתנור כמו מצא יווני קלאסי, טחון וזית צעיר" },
  { id: "13", name: "Sea Tuna 168", cat: "mains", price: 168, allergens: ["דגים"], description: "סטייק טונה תופר בעובי שנתיים, מטוגן קל על משטח חם, טעם ים חזק וטרי" },
  { id: "14", name: "Sea Bass 165", cat: "mains", price: 165, allergens: ["דגים"], description: "בס ים שלם בגודל 350-400 גרם, צלוי בתנור עם לימון טרי, תרוצות וחמאה חמה" },
  { id: "15", name: "Full Sea Bass 600", cat: "mains", price: 600, allergens: ["דגים"], description: "בס ים שלם וכבד (1.2-1.5 קיל), צלוי אדום למטה - מנה מרשימה למשפחה או רביעייה" },

  // Desserts
  { id: "16", name: "Sweet Greek Finale", cat: "desserts", price: 72, allergens: ["חלב"], description: "סיום מתוק בסגנון יווני - בקלווה בדבש וחמאה פעימה, אגוזים וזרעי שומשום" },
  { id: "17", name: "Dessert 72", cat: "desserts", price: 72, allergens: [], description: "עוגת שוקולד אלגנטית עם פרווה של פירות טרי ויוגורט יווני קר" },
  { id: "18", name: "Dessert 55", cat: "desserts", price: 55, allergens: [], description: "פירות טרי בעונה (תלוי עונה) עם קצופת שוקולד בלבן וגלידה" },
  { id: "19", name: "Dessert 88", cat: "desserts", price: 88, allergens: [], description: "לובה יוונית מלוחה-מתוקה עם שכבות דבש, גבינה בלבן וגנדוזה" },
];

const CATS = {
  starters: { label: "ראשונות", icon: Soup },
  mains: { label: "עיקריות", icon: Utensils },
  desserts: { label: "קינוחים", icon: IceCream },
  drinks: { label: "קוקטיילים ויין", icon: Wine },
};

// Quiz builder
function buildQuiz(items) {
  return items.map((item) => {
    const wrong = GREEK_MENU.filter((m) => m.id !== item.id).slice(0, 2).map((m) => m.name);
    const choices = [item.name, ...wrong].sort(() => Math.random() - 0.5);
    return {
      id: item.id,
      q: `מה המחיר של ${item.name}?`,
      a: String(item.price),
      choices: choices.map((c) => (c === item.name ? String(item.price) : `${Math.random() * 50 + 30 | 0}₪`)),
    };
  });
}

// StatBox for progress
function StatBox({ icon: Icon, value, label }) {
  return (
    <div className={`${C.card} p-3.5 text-center`}>
      <Icon size={18} className="text-[#6d5efc] mx-auto mb-1.5" />
      <p className="text-lg font-black text-[#eef0f6]">{value}</p>
      <p className="text-xs font-bold text-[#8a8aa0]">{label}</p>
    </div>
  );
}

// LearnTab - the main learning interface
function LearnTab({ waiter, mastered, setMastered }) {
  const [mode, setMode] = useState("home");
  const [deck, setDeck] = useState([]);

  const menu = GREEK_MENU;
  const pct = menu.length > 0 ? Math.round((mastered.size / menu.length) * 100) : 0;

  const startFlash = (items) => { setDeck(items); setMode("flash"); };
  const startQuiz = (items) => { setDeck(items); setMode("quiz"); };
  const startMatch = (items) => { setDeck(items); setMode("match"); };
  const startSpeed = (items) => { setDeck(items); setMode("speed"); };
  const startDaily = () => { setDeck(menu.filter((m) => m.isSpecial)); setMode("daily"); };

  const learnItem = (id) => setMastered((s) => new Set([...s, id]));
  const daily = menu.filter((m) => m.isSpecial || Math.random() > 0.7);
  const special = menu.find((c) => c.isSpecial);

  // Simplified study modes
  if (mode === "flash") return <SimpleFlash items={deck} onKnown={learnItem} onDone={() => setMode("home")} />;
  if (mode === "quiz") return <SimpleQuiz items={deck} onCorrect={learnItem} onDone={() => setMode("home")} />;
  if (mode === "match") return <div className="p-5 text-center text-white">מצב התאמה בקרוב 🔄</div>;
  if (mode === "speed") return <div className="p-5 text-center text-white">מצב מהירות בקרוב ⚡</div>;
  if (mode === "daily") return <div className="p-5 text-center text-white">אתגר יומי בקרוב 🎯</div>;

  return (
    <div className="min-h-screen bg-[#0c0d10] text-white" dir="rtl">
      <div className="max-w-2xl mx-auto p-5 space-y-5">
        {/* Header */}
        <div className="pt-3">
          <h1 className="text-2xl font-black text-[#eef0f6]">לימוד התפריט</h1>
          <p className="text-xs text-[#8a8aa0] mt-1">סלון יווני צומת סביון • {waiter.name}</p>
        </div>

        {/* Daily Brief */}
        <div className="bg-gradient-to-br from-[#2d2342] to-[#1a1528] border border-[#6d5efc] rounded-2xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#9b7bff] mb-2">
            <Bell size={14} /> עדכון יומי מהמנהל
          </div>
          <div className="space-y-2 text-xs text-[#c4c4d4]">
            <p className="flex items-center gap-2">
              <span className="text-red-400">❌</span> חסרים: לימון טרי
            </p>
            <p className="flex items-center gap-2">
              <span className="text-yellow-400">⭐</span> <span className="font-bold">חדש: סלט יווני</span> — חשוב להמליץ
            </p>
            <p className="flex items-center gap-2">
              <span className="text-orange-400">📦</span> מנות בתנור עד 18:00
            </p>
          </div>
        </div>

        {/* Daily Practice */}
        <div className="rounded-3xl p-5 text-white shadow-[0_10px_30px_rgba(109,94,252,0.35)]" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          <div className="flex items-center gap-1.5 text-xs font-bold mb-2">
            <Sun size={14} /> תרגול יומי
          </div>
          <p className="text-lg font-black leading-snug">מנות להמליץ היום</p>
          <p className="text-sm text-white/85 font-semibold mt-1">{daily.length} פריטים{special ? ` · מנת היום: ${special.name}` : ""}</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => startFlash(daily)} className="bg-[#16181c] text-[#6d5efc] font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5 active:bg-white/90">
              <Layers size={16} /> כרטיסיות
            </button>
            <button onClick={() => startQuiz(daily)} className="bg-white/20 text-white font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5 active:bg-white/30">
              <HelpCircle size={16} /> חידון
            </button>
          </div>
        </div>

        {/* Study Modes */}
        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2.5">מצבי לימוד</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => startMatch(menu)} className="flex flex-col items-center justify-center gap-2 bg-[#16181c] border border-[#22252b] rounded-2xl p-4 active:scale-95 transition-transform">
              <Repeat size={18} className="text-[#f3a712]" />
              <span className="text-xs font-bold text-[#eef0f6]">התאמה</span>
              <span className="text-[10px] text-[#8a8aa0]">זוגות</span>
            </button>
            <button onClick={() => startSpeed(daily)} className="flex flex-col items-center justify-center gap-2 bg-[#16181c] border border-[#22252b] rounded-2xl p-4 active:scale-95 transition-transform">
              <Flame size={18} className="text-[#ff7a59]" />
              <span className="text-xs font-bold text-[#eef0f6]">מהירות</span>
              <span className="text-[10px] text-[#8a8aa0]">תחרות</span>
            </button>
            <button onClick={() => startDaily()} className="flex flex-col items-center justify-center gap-2 bg-[#16181c] border border-[#22252b] rounded-2xl p-4 active:scale-95 transition-transform">
              <Bell size={18} className="text-[#3a86ff]" />
              <span className="text-xs font-bold text-[#eef0f6]">אתגר יומי</span>
              <span className="text-[10px] text-[#8a8aa0]">בונוס</span>
            </button>
            <button onClick={() => startDaily()} className="flex flex-col items-center justify-center gap-2 bg-[#16181c] border border-[#22252b] rounded-2xl p-4 active:scale-95 transition-transform">
              <Zap size={18} className="text-[#1aa376]" />
              <span className="text-xs font-bold text-[#eef0f6]">דו-קרב</span>
              <span className="text-[10px] text-[#8a8aa0]">תחרות</span>
            </button>
          </div>
        </div>

        {/* Challenges Dashboard */}
        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2.5">🏆 דשבורד אתגרים</p>
          <div className="space-y-2">
            <div className={`${C.card} p-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔄</span>
                <div>
                  <p className="text-sm font-bold text-[#eef0f6]">התאמה</p>
                  <p className="text-xs text-[#8a8aa0]">גלול קלפים וזיהוי זוגות</p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#f3a712]">פעיל</span>
            </div>
            <div className={`${C.card} p-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔥</span>
                <div>
                  <p className="text-sm font-bold text-[#eef0f6]">מהירות</p>
                  <p className="text-xs text-[#8a8aa0]">30 שניות - זוכים הנקודות</p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#ff7a59]">פעיל</span>
            </div>
            <div className={`${C.card} p-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🎯</span>
                <div>
                  <p className="text-sm font-bold text-[#eef0f6]">אתגר יומי</p>
                  <p className="text-xs text-[#8a8aa0]">+50 בונוס ללמידה</p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#3a86ff]">פעיל</span>
            </div>
            <div className={`${C.card} p-3 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <div>
                  <p className="text-sm font-bold text-[#eef0f6]">דו-קרב</p>
                  <p className="text-xs text-[#8a8aa0]">תחרות מול חברים</p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#1aa376]">פעיל</span>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="grid grid-cols-2 gap-2.5">
          <StatBox icon={Trophy} value={`${pct}%`} label="שליטה" />
          <StatBox icon={GraduationCap} value={`${mastered.size}/${menu.length}`} label="פריטים" />
        </div>

        {/* Leaderboard */}
        <div className={`${C.card} overflow-hidden p-4`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#ff7a59]">1 מקום ממקומות</span>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-black text-[#eef0f6]">תחרות הצוות</p>
              <Trophy size={16} className="text-[#f3c14b]" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 py-2">
              <span className="w-5 text-center text-sm font-black text-[#f3c14b]">●</span>
              <div className="w-8 h-8 rounded-full bg-[#6d5efc] flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                {waiter.name.split(" ").map((w) => w[0]).join("")}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#6d5efc]">{waiter.name} (אני)</p>
                <p className="text-[10px] text-[#9a9ab0]">
                  <span className="flex items-center gap-0.5 inline">
                    <Flame size={10} className="text-[#ff7a59]" />
                    2 סדרה
                  </span>
                  {" "}
                  <span>+{mastered.size} היום</span>
                </p>
              </div>
              <span className="text-sm font-black text-[#eef0f6]">{mastered.size * 100}</span>
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2">לימוד לפי קטגוריה</p>
          <div className="space-y-2.5">
            {Object.entries(CATS).map(([key, c]) => {
              const items = menu.filter((m) => m.cat === key);
              const known = items.filter((m) => mastered.has(m.id)).length;
              const cpct = Math.round((known / items.length) * 100);
              const Icon = c.icon;
              return (
                <button key={key} onClick={() => startFlash(items)}
                  className={`w-full flex items-center gap-3 ${C.card} p-3.5 text-right active:scale-[0.99] transition-transform`}>
                  <div className="w-11 h-11 rounded-2xl bg-[#1c1e22] flex items-center justify-center flex-shrink-0">
                    <Icon size={19} className="text-[#6d5efc]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-[#eef0f6]">{c.label}</p>
                      <span className="text-[11px] font-bold text-[#8a8aa0]">{known}/{items.length}</span>
                    </div>
                    <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mt-1.5">
                      <div className="h-full bg-[#6d5efc] rounded-full" style={{ width: `${cpct}%` }} />
                    </div>
                  </div>
                  <ChevronLeft size={17} className="text-[#c4c4d4]" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="pb-5 text-center text-xs text-[#8a8aa0]">סלון יווני צומת סביון ©</div>
      </div>
    </div>
  );
}

// Simple Flashcard study
function SimpleFlash({ items, onKnown, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (i >= items.length) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex items-center justify-center p-5">
        <div className="text-center">
          <p className="text-3xl font-black text-[#eef0f6] mb-3">סיימת! 🎉</p>
          <p className="text-[#8a8aa0] mb-6">עברת על {items.length} מנות</p>
          <button onClick={onDone} className="bg-[#6d5efc] text-white font-bold py-3 px-8 rounded-2xl">
            חזרה
          </button>
        </div>
      </div>
    );
  }

  const item = items[i];
  return (
    <div className="min-h-screen bg-[#0c0d10] flex items-center justify-center p-5" dir="rtl">
      <div className="max-w-md w-full">
        <p className="text-xs font-bold text-[#8a8aa0] text-center mb-4">{i + 1} מתוך {items.length}</p>
        <div
          onClick={() => setRevealed(!revealed)}
          className={`${C.card} p-8 text-center cursor-pointer min-h-64 flex flex-col justify-center mb-4 transition-transform active:scale-95`}
        >
          {!revealed ? (
            <>
              <p className="text-sm text-[#8a8aa0] mb-2">לחץ כדי לגלות</p>
              <p className="text-2xl font-black text-[#6d5efc]">{item.name}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-[#8a8aa0] mb-2">תיאור</p>
              <p className="text-lg font-bold text-[#eef0f6] mb-3">{item.description}</p>
              <p className="text-sm text-[#9b7bff]">₪{item.price}</p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { onKnown(item.id); setI(i + 1); setRevealed(false); }}
            className="flex-1 bg-[#22c08c] text-white font-bold py-3 rounded-2xl active:scale-95"
          >
            ✓ ידעתי
          </button>
          <button
            onClick={() => { setI(i + 1); setRevealed(false); }}
            className="flex-1 bg-[#22252b] text-[#8a8aa0] font-bold py-3 rounded-2xl active:scale-95"
          >
            ⊘ דלג
          </button>
        </div>
      </div>
    </div>
  );
}

// Simple Quiz
function SimpleQuiz({ items, onCorrect, onDone }) {
  const [i, setI] = useState(0);
  const quiz = buildQuiz(items);

  if (i >= quiz.length) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex items-center justify-center p-5">
        <div className="text-center">
          <p className="text-3xl font-black text-[#eef0f6] mb-3">סיימת את החידון! 🎉</p>
          <button onClick={onDone} className="bg-[#6d5efc] text-white font-bold py-3 px-8 rounded-2xl">
            חזרה
          </button>
        </div>
      </div>
    );
  }

  const q = quiz[i];
  const handleAnswer = (ans) => {
    if (ans === q.a) onCorrect(q.id);
    setI(i + 1);
  };

  return (
    <div className="min-h-screen bg-[#0c0d10] p-5" dir="rtl">
      <div className="max-w-md mx-auto pt-8">
        <p className="text-xs font-bold text-[#8a8aa0] text-center mb-6">{i + 1} מתוך {quiz.length}</p>
        <p className="text-xl font-black text-[#eef0f6] mb-6 text-center">{q.q}</p>
        <div className="space-y-2">
          {q.choices.map((c, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(c)}
              className="w-full bg-[#22252b] hover:bg-[#2d3038] text-[#eef0f6] font-bold py-3 px-4 rounded-2xl text-center active:scale-95"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App with Login
// ─────────────────────────────────────────────────────────────────────────────

export default function RestaurantApp() {
  const [waiter, setWaiter] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mastered, setMastered] = useState(new Set());
  const [tab, setTab] = useState("learn");

  const handleLogin = () => {
    if (name.trim() && phone.trim()) {
      setWaiter({ id: phone, name, phone });
    }
  };

  if (!waiter) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex items-center justify-center p-5" dir="rtl">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            <div className="text-4xl font-black text-[#6d5efc] mb-2">🏛️</div>
            <h1 className="text-2xl font-black text-[#eef0f6]">סלון יווני</h1>
            <p className="text-sm text-[#8a8aa0] mt-1">צומת סביון</p>
            <p className="text-xs text-[#6d5efc] font-bold mt-3">מערכת למידת תפריט</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#8a8aa0] mb-2">שם מלא</label>
              <input
                type="text"
                placeholder="מישהו לוי"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#16181c] border border-[#22252b] rounded-2xl px-4 py-3 text-[#eef0f6] placeholder-[#8a8aa0] focus:outline-none focus:border-[#6d5efc]"
                onKeyPress={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#8a8aa0] mb-2">מספר טלפון</label>
              <input
                type="tel"
                placeholder="05X-XXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#16181c] border border-[#22252b] rounded-2xl px-4 py-3 text-[#eef0f6] placeholder-[#8a8aa0] focus:outline-none focus:border-[#6d5efc]"
                onKeyPress={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={!name.trim() || !phone.trim()}
              className="w-full bg-[#6d5efc] hover:bg-[#8b7dff] disabled:opacity-50 text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform"
            >
              כניסה לחשבון
            </button>
          </div>

          <p className="text-center text-xs text-[#8a8aa0] mt-6">
            כאן אתה יכול ללמוד את תפריט הסלון, להתחרות עם חברים, ולעדכן את עצמך בנתונים חדשים
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0c0d10]" dir="rtl">
      {/* Sidebar */}
      <div className="w-20 bg-[#0f1017] border-l border-[#22252b] flex flex-col items-center py-4 gap-2">
        <NavButton icon="📚" label="לימוד" active={tab === "learn"} onClick={() => setTab("learn")} />
        <NavButton icon="📋" label="יומי" active={tab === "daily"} onClick={() => setTab("daily")} />
        <NavButton icon="🏆" label="תחרויות" active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} />
        <NavButton icon="📂" label="קטגוריות" active={tab === "categories"} onClick={() => setTab("categories")} />
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {tab === "learn" && <LearnTab waiter={waiter} mastered={mastered} setMastered={setMastered} />}
        {tab === "daily" && <DailyBriefTab />}
        {tab === "leaderboard" && <LeaderboardTab waiter={waiter} />}
        {tab === "categories" && <CategoriesTab mastered={mastered} />}
      </div>
    </div>
  );
}

// Navigation Button
function NavButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
        active ? "bg-[#6d5efc] text-white" : "bg-[#16181c] text-[#8a8aa0] hover:bg-[#22252b]"
      }`}
    >
      <span className="text-xl">{icon}</span>
    </button>
  );
}

// Daily Brief Tab
function DailyBriefTab() {
  return (
    <div className="p-5" dir="rtl">
      <h1 className="text-2xl font-black text-[#eef0f6] mb-6">עדכון יומי</h1>
      <div className={`${C.card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">📋</span>
          <h2 className="text-lg font-bold text-[#eef0f6]">עדכוני היום</h2>
        </div>
        <div className="space-y-3 text-sm text-[#c4c4d4]">
          <p className="flex items-center gap-2"><span className="text-red-400">❌</span> חסרים: לימון טרי</p>
          <p className="flex items-center gap-2"><span className="text-yellow-400">⭐</span> חדש: לחם בתנור</p>
          <p className="flex items-center gap-2"><span className="text-orange-400">📦</span> מנות בתנור עד 18:00</p>
        </div>
      </div>
    </div>
  );
}

// Leaderboard Tab
function LeaderboardTab({ waiter }) {
  return (
    <div className="p-5" dir="rtl">
      <h1 className="text-2xl font-black text-[#eef0f6] mb-6">תחרויות הצוות</h1>
      <div className={`${C.card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🏆</span>
          <h2 className="text-lg font-bold text-[#eef0f6]">דירוג צוות</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 py-2 border-b border-[#22252b]">
            <span className="w-6 text-center text-[#f3c14b]">●</span>
            <div className="w-8 h-8 rounded-full bg-[#6d5efc] flex items-center justify-center text-white text-xs font-black">
              {waiter.name.split(" ").map((w) => w[0]).join("")}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#6d5efc]">{waiter.name} (אני)</p>
            </div>
            <span className="text-sm font-black text-[#eef0f6]">0 נק׳</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Categories Tab
function CategoriesTab({ mastered }) {
  const menu = GREEK_MENU;
  return (
    <div className="p-5" dir="rtl">
      <h1 className="text-2xl font-black text-[#eef0f6] mb-6">קטגוריות</h1>
      <div className="space-y-3">
        {Object.entries(CATS).map(([key, c]) => {
          const items = menu.filter((m) => m.cat === key);
          const known = items.filter((m) => mastered.has(m.id)).length;
          const Icon = c.icon;
          return (
            <div key={key} className={`${C.card} p-4 flex items-center gap-3`}>
              <Icon size={20} className="text-[#6d5efc]" />
              <div className="flex-1">
                <p className="font-bold text-[#eef0f6]">{c.label}</p>
                <p className="text-xs text-[#8a8aa0]">{known}/{items.length}</p>
              </div>
              <div className="w-24 h-2 bg-[#22252b] rounded-full overflow-hidden">
                <div className="h-full bg-[#6d5efc]" style={{ width: `${(known / items.length) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
