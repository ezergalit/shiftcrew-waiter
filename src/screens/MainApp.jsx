import { useMemo, useState, useEffect, useRef } from "react";
import {
  Home, CalendarDays, CalendarPlus, ListChecks, GraduationCap,
  Clock, MapPin, Users, Sun, Sunset, Moon, Check, Send, ChevronLeft,
  ChevronRight, Repeat, CheckCircle2, Circle, Sparkles, Flame, Trophy,
  Layers, RotateCcw, X, Utensils, Soup, IceCream, Wine, Bell, FileText,
  User, Settings, LogOut, HelpCircle, ArrowLeftRight, AlertTriangle,
  Leaf, Pencil, ScrollText, Upload, Camera, ClipboardPaste, ScanLine,
} from "lucide-react";
import { scWaiter, scOwnerPublic, ME_NAME } from "../lib/shiftcrew";

// The week the owner schedules/collects availability for. Both apps MUST agree on
// this key for the round-trip to line up (owner anchors on Sun 7.6.2026).
const WEEK_START = new Date(2026, 5, 7);
function isoDate(d) {
  const z = new Date(d);
  z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0, 10);
}
const WEEK_ISO = isoDate(WEEK_START);

// Hours between two "HH:MM" times, wrapping past midnight (22:00→02:00 = 4).
function spanHours(from, to) {
  if (!from || !to) return 0;
  const [fh, fm] = String(from).split(":").map(Number);
  const [th, tm] = String(to).split(":").map(Number);
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

// Which bucket a start time falls into — matches the owner's morning/evening/night
// split so the icon on a published shift reflects how the owner staffed it.
function bucketOf(from) {
  const h = parseInt(String(from || "0").split(":")[0], 10) || 0;
  if (h < 16) return "morning";
  if (h < 22) return "evening";
  return "night";
}

// ─────────────────────────────────────────────────────────────────────────────
// MainApp — the ShiftCrew WAITER app. The waiter reached here by entering a phone
// number the owner put on the roster (see App.jsx → WaiterLogin); there is no
// login/password. Light, modern theme (white cards, violet accent), 5-tab nav:
// בית · סידור · זמינות · משימות · לימוד. The learning tab is a Brainscape-style
// trainer over the menu the OWNER published (read live from shiftcrew_waiter), and
// the leaderboard persists to that same isolated schema. The scheduling views are
// still illustrative sample data. Identity (name/restaurant) comes from the
// granted access row passed in as `waiter`.
// ─────────────────────────────────────────────────────────────────────────────

const ME = { name: "נועה לוי", role: "מלצרית", rate: 52 };
let PLACE = "מסעדת הדגמה · דיזנגוף 100, ת״א";

const SHIFTS = {
  morning: { label: "בוקר", time: "09:00–16:00", hours: 7, icon: Sun },
  evening: { label: "ערב",  time: "16:00–23:00", hours: 7, icon: Sunset },
  night:   { label: "לילה", time: "22:00–03:00", hours: 5, icon: Moon },
};
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// Date for a weekday index within the scheduled week (e.g. "7.6").
function shiftDateLabel(dayIdx) {
  const d = new Date(WEEK_START); d.setDate(d.getDate() + dayIdx);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

// ── The restaurant's FULL menu — the rich card model the "AI" extracts ────────
const CATS = {
  starters: { label: "ראשונות",       icon: Soup },
  mains:    { label: "עיקריות",        icon: Utensils },
  desserts: { label: "קינוחים",         icon: IceCream },
  drinks:   { label: "קוקטיילים ויין", icon: Wine },
};
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];

// Each dish: grouped ingredients + modifications + allergens (not-suitable-for)
// + kosher + pitfall (the tricky thing to remember) + serving note.
const MENU = [
  { id: "m1", cat: "starters", name: "קרפצ'יו בקר", price: 62,
    groups: [
      { label: "בשר", items: ["אנטריקוט מיושן פרוס דק"] },
      { label: "ירוקים", items: ["רוקט", "שבבי פרמזן"] },
      { label: "רוטב", items: ["שמן כמהין", "לימון"] },
    ],
    allergens: ["חלב"],
    modifications: ["ניתן להגיש בלי פרמזן", "ניתן רוטב בצד"],
    kosher: false, tags: [],
    pitfall: "מוגש נא — חובה לוודא עם האורח", serving: "מנה אישית" },

  { id: "m2", cat: "starters", name: "קלמרי צרוב", price: 58,
    groups: [
      { label: "עיקר", items: ["טבעות קלמרי על הגריל"] },
      { label: "רוטב", items: ["איולי לימון"] },
      { label: "תיבול", items: ["פטרוזיליה", "צ'ילי טרי"] },
    ],
    allergens: ["ביצים", "רכיכות"],
    modifications: ["ניתן בלי איולי (בלי ביצים)"],
    kosher: false, tags: [],
    pitfall: "רכיכה — אסור לאלרגיים לפירות ים", serving: "מצוין לשיתוף" },

  { id: "m3", cat: "starters", name: "סלט עגבניות הקיץ", price: 48,
    groups: [
      { label: "ירקות", items: ["עגבניות שרי", "בצל סגול"] },
      { label: "תיבול", items: ["בזיליקום", "ויניגרט הדרים"] },
    ],
    allergens: [],
    modifications: ["ניתן בלי בצל", "ניתן להוסיף אבוקדו (+12)"],
    kosher: true, tags: ["טבעוני"],
    pitfall: "אין מוקשים — מנה בטוחה", serving: "מנה לשיתוף" },

  { id: "m4", cat: "starters", name: "פוקצ'ה הבית", price: 34,
    groups: [
      { label: "בצק", items: ["קמח", "שמרים"] },
      { label: "ציפוי", items: ["שמן זית", "רוזמרין", "מלח גס"] },
    ],
    allergens: ["גלוטן"],
    modifications: [],
    kosher: true, tags: ["צמחוני"],
    pitfall: "מכיל גלוטן — אין חלופה", serving: "מוגש לכל השולחן" },

  { id: "m5", cat: "mains", name: "אנטריקוט 300 גרם", price: 168,
    groups: [
      { label: "בשר", items: ["אנטריקוט מיושן 300 גרם"] },
      { label: "תוספת", items: ["צ'יפס בטטה"] },
      { label: "רוטב", items: ["רוטב פלפלת"] },
    ],
    allergens: [],
    modifications: ["רוטב בצד", "רמת עשייה לבחירה"],
    kosher: true, tags: [],
    pitfall: "תמיד לשאול רמת עשייה", serving: "מנה אישית" },

  { id: "m6", cat: "mains", name: "סלמון בגריל", price: 124,
    groups: [
      { label: "דג", items: ["פילה סלמון"] },
      { label: "תוספת", items: ["פירה אפונה"] },
      { label: "רוטב", items: ["חמאת לימון צרוב"] },
    ],
    allergens: ["דגים", "חלב"],
    modifications: ["ניתן בלי חמאה (בלי חלב)"],
    kosher: true, tags: [],
    pitfall: "החמאה ברוטב = מכיל חלב", serving: "מנה אישית" },

  { id: "m7", cat: "mains", name: "רביולי ריקוטה", price: 92,
    groups: [
      { label: "בצק", items: ["רביולי טרי"] },
      { label: "מילוי", items: ["ריקוטה", "תרד"] },
      { label: "רוטב", items: ["חמאת מרווה"] },
    ],
    allergens: ["גלוטן", "חלב", "ביצים"],
    modifications: [],
    kosher: true, tags: ["צמחוני"],
    pitfall: "שלושה אלרגנים — לשים לב", serving: "מנה אישית" },

  { id: "m8", cat: "mains", name: "המבורגר הבית", price: 78,
    groups: [
      { label: "בשר", items: ["קציצת בקר 220 גרם"] },
      { label: "תוספות", items: ["צ'דר", "בצל מקורמל"] },
      { label: "לחם", items: ["לחמניית בריוש"] },
    ],
    allergens: ["גלוטן", "חלב", "שומשום"],
    modifications: ["ניתן בלי גבינה", "לחמנייה ללא גלוטן", "רמת עשייה לבחירה"],
    kosher: false, tags: [],
    pitfall: "בשר + גבינה — לא כשר", serving: "מנה אישית" },

  { id: "m9", cat: "mains", name: "קארי ירקות", price: 74,
    groups: [
      { label: "ירקות", items: ["ירקות שורש"] },
      { label: "רוטב", items: ["קארי קוקוס"] },
      { label: "תוספת", items: ["אורז יסמין"] },
    ],
    allergens: [],
    modifications: ["רמת חריפות לבחירה"],
    kosher: true, tags: ["טבעוני", "חריף"],
    pitfall: "חריף — לתאם עם האורח", serving: "מנה אישית" },

  { id: "m10", cat: "desserts", name: "סופלה שוקולד", price: 46,
    groups: [
      { label: "בסיס", items: ["שוקולד", "חמאה", "ביצים"] },
      { label: "ליווי", items: ["גלידת וניל"] },
    ],
    allergens: ["גלוטן", "חלב", "ביצים"],
    modifications: [],
    kosher: true, tags: [],
    pitfall: "זמן הכנה 15 דק' — להזמין מראש", serving: "מנה אישית" },

  { id: "m11", cat: "desserts", name: "קרם ברולה", price: 42,
    groups: [
      { label: "קרם", items: ["שמנת", "וניל", "חלמונים"] },
      { label: "ציפוי", items: ["קרמל קשה"] },
    ],
    allergens: ["חלב", "ביצים"],
    modifications: [],
    kosher: true, tags: ["צמחוני"],
    pitfall: "אין מוקשים מיוחדים", serving: "מנה אישית" },

  { id: "m12", cat: "desserts", name: "סורבה פירות", price: 38,
    groups: [
      { label: "בסיס", items: ["תות", "מנגו"] },
    ],
    allergens: [],
    modifications: ["ניתן כדור בודד (-10)"],
    kosher: true, tags: ["טבעוני", "פרווה"],
    pitfall: "פרווה — מצוין לסיום ארוחה בשרית", serving: "מנה לשיתוף" },

  { id: "m13", cat: "drinks", name: "נגרוני", price: 52,
    groups: [
      { label: "אלכוהול", items: ["ג'ין", "קמפרי", "ורמוט אדום"] },
      { label: "גימור", items: ["קליפת תפוז"] },
    ],
    allergens: ["סולפיטים"],
    modifications: [],
    kosher: true, tags: ["אלכוהול"],
    pitfall: "מריר ועוצמתי — לתאר לאורח", serving: "מוגש על קרח" },

  { id: "m14", cat: "drinks", name: "אספרסו מרטיני", price: 54,
    groups: [
      { label: "אלכוהול", items: ["וודקה", "ליקר קפה"] },
      { label: "גימור", items: ["אספרסו טרי"] },
    ],
    allergens: [],
    modifications: [],
    kosher: true, tags: ["אלכוהול"],
    pitfall: "מכיל קפאין", serving: "מוגש מקציף, ללא קרח" },

  { id: "m15", cat: "drinks", name: "יין הבית לבן", price: 38,
    groups: [
      { label: "יין", items: ["סוביניון בלאן צונן"] },
    ],
    allergens: ["סולפיטים"],
    modifications: ["כוס / בקבוק"],
    kosher: true, tags: ["אלכוהול"],
    pitfall: "להגיש מצונן", serving: "כוס" },
];
const MENU_BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m]));
const SPECIALS = ["m6", "m10"];                              // מנת היום (manager)
const DAILY_IDS = ["m6", "m10", "m9", "m2", "m13", "m7"];    // today's AI set

// Obstacles (מכשולים) — guest-PREFERENCE hurdles, NOT medical allergens. Things
// some guests simply don't enjoy (spicy, bitter, raw, caffeine) that a good waiter
// flags proactively. Allergens answer "who can't eat this"; obstacles answer "who
// might not WANT this". Keyed by dish id; a dish absent here has no obstacles.
const OBSTACLES = {
  m1: ["מוגש נא"],
  m2: ["חריף קל", "מרקם ימי"],
  m5: ["רוטב פלפלת חריף-קל"],
  m9: ["חריף"],
  m13: ["מריר", "אלכוהול חזק"],
  m14: ["מכיל קפאין", "אלכוהול"],
};
// The obstacles for a card: explicit list on the card wins, else the curated map.
function cardObstacles(it) { return it.obstacles ?? OBSTACLES[it.id] ?? []; }

// Convert an owner-published menu row (shiftcrew_waiter.published_menu) into the
// rich flashcard shape the LearnTab uses. Published rows carry fewer fields than
// the local demo MENU, so we synthesize sensible defaults for owner-added dishes.
function pubToCard(p) {
  const cat = CATS[p.category] ? p.category : "mains";
  const groups = p.description
    ? [{ label: "תיאור", items: [p.description] }]
    : [{ label: "פריט", items: [p.name] }];
  return {
    id: "pub_" + p.source_item_id,
    cat, name: p.name, price: Number(p.price) || 0,
    groups, allergens: Array.isArray(p.allergens) ? p.allergens : [],
    modifications: [], kosher: true, tags: p.is_special ? ["מנת היום"] : [],
    // The restaurant's published menu doesn't carry obstacles yet, so flag it as
    // unknown — the card then prompts the waiter to check with the manager.
    obstacles: [], obstaclesUnknown: true,
    pitfall: p.is_special ? "מנת היום — להמליץ לאורחים" : "",
    serving: "מנה אישית",
  };
}

// Weekly team learning competition. ME's points climb as you master dishes
// (see TeamLeaderboard) so the demo reacts to studying. Colors match avatars.
const TEAM_LEARN = [
  { name: "עומר טל",   color: "#22c08c", pts: 2110, streak: 9, today: 18 },
  { name: "שירה אבני", color: "#ff7a59", pts: 1620, streak: 2, today: 6 },
  { name: "מאיה ברק",  color: "#e0315a", pts: 1290, streak: 0, today: 0 },
  { name: "איתי כהן",  color: "#f3a712", pts: 980,  streak: 1, today: 4 },
  { name: "יותם פרץ",  color: "#3a86ff", pts: 760,  streak: 3, today: 9 },
];
const ME_BASE_PTS = 1200; // ME starts mid-pack; each mastered dish adds points
const PTS_PER_CARD = 130;

const TABS = [
  { id: "home",     label: "בית",    icon: Home },
  { id: "schedule", label: "סידור",   icon: CalendarDays },
  { id: "avail",    label: "זמינות",  icon: CalendarPlus },
  { id: "tasks",    label: "משימות",  icon: ListChecks },
  { id: "learn",    label: "לימוד",   icon: GraduationCap },
];

// Theme tokens
const C = {
  primary: "#6d5efc",
  card: "bg-[#16181c] border border-[#22252b] rounded-3xl shadow-[0_2px_14px_rgba(30,25,70,0.05)]",
};

export default function MainApp({ waiter, onSignOut }) {
  // Drive the visible identity off the granted access row. These are module-level
  // so every child component (TopBar, schedule, settings) reflects them on render.
  if (waiter?.name) ME.name = waiter.name;
  if (waiter?.role) ME.role = waiter.role;
  if (waiter?.restaurantName) PLACE = waiter.restaurantName;

  const [tab, setTab] = useState("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mastered, setMastered] = useState(() => new Set());
  const learnItem = (id) => setMastered((p) => new Set(p).add(id));

  // The published schedule the OWNER pushed (shiftcrew_waiter.published_assignments).
  // null = loading, [] = nothing published yet.
  const myName = waiter?.name || ME.name;
  const [schedRows, setSchedRows] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await scWaiter
        .from("published_assignments")
        .select("day_of_week, shift_label, waiter_name, from_time, to_time, position_name, color")
        .eq("week_start", WEEK_ISO)
        .order("day_of_week", { ascending: true });
      if (!alive) return;
      if (error) { console.error("[shiftcrew] schedule load failed:", error); setSchedRows([]); return; }
      setSchedRows(data || []);
    })();
    return () => { alive = false; };
  }, []);

  // My shifts for the week + who else works each of those days (coworkers).
  const myShifts = useMemo(() => {
    if (!Array.isArray(schedRows)) return [];
    return schedRows
      .filter((r) => r.waiter_name === myName)
      .map((r) => ({
        day: r.day_of_week,
        date: shiftDateLabel(r.day_of_week),
        position: r.position_name,
        from: r.from_time, to: r.to_time,
        hours: spanHours(r.from_time, r.to_time),
        bucket: bucketOf(r.from_time),
        color: r.color,
        coworkers: [...new Set(schedRows
          .filter((c) => c.day_of_week === r.day_of_week && c.waiter_name !== myName)
          .map((c) => c.waiter_name))],
      }))
      .sort((a, b) => a.day - b.day || a.from.localeCompare(b.from));
  }, [schedRows, myName]);

  const totals = useMemo(() => {
    const hours = myShifts.reduce((s, x) => s + x.hours, 0);
    return { count: myShifts.length, hours: Math.round(hours) };
  }, [myShifts]);

  const published = Array.isArray(schedRows) && schedRows.length > 0;
  const loadingSched = schedRows === null;

  return (
    <div className="h-full flex flex-col max-w-md mx-auto bg-[#0c0d10] text-[#eef0f6] relative" dir="rtl">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "home"     && <HomeTab totals={totals} myShifts={myShifts} loading={loadingSched} go={setTab} mastered={mastered} onAvatar={() => setSettingsOpen(true)} />}
        {tab === "schedule" && <ScheduleTab totals={totals} myShifts={myShifts} published={published} loading={loadingSched} onAvatar={() => setSettingsOpen(true)} />}
        {tab === "avail"    && <AvailTab waiter={waiter} onAvatar={() => setSettingsOpen(true)} />}
        {tab === "tasks"    && <TasksTab go={setTab} onAvatar={() => setSettingsOpen(true)} />}
        {tab === "learn"    && <LearnTab mastered={mastered} learnItem={learnItem} onAvatar={() => setSettingsOpen(true)} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />

      {settingsOpen && (
        <div className="absolute inset-0 z-50 bg-[#0c0d10] flex flex-col">
          <SettingsScreen onBack={() => setSettingsOpen(false)} onSignOut={onSignOut} waiter={waiter} restaurantName={waiter?.restaurantName} />
        </div>
      )}
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ title, subtitle, onAvatar }) {
  return (
    <div className="bg-[#0c0d10]/90 backdrop-blur px-5 pt-6 pb-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-black text-[#eef0f6] leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-[#8a8aa0] font-semibold mt-0.5">{subtitle}</p>}
      </div>
      <button onClick={onAvatar} className="w-10 h-10 rounded-full bg-[#6d5efc] text-white font-black flex items-center justify-center shadow-[0_4px_12px_rgba(109,94,252,0.35)] active:scale-95 transition-transform">
        {ME.name.split(" ").map((w) => w[0]).join("")}
      </button>
    </div>
  );
}

// ── 1. Home ─────────────────────────────────────────────────────────────────
function HomeTab({ totals, myShifts, loading, go, mastered, onAvatar }) {
  const next = myShifts[0];
  const s = next ? (SHIFTS[next.bucket] || SHIFTS.evening) : null;
  return (
    <>
      <TopBar title={`שלום, ${ME.name.split(" ")[0]} 👋`} subtitle={ME.role} onAvatar={onAvatar} />
      <div className="px-5 pb-4 space-y-5">
        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2">המשמרת הבאה</p>
          {next ? (
            <div className="rounded-3xl p-5 text-white shadow-[0_10px_30px_rgba(109,94,252,0.35)]" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-lg">{next.position}</span>
                <span className="text-xs font-bold flex items-center gap-1"><s.icon size={14} /> {s.label}</span>
              </div>
              <p className="text-2xl font-black">{DAYS[next.day]} · {next.date}</p>
              <p className="text-sm font-semibold text-white/85 mt-1 flex items-center gap-1.5" dir="ltr"><Clock size={14} /> {next.from}–{next.to} · {next.hours} ש׳</p>
              <p className="text-sm font-semibold text-white/85 mt-1 flex items-center gap-1.5"><MapPin size={14} /> {PLACE}</p>
            </div>
          ) : (
            <div className={`${C.card} p-5 text-center`}>
              <CalendarDays size={28} className="mx-auto text-[#c4c4d4] mb-2" />
              <p className="text-sm font-bold text-[#c4c4d4]">{loading ? "טוען את הסידור…" : "הסידור עדיין לא פורסם"}</p>
              {!loading && <p className="text-xs text-[#8a8aa0] font-semibold mt-1">ברגע שהמנהל/ת יפרסם — המשמרות שלך יופיעו כאן</p>}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2">השבוע במספרים</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat value={totals.count} label="משמרות" />
            <Stat value={totals.hours} label="שעות" />
          </div>
        </div>

        {/* Menu-learning shortcut (the side feature) */}
        <button onClick={() => go("learn")}
          className={`w-full flex items-center gap-3 ${C.card} p-4 text-right active:scale-[0.99] transition-transform`}>
          <div className="w-11 h-11 rounded-2xl bg-[#241f3a] flex items-center justify-center flex-shrink-0">
            <GraduationCap size={20} className="text-[#6d5efc]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[#eef0f6]">לימוד התפריט</p>
            <p className="text-xs text-[#8a8aa0] font-semibold mt-0.5">{mastered.size}/{MENU.length} פריטים נלמדו · תרגול יומי מחכה</p>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-black text-[#ff7a59] bg-[#33290f] px-2 py-1 rounded-lg flex-shrink-0"><Flame size={12} /> 4</span>
        </button>

        <button onClick={() => go("avail")}
          className={`w-full flex items-center gap-3 ${C.card} p-4 text-right active:scale-[0.99] transition-transform`}>
          <div className="w-11 h-11 rounded-2xl bg-[#1c1e22] flex items-center justify-center flex-shrink-0">
            <CalendarPlus size={19} className="text-[#8a8aa0]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[#eef0f6]">הגשת זמינות לשבוע הבא</p>
            <p className="text-xs text-[#8a8aa0] font-semibold mt-0.5">נסגר ביום חמישי 12:00 · טרם הוגש</p>
          </div>
          <ChevronLeft size={18} className="text-[#c4c4d4]" />
        </button>
      </div>
    </>
  );
}

// ── 2. Work schedule ──────────────────────────────────────────────────────────
function ScheduleTab({ totals, myShifts, published, loading, onAvatar }) {
  const weekEnd = new Date(WEEK_START); weekEnd.setDate(weekEnd.getDate() + 6);
  const range = `${WEEK_START.getDate()}.${WEEK_START.getMonth() + 1} – ${weekEnd.getDate()}.${weekEnd.getMonth() + 1}`;
  return (
    <>
      <TopBar title="סידור עבודה" subtitle="המשמרות שלי לשבוע זה" onAvatar={onAvatar} />
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button className="w-8 h-8 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] shadow-sm"><ChevronRight size={18} /></button>
          <p className="text-sm font-black">{range}</p>
          <button className="w-8 h-8 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] shadow-sm"><ChevronLeft size={18} /></button>
        </div>

        {published ? (
          <>
            <div className="flex items-center gap-2 bg-[#15302b] text-[#22c08c] rounded-2xl px-3 py-2.5 mb-4 text-xs font-bold">
              <CheckCircle2 size={15} /> הסידור פורסם
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <Stat value={totals.count} label="משמרות" />
              <Stat value={totals.hours} label="שעות" />
            </div>

            {myShifts.length === 0 ? (
              <div className={`${C.card} p-6 text-center`}>
                <p className="text-sm font-bold text-[#c4c4d4]">לא שובצת למשמרות השבוע</p>
                <p className="text-xs text-[#8a8aa0] font-semibold mt-1">דבר/י עם המנהל/ת אם זו טעות</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {myShifts.map((x, i) => {
                  const s = SHIFTS[x.bucket] || SHIFTS.evening;
                  return (
                    <div key={`${x.day}-${x.from}-${i}`} className={`${C.card} p-4`}>
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#1c1e22] flex items-center justify-center flex-shrink-0">
                          <s.icon size={18} className="text-[#6d5efc]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-black">{DAYS[x.day]} · {x.date}</p>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-[#241f3a] text-[#6d5efc]">{x.position}</span>
                          </div>
                          <p className="text-xs text-[#8a8aa0] font-semibold flex items-center gap-1 mt-1" dir="ltr"><Clock size={12} /> {x.from}–{x.to} · {x.hours} שעות</p>
                          {x.coworkers.length > 0 && (
                            <p className="text-xs text-[#a0a0b4] font-semibold flex items-center gap-1 mt-0.5"><Users size={12} /> איתך: {x.coworkers.join(", ")}</p>
                          )}
                        </div>
                      </div>
                      <button className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-[#6d5efc] bg-[#0c0d10] rounded-xl py-2 active:bg-[#22252b]">
                        <Repeat size={13} /> בקשת החלפת משמרת
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className={`${C.card} p-8 text-center`}>
            <CalendarDays size={32} className="mx-auto text-[#c4c4d4] mb-3" />
            <p className="text-sm font-black text-[#c4c4d4]">{loading ? "טוען את הסידור…" : "הסידור עדיין לא פורסם"}</p>
            {!loading && <p className="text-xs text-[#8a8aa0] font-semibold mt-1">ברגע שהמנהל/ת יפרסם את הסידור — המשמרות שלך יופיעו כאן</p>}
          </div>
        )}
      </div>
    </>
  );
}

// ── 3. Availability ───────────────────────────────────────────────────────────
// The waiter submits for the SAME week the owner schedules (WEEK_START), so the
// owner's auto-fill reads it back from shiftcrew_owner.availability.
const AVAIL_WEEK_START = WEEK_START;
const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function AvailTab({ waiter, onAvatar }) {
  const [mode, setMode] = useState("weekly");
  const [weekly, setWeekly] = useState({});
  const [deflt, setDeflt] = useState({});
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const staffId = waiter?.staff_id || null;
  const restId = waiter?.restaurant_id || null;

  // Pull back what this waiter already submitted for the week so the grid opens
  // pre-filled (and re-submitting feels like an edit, not a fresh start).
  useEffect(() => {
    if (!staffId) return;
    let alive = true;
    (async () => {
      const { data, error } = await scOwnerPublic
        .from("availability")
        .select("day_of_week, bucket, pref")
        .eq("staff_id", staffId).eq("week_start", WEEK_ISO);
      if (!alive || error || !data) return;
      const next = {};
      data.forEach((r) => { next[`${r.day_of_week}-${r.bucket}`] = true; });
      setWeekly(next);
      if (Object.keys(next).length) setSent(true);
    })();
    return () => { alive = false; };
  }, [staffId]);

  const sel = mode === "weekly" ? weekly : deflt;
  const setSel = mode === "weekly" ? setWeekly : setDeflt;

  const toggle = (k) => { setSent(false); setSel((p) => ({ ...p, [k]: !p[k] })); };
  const selectAllShift = (sk) => {
    setSent(false);
    setSel((p) => {
      const keys = DAYS.map((_, di) => `${di}-${sk}`);
      const allOn = keys.every((k) => p[k]);
      const n = { ...p };
      keys.forEach((k) => { n[k] = !allOn; });
      return n;
    });
  };
  const count = Object.values(sel).filter(Boolean).length;

  // Persist the weekly grid to shiftcrew_owner.availability: clear this waiter's
  // rows for the week, then insert one row per selected cell (pref "want").
  const submit = async () => {
    if (mode !== "weekly" || !staffId || !restId) { setSent(true); return; }
    setSaving(true); setErr("");
    try {
      await scOwnerPublic.from("availability").delete()
        .eq("staff_id", staffId).eq("week_start", WEEK_ISO);
      const rows = Object.entries(weekly)
        .filter(([, on]) => on)
        .map(([k]) => {
          const [di, bucket] = k.split("-");
          return {
            restaurant_id: restId, staff_id: staffId, week_start: WEEK_ISO,
            day_of_week: Number(di), bucket, pref: "want",
          };
        });
      if (rows.length) {
        const { error } = await scOwnerPublic.from("availability").insert(rows);
        if (error) throw error;
      }
      setSent(true);
    } catch (e) {
      console.error("[shiftcrew] availability submit failed:", e);
      setErr("השליחה נכשלה — נסה/י שוב");
    } finally {
      setSaving(false);
    }
  };

  const weekEnd = new Date(AVAIL_WEEK_START); weekEnd.setDate(weekEnd.getDate() + 6);
  const rangeLabel = `${AVAIL_WEEK_START.getDate()} ב${MONTHS_HE[AVAIL_WEEK_START.getMonth()]} - ${weekEnd.getDate()} ב${MONTHS_HE[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return (
    <>
      <TopBar title="זמינות" subtitle="הגשה עד חמישי 12:00" onAvatar={onAvatar} />

      <div className="flex gap-1 bg-[#16181c] border border-[#22252b] rounded-2xl p-1 mx-5 mb-4 shadow-sm">
        {[["weekly", "שבועי"], ["default", "ברירת מחדל"]].map(([k, label]) => {
          const active = mode === k;
          return (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${active ? "bg-[#6d5efc] text-white shadow-sm" : "text-[#8a8aa0]"}`}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="px-5 pb-4">
        {mode === "weekly" ? (
          <div className="flex items-center justify-between mb-4">
            <button className="w-8 h-8 flex items-center justify-center text-[#6d5efc]"><ChevronRight size={20} /></button>
            <p className="text-sm font-black">{rangeLabel}</p>
            <button className="w-8 h-8 flex items-center justify-center text-[#6d5efc]"><ChevronLeft size={20} /></button>
          </div>
        ) : (
          <p className="text-xs text-[#8a8aa0] font-semibold mb-4 text-center">זמינות קבועה שתחזור על עצמה בכל שבוע</p>
        )}

        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {DAYS.map((d, di) => (
            <div key={di} className="text-center">
              <p className="text-[11px] font-bold text-[#8a8aa0]">{DAY_SHORT[di]}</p>
              {mode === "weekly" && (
                <p className="text-base font-black text-[#eef0f6] mt-0.5">{AVAIL_WEEK_START.getDate() + di}</p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-5">
          {Object.entries(SHIFTS).map(([sk, s]) => {
            const keys = DAYS.map((_, di) => `${di}-${sk}`);
            const allOn = keys.every((k) => sel[k]);
            return (
              <div key={sk}>
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => selectAllShift(sk)} className="text-xs font-bold text-[#6d5efc]">
                    {allOn ? "נקה הכל" : "בחר הכל"}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black">{s.label}</span>
                    <s.icon size={15} className="text-[#8a8aa0]" />
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((_, di) => {
                    const k = `${di}-${sk}`;
                    const on = !!sel[k];
                    return (
                      <button key={k} onClick={() => toggle(k)}
                        className={`aspect-square rounded-xl flex items-center justify-center border transition-colors ${
                          on ? "bg-[#6d5efc] border-[#6d5efc] text-white" : "bg-[#16181c] border-[#22252b] text-[#c4c4d4] active:bg-[#0c0d10]"
                        }`}>
                        {on ? <Check size={18} /> : <CalendarDays size={17} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="השאר הערה למנהל"
          className="w-full mt-6 bg-[#16181c] border border-[#22252b] rounded-2xl px-4 py-3 text-sm text-[#eef0f6] text-right placeholder:text-[#b4b4c4] resize-none focus:outline-none focus:border-[#6d5efc] shadow-sm" />

        {err && <p className="text-xs font-bold text-[#e0315a] text-center mt-3">{err}</p>}

        <button onClick={submit} disabled={sent || saving || count === 0}
          className={`w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-colors ${
            sent ? "bg-[#15302b] text-[#22c08c]"
            : count === 0 || saving ? "bg-[#22252b] text-[#b4b4c4]"
            : "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]"
          }`}>
          {saving ? <>שולח…</> : sent ? <><Check size={17} /> נשלח למנהל/ת</> : <><Send size={16} /> שלח ({count})</>}
        </button>
      </div>
    </>
  );
}

// ── 4. Tasks ──────────────────────────────────────────────────────────────────
const INIT_TASKS = [
  { id: "t1", title: "השלמת הדרכת בטיחות מטבח", due: "עד 16.6", done: false },
  { id: "t2", title: "קריאת נוהל שירות מעודכן", due: "עד 18.6", done: false },
  { id: "t3", title: "אישור קבלת מדים", due: "הושלם", done: true },
  { id: "t4", title: "עדכון פרטי חשבון בנק", due: "הושלם", done: true },
];

function TasksTab({ go, onAvatar }) {
  const [tasks, setTasks] = useState(INIT_TASKS);
  const toggle = (id) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const doneCount = tasks.filter((t) => t.done).length;
  const pct = Math.round((doneCount / tasks.length) * 100);

  return (
    <>
      <TopBar title="המשימות שלי" subtitle={`${doneCount}/${tasks.length} הושלמו`} onAvatar={onAvatar} />
      <div className="px-5 pb-4 space-y-5">
        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2">המשימה היומית</p>
          <button onClick={() => go("learn")}
            className="w-full text-right rounded-3xl p-4 shadow-[0_8px_24px_rgba(109,94,252,0.18)] active:scale-[0.99] transition-transform"
            style={{ background: "linear-gradient(135deg,#241f3a,#16181c)", border: "1px solid #2e2748" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1 text-[11px] font-black text-[#6d5efc] bg-[#16181c] px-2 py-1 rounded-lg shadow-sm">
                <Sparkles size={12} /> תדריך התפריט היומי
              </span>
            </div>
            <p className="text-sm font-black text-[#eef0f6]">מנת היום: {MENU_BY_ID[SPECIALS[0]].name} · {MENU_BY_ID[SPECIALS[1]].name}</p>
            <p className="text-xs text-[#6b6b85] font-semibold mt-1">ה-AI הכין לך תרגול קצר על 6 פריטים מהתפריט להיום</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs font-bold text-[#6d5efc] flex items-center gap-1">פתח/י לימוד <ChevronLeft size={14} /></span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#ff7a59]"><Flame size={13} /> רצף 4 ימים</span>
            </div>
          </button>
        </div>

        <div>
          <div className={`${C.card} p-4 mb-3`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#8a8aa0]">התקדמות משימות</span>
              <span className="text-xs font-black text-[#6d5efc]">{pct}%</span>
            </div>
            <div className="h-2 bg-[#22252b] rounded-full overflow-hidden">
              <div className="h-full bg-[#6d5efc] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="space-y-2.5">
            {tasks.map((t) => (
              <button key={t.id} onClick={() => toggle(t.id)}
                className={`w-full flex items-center gap-3 ${C.card} p-4 text-right active:scale-[0.99] transition-transform`}>
                {t.done ? <CheckCircle2 size={22} className="text-[#6d5efc] flex-shrink-0" /> : <Circle size={22} className="text-[#c4c4d4] flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${t.done ? "text-[#b4b4c4] line-through" : "text-[#eef0f6]"}`}>{t.title}</p>
                  <p className="text-xs text-[#8a8aa0] font-semibold">{t.due}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── 5. Menu learning — the Brainscape-style AI trainer ────────────────────────
function LearnTab({ mastered, learnItem, onAvatar }) {
  const [mode, setMode] = useState("home");
  const [deck, setDeck] = useState([]);
  const [quiz, setQuiz] = useState([]);
  // Owner-published menu snapshot (shiftcrew_waiter.published_menu).
  // null = loading, false = offline/empty (use local demo MENU only), array = data.
  const [published, setPublished] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await scWaiter
        .from("published_menu")
        .select("source_item_id, category, name, price, description, allergens, is_special")
        .order("synced_at", { ascending: true });
      if (!alive) return;
      if (error || !data || !data.length) { setPublished(false); return; }
      setPublished(data);
    })();
    return () => { alive = false; };
  }, []);

  // Reconcile the owner's published menu with the local rich demo cards:
  // dishes the owner ADDED (names not in the local MENU) become extra flashcards,
  // and the "מנת היום" reflects whatever the owner flagged as special.
  const localNames = useMemo(() => new Set(MENU.map((m) => m.name)), []);
  const ownerExtras = Array.isArray(published)
    ? published.filter((p) => !localNames.has(p.name)).map(pubToCard)
    : [];
  const fullMenu = [...MENU, ...ownerExtras];
  const liveSpecialName = Array.isArray(published)
    ? (published.find((p) => p.is_special)?.name ?? MENU_BY_ID[SPECIALS[0]].name)
    : MENU_BY_ID[SPECIALS[0]].name;

  const startFlash = (items) => { setDeck(items); setMode("flash"); };
  const startQuiz  = (items) => { setQuiz(buildQuiz(items)); setMode("quiz"); };

  if (mode === "flash")  return <Flashcards items={deck} onKnown={learnItem} onDone={() => setMode("home")} />;
  if (mode === "quiz")   return <Quiz questions={quiz} onCorrect={learnItem} onDone={() => setMode("home")} />;
  if (mode === "import") return <MenuImportFlow onStudy={() => startFlash(fullMenu)} onDone={() => setMode("home")} />;

  const pct = Math.round((mastered.size / fullMenu.length) * 100);
  // Daily set = AI picks + any owner-added dishes (so new dishes surface today).
  const daily = [...DAILY_IDS.map((id) => MENU_BY_ID[id]), ...ownerExtras];

  return (
    <>
      <TopBar title="לימוד התפריט" subtitle="מאמן התפריט החכם" onAvatar={onAvatar} />
      <div className="px-5 pb-4 space-y-5">

        {/* AI daily brief */}
        <div className="rounded-3xl p-5 text-white shadow-[0_10px_30px_rgba(109,94,252,0.35)]" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          <div className="flex items-center gap-1.5 text-xs font-bold mb-2">
            <Sparkles size={14} /> תרגול AI יומי
          </div>
          <p className="text-lg font-black leading-snug">ה-AI ניתח את התפריט המלא והכין לך תרגול קצר להיום</p>
          <p className="text-sm text-white/85 font-semibold mt-1">{daily.length} פריטים · מנת היום: {liveSpecialName}</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => startFlash(daily)} className="bg-[#16181c] text-[#6d5efc] font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5 active:bg-white/90">
              <Layers size={16} /> כרטיסיות
            </button>
            <button onClick={() => startQuiz(daily)} className="bg-white/20 text-white font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-1.5 active:bg-white/30">
              <HelpCircle size={16} /> חידון
            </button>
          </div>
        </div>

        {/* Live sync indicator — the menu the owner published from the manager app */}
        {Array.isArray(published) && (
          <div className="flex items-center gap-2.5 rounded-2xl px-4 py-3 bg-[#15302b] border border-[#1c4f48]">
            <Check size={16} className="text-[#22c08c] flex-shrink-0" />
            <p className="text-xs font-bold text-[#1aa376] flex-1 min-w-0">
              התפריט סונכרן מהמנהל · {published.length} מנות
              {ownerExtras.length > 0 && ` · ${ownerExtras.length} חדשות`}
            </p>
          </div>
        )}

        {/* Progress + streak */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatBox icon={Trophy} value={`${pct}%`} label="שליטה" />
          <StatBox icon={GraduationCap} value={`${mastered.size}/${fullMenu.length}`} label="פריטים" />
          <StatBox icon={Flame} value="4" label="ימי רצף" tint />
        </div>

        {/* Team competition leaderboard */}
        <TeamLeaderboard mastered={mastered} />

        {/* How it's built — the automatic creation "click" */}
        <button onClick={() => setMode("import")}
          className="w-full text-right rounded-3xl p-4 active:scale-[0.99] transition-transform"
          style={{ background: "linear-gradient(135deg,#33290f,#16181c)", border: "1px dashed #33290f" }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#16181c] flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles size={20} className="text-[#ff7a59]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#eef0f6]">איך נוצר התרגול? ✨</p>
              <p className="text-xs text-[#cbb59a] font-semibold mt-0.5">העלה/הדבק תפריט וראה את ה-AI בונה את המשחק</p>
            </div>
            <ChevronLeft size={18} className="text-[#d9b8a0]" />
          </div>
        </button>

        {/* Study by category */}
        <div>
          <p className="text-xs font-bold text-[#8a8aa0] mb-2">לימוד לפי קטגוריה</p>
          <div className="space-y-2.5">
            {Object.entries(CATS).map(([key, c]) => {
              const items = fullMenu.filter((m) => m.cat === key);
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
      </div>
    </>
  );
}

// Avatar colors by name (the DB doesn't store presentation).
const TEAM_COLORS = {
  "עומר טל": "#22c08c", "שירה אבני": "#ff7a59", "מאיה ברק": "#e0315a",
  "איתי כהן": "#f3a712", "יותם פרץ": "#3a86ff", [ME_NAME]: "#6d5efc",
};

// ── Team competition — standings persist in shiftcrew_waiter.leaderboard ──────
// ME climbs as dishes get mastered; each new mastery is written to the isolated
// waiter schema, so progress survives reloads. Falls back to in-memory if the
// DB is unreachable, so the demo never breaks.
function TeamLeaderboard({ mastered }) {
  const [dbRows, setDbRows] = useState(null); // null=loading, false=offline, [] =data
  const meIdRef = useRef(null);
  const meBaseRef = useRef({ pts: ME_BASE_PTS, today: 0 });
  const creditedRef = useRef(new Set());

  // Initial load from the isolated waiter schema.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await scWaiter
        .from("leaderboard")
        .select("points, streak, today_count, waiter:waiters(id, name)")
        .order("points", { ascending: false });
      if (!alive) return;
      if (error || !data || !data.length) { setDbRows(false); return; }
      const me = data.find((r) => r.waiter?.name === ME_NAME);
      meIdRef.current = me?.waiter?.id ?? null;
      meBaseRef.current = { pts: me?.points ?? ME_BASE_PTS, today: me?.today_count ?? 0 };
      setDbRows(data);
    })();
    return () => { alive = false; };
  }, []);

  // Credit newly mastered cards to ME and persist (absolute target = no double count).
  useEffect(() => {
    if (!Array.isArray(dbRows) || !meIdRef.current) return;
    const fresh = [...mastered].filter((id) => !creditedRef.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => creditedRef.current.add(id));
    const n = creditedRef.current.size;
    const pts = meBaseRef.current.pts + n * PTS_PER_CARD;
    const today = meBaseRef.current.today + n;
    setDbRows((prev) => prev.map((r) =>
      r.waiter?.id === meIdRef.current ? { ...r, points: pts, today_count: today } : r));
    scWaiter.from("leaderboard")
      .update({ points: pts, today_count: today, updated_at: new Date().toISOString() })
      .eq("waiter_id", meIdRef.current)
      .then(({ error }) => { if (error) console.error("[shiftcrew] leaderboard update failed:", error); });
  }, [mastered, dbRows]);

  // Build display rows: DB-backed when available, else in-memory fallback.
  const rows = (Array.isArray(dbRows)
    ? dbRows.map((r) => ({
        name: r.waiter?.name ?? "—",
        color: TEAM_COLORS[r.waiter?.name] ?? "#9a9ab0",
        pts: r.points, streak: r.streak, today: r.today_count,
        me: r.waiter?.name === ME_NAME,
      }))
    : [
        ...TEAM_LEARN,
        { name: ME.name, color: "#6d5efc", pts: ME_BASE_PTS + mastered.size * PTS_PER_CARD, streak: 4, today: mastered.size, me: true },
      ]
  ).sort((a, b) => b.pts - a.pts);

  const myRank = rows.findIndex((r) => r.me) + 1;
  const leader = rows[0];
  const me = rows.find((r) => r.me);
  const toLeader = leader.me ? 0 : leader.pts - (me?.pts ?? 0);
  const medals = ["#f3c14b", "#c7ccd6", "#cd8b5b"]; // gold / silver / bronze

  return (
    <div className={`${C.card} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="text-[11px] font-black text-[#ff7a59] bg-[#33290f] px-2 py-1 rounded-lg">
          {myRank === 1 ? "המקום הראשון! 🥇" : `מקום ${myRank} מתוך ${rows.length}`}
        </span>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-black text-[#eef0f6]">תחרות הצוות</p>
          <Trophy size={16} className="text-[#f3c14b]" />
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[11px] text-[#8a8aa0] font-semibold text-right">
          {toLeader > 0
            ? `עוד ${toLeader} נק׳ ועברת את ${leader.name} למקום הראשון 🔥`
            : "אתה מוביל את הצוות השבוע — תמשיך ככה!"}
        </p>
      </div>

      <div className="divide-y divide-[#1c1e22]">
        {rows.map((r, idx) => (
          <div key={r.name}
            className={`flex items-center gap-3 px-4 py-2.5 ${r.me ? "bg-[#241f3a]" : ""}`}>
            <span className="w-5 text-center text-sm font-black flex-shrink-0"
              style={{ color: idx < 3 ? medals[idx] : "#b6b6c6" }}>
              {idx < 3 ? "●" : idx + 1}
            </span>
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ background: r.color }}>
              {r.name.split(" ").map((w) => w[0]).join("")}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${r.me ? "text-[#6d5efc]" : "text-[#eef0f6]"}`}>
                {r.name}{r.me && " (אני)"}
              </p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#9a9ab0]">
                <span className="flex items-center gap-0.5"><Flame size={10} className="text-[#ff7a59]" />{r.streak}</span>
                <span>+{r.today} היום</span>
              </div>
            </div>
            <span className="text-sm font-black text-[#eef0f6] flex-shrink-0">{r.pts.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Flashcards — front cues (auto-generated) → reveal → self-rate 1-5 ─────────
function frontCues(it) {
  const cues = it.groups.map((g) => `${g.items.length} ${g.items.length === 1 ? "מרכיב" : "מרכיבים"} · ${g.label}`);
  return cues;
}
function frontQuestions(it) {
  const q = [];
  if (it.allergens.length) q.push("למי המנה לא מתאימה?");
  if (cardObstacles(it).length || it.obstaclesUnknown) q.push("אילו מכשולים יש במנה?");
  if (it.modifications.length) q.push("אילו שינויים אפשריים?");
  q.push("האם המנה כשרה?");
  if (it.pitfall) q.push("מה הטיפ למלצר?");
  if (it.serving) q.push("איך מגישים?");
  return q;
}

function Flashcards({ items, onKnown, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState([]);

  if (i >= items.length) {
    return <DoneScreen title="סיימת את הכרטיסיות! 🎉"
      lines={[`עברת על ${items.length} פריטים`, reviewed.length ? `סומנו לחזרה: ${reviewed.join(", ")}` : "ידעת הכל — מעולה!"]}
      onAgain={() => { setI(0); setRevealed(false); setReviewed([]); }} onDone={onDone} />;
  }

  const it = items[i];
  const rate = (score) => {
    if (score >= 4) onKnown(it.id); else setReviewed((r) => r.includes(it.name) ? r : [...r, it.name]);
    setRevealed(false); setI(i + 1);
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0d10]">
      <LearnHeader label={`כרטיסייה ${i + 1}/${items.length}`} onDone={onDone} />
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col">
        <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mb-4">
          <div className="h-full bg-[#6d5efc] rounded-full transition-all" style={{ width: `${(i / items.length) * 100}%` }} />
        </div>

        <div className={`flex-1 ${C.card} overflow-hidden flex flex-col`}>
          {/* card header */}
          <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-[#1c1e22]">
            <span className="text-[11px] font-bold text-[#6d5efc] bg-[#241f3a] px-2 py-1 rounded-lg">{CATS[it.cat].label}</span>
            <span className="text-sm font-black text-[#6d5efc]">₪{it.price}</span>
          </div>

          {!revealed ? (
            <div className="flex-1 px-5 py-5 flex flex-col">
              <h2 className="text-2xl font-black text-center text-[#eef0f6] mb-1">{it.name}</h2>
              {it.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mb-4">{it.tags.map((t) => <Tag key={t} t={t} />)}</div>
              )}
              <div className="space-y-2.5 mt-2">
                {frontCues(it).map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-sm font-bold text-[#c4c4d4]">
                    <span className="w-2 h-2 rounded-full bg-[#6d5efc] flex-shrink-0" /> {c}
                  </div>
                ))}
                {frontQuestions(it).map((q, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-sm font-bold text-[#9a9ab0]">
                    <span className="text-[#ff7a59] font-black flex-shrink-0">?</span> {q}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 px-5 py-5 overflow-y-auto text-right">
              <h2 className="text-xl font-black text-[#eef0f6] mb-3">{it.name}</h2>

              {it.groups.map((g) => (
                <div key={g.label} className="mb-3">
                  <p className="text-[11px] font-black text-[#8a8aa0] mb-1">{g.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((x) => <span key={x} className="text-xs font-bold text-[#c4c4d4] bg-[#1c1e22] px-2.5 py-1 rounded-lg">{x}</span>)}
                  </div>
                </div>
              ))}

              {it.modifications.length > 0 && (
                <div className="mt-3 mb-3">
                  <p className="text-[11px] font-black text-[#8a8aa0] mb-1 flex items-center gap-1"><Pencil size={12} /> שינויים אפשריים</p>
                  <ul className="space-y-1">
                    {it.modifications.map((m) => <li key={m} className="text-xs font-semibold text-[#c4c4d4]">• {m}</li>)}
                  </ul>
                </div>
              )}

              <div className="bg-[#3a1d22] border border-[#3a1d22] rounded-2xl p-3 mt-3">
                <p className="text-[11px] font-black text-[#e0315a] mb-1 flex items-center gap-1"><AlertTriangle size={12} /> אלרגנים — המנה לא מתאימה ל:</p>
                <p className="text-sm font-bold text-[#e0315a]">{it.allergens.length ? it.allergens.join(" · ") : "ללא אלרגנים ידועים"}</p>
              </div>

              {/* Obstacles (מכשולים) — guest-preference hurdles, NOT allergies. */}
              <div className="bg-[#33290f] border border-[#5a4a1e] rounded-2xl p-3 mt-3">
                <p className="text-[11px] font-black text-[#f3c14b] mb-1 flex items-center gap-1">🌶️ מכשולים — דברים שאורחים לרוב פחות אוהבים</p>
                {it.obstaclesUnknown ? (
                  <p className="text-sm font-bold text-[#f3c14b]">המסעדה לא ציינה מכשולים — כדאי לברר עם המנהל/ת אם יש (חריפות, מרירות, מוגש נא וכו׳).</p>
                ) : cardObstacles(it).length ? (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {cardObstacles(it).map((o) => (
                      <span key={o} className="text-xs font-bold text-[#f3c14b] bg-[#16181c] px-2.5 py-1 rounded-lg">{o}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-[#cbb59a]">אין מכשולים מיוחדים — מנה שמתאימה כמעט לכולם.</p>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg flex items-center gap-1 ${it.kosher ? "bg-[#15302b] text-[#22c08c]" : "bg-[#3a1d22] text-[#e0315a]"}`}>
                  {it.kosher ? <><Leaf size={12} /> כשר</> : <><X size={12} /> לא כשר</>}
                </span>
              </div>

              {it.pitfall && (
                <div className="bg-[#241f3a] border border-[#2e2748] rounded-2xl p-3 mt-3">
                  <p className="text-[11px] font-black text-[#9b7bff] mb-0.5">💡 טיפ למלצר</p>
                  <p className="text-sm font-bold text-[#c9b6ff]">{it.pitfall}</p>
                </div>
              )}

              {it.serving && (
                <p className="text-xs font-semibold text-[#8a8aa0] mt-3 flex items-center gap-1.5"><ScrollText size={13} /> הגשה: {it.serving}</p>
              )}
            </div>
          )}
        </div>

        {/* action area */}
        {!revealed ? (
          <button onClick={() => setRevealed(true)}
            className="w-full mt-4 py-4 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]">
            חשוף תשובה
          </button>
        ) : (
          <div className="mt-4">
            <p className="text-xs font-bold text-[#8a8aa0] text-center mb-2">עד כמה ידעת את זה?</p>
            <div className="flex items-center justify-between gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => rate(n)}
                  className="flex-1 aspect-square rounded-2xl font-black text-base text-white active:scale-95 transition-transform"
                  style={{ background: ["#f0506e", "#f7864e", "#f5b945", "#7bbf5a", "#3fb27f"][n - 1] }}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-1 px-1">
              <span className="text-[10px] font-bold text-[#b4b4c4]">בכלל לא</span>
              <span className="text-[10px] font-bold text-[#b4b4c4]">מושלם</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quiz ──────────────────────────────────────────────────────────────────────
function Quiz({ questions, onCorrect, onDone }) {
  const [i, setI] = useState(0);
  const [sel, setSel] = useState(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState([]);

  if (i >= questions.length) {
    const pct = Math.round((score / questions.length) * 100);
    return <DoneScreen title={`קיבלת ${score}/${questions.length} (${pct}%)`}
      lines={[ pct >= 80 ? "שליטה מצוינת בתפריט! 👏" : "כל הכבוד — עוד קצת תרגול.",
        missed.length ? `ה-AI ממליץ לחזור על: ${[...new Set(missed)].join(", ")}` : "לא פספסת אף שאלה!" ]}
      onAgain={() => { setI(0); setSel(null); setScore(0); setMissed([]); }} onDone={onDone} />;
  }

  const q = questions[i];
  const answered = sel !== null;
  const correctVal = q.answer;
  const choose = (val) => {
    if (answered) return;
    setSel(val);
    if (val === correctVal) { setScore((s) => s + 1); onCorrect(q.item.id); }
    else setMissed((m) => [...m, q.item.name]);
  };

  const options = q.kind === "yesno"
    ? [{ val: true, label: "כן" }, { val: false, label: "לא" }]
    : q.options.map((o) => ({ val: o, label: o }));

  return (
    <div className="h-full flex flex-col bg-[#0c0d10]">
      <LearnHeader label={`שאלה ${i + 1}/${questions.length}`} onDone={onDone} />
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col">
        <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mb-4">
          <div className="h-full bg-[#6d5efc] rounded-full transition-all" style={{ width: `${(i / questions.length) * 100}%` }} />
        </div>

        <div className={`${C.card} p-5 mb-4`}>
          <span className="text-[11px] font-bold text-[#6d5efc] bg-[#241f3a] px-2 py-1 rounded-lg">
            {q.kind === "yesno" ? "כן / לא" : "רב-ברירה"}
          </span>
          <p className="text-lg font-black text-[#eef0f6] mt-3 leading-snug">{q.q}</p>
        </div>

        <div className={`grid gap-2.5 ${q.kind === "yesno" ? "grid-cols-2" : "grid-cols-1"}`}>
          {options.map((o) => {
            const isSel = sel === o.val;
            const isRight = o.val === correctVal;
            let cls = "bg-[#16181c] border-[#22252b] text-[#c4c4d4]";
            if (answered) {
              if (isRight) cls = "bg-[#15302b] border-[#3fb27f] text-[#22c08c]";
              else if (isSel) cls = "bg-[#3a1d22] border-[#f0506e] text-[#e0315a]";
              else cls = "bg-[#16181c] border-[#22252b] text-[#b4b4c4]";
            }
            return (
              <button key={String(o.val)} onClick={() => choose(o.val)} disabled={answered}
                className={`py-3.5 px-4 rounded-2xl border-2 font-bold text-sm text-right flex items-center justify-between transition-colors ${cls}`}>
                <span>{o.label}</span>
                {answered && isRight && <Check size={17} className="text-[#22c08c]" />}
                {answered && isSel && !isRight && <X size={17} className="text-[#e0315a]" />}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className={`mt-4 ${C.card} p-4`}>
            <p className="text-xs font-bold text-[#8a8aa0] mb-1">הסבר</p>
            <p className="text-sm text-[#c4c4d4] font-semibold leading-relaxed">{q.explain}</p>
            <button onClick={() => { setSel(null); setI(i + 1); }}
              className="w-full mt-3 py-3 rounded-2xl font-bold text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0]">
              {i + 1 >= questions.length ? "סיום" : "השאלה הבאה"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// AI-style generator: turns rich menu items into a mixed question set.
function buildQuiz(items) {
  const sel = shuffle(items).slice(0, 6);
  const allIngredients = (it) => it.groups.flatMap((g) => g.items);
  return sel.map((it, idx) => {
    const t = idx % 3;
    if (t === 0) {
      const useReal = it.allergens.length > 0 && Math.random() < 0.6;
      let allergen, answer;
      if (useReal) { allergen = pickOne(it.allergens); answer = true; }
      else { allergen = pickOne(ALLERGENS.filter((a) => !it.allergens.includes(a))); answer = false; }
      return {
        kind: "yesno", item: it, answer,
        q: `האם "${it.name}" מתאימה למי שאלרגי/ת ל${allergen}?`,
        // suitable = does NOT contain → invert
        ...(() => { const suitable = !answer; return {
          answer: suitable,
          explain: answer
            ? `המנה מכילה ${allergen} — לא מתאימה. אלרגנים: ${it.allergens.join(", ")}.`
            : `המנה אינה מכילה ${allergen}. אלרגנים: ${it.allergens.length ? it.allergens.join(", ") : "ללא"}.`,
        }; })(),
      };
    }
    if (t === 1) {
      const mine = allIngredients(it);
      const correct = pickOne(mine);
      const distract = shuffle(items.filter((x) => x.id !== it.id).flatMap(allIngredients).filter((g) => !mine.includes(g)));
      return {
        kind: "mc", item: it, answer: correct,
        q: `איזה מרכיב נמצא ב"${it.name}"?`,
        options: shuffle([correct, ...uniq(distract).slice(0, 3)]),
        explain: `${it.name} — ${it.groups.map((g) => `${g.label}: ${g.items.join(", ")}`).join(" · ")}.`,
      };
    }
    const correct = `₪${it.price}`;
    return {
      kind: "mc", item: it, answer: correct,
      q: `מה המחיר של "${it.name}"?`,
      options: shuffle([correct, `₪${it.price + 12}`, `₪${Math.max(18, it.price - 8)}`, `₪${it.price + 24}`]),
      explain: `המחיר של ${it.name} הוא ₪${it.price}.`,
    };
  });
}

// ── Menu import — demonstrates the automatic AI creation ("the click") ────────
const SAMPLE_MENU = `ראשונות
קרפצ'יו בקר — 62 ₪ · אנטריקוט מיושן, רוקט, פרמזן, שמן כמהין (מכיל חלב)
קלמרי צרוב — 58 ₪ · קלמרי, איולי לימון, צ'ילי (ביצים, רכיכות)
סלט עגבניות הקיץ — 48 ₪ · עגבניות שרי, בצל סגול, בזיליקום (טבעוני)

עיקריות
אנטריקוט 300 גרם — 168 ₪ · בטטה, רוטב פלפלת
סלמון בגריל — 124 ₪ · פירה אפונה, חמאת לימון (דגים, חלב)
המבורגר הבית — 78 ₪ · בקר, צ'דר, בריוש (גלוטן, חלב, שומשום)

קינוחים
סופלה שוקולד — 46 ₪ · שוקולד, גלידת וניל (גלוטן, חלב, ביצים)

קוקטיילים
נגרוני — 52 ₪ · ג'ין, קמפרי, ורמוט`;

const PIPELINE = [
  { icon: ScanLine,   label: "קורא את המסמך (OCR)",       sub: "טקסט וכותרות זוהו" },
  { icon: Utensils,   label: "מזהה מנות ומרכיבים",        sub: "15 מנות · 4 קטגוריות" },
  { icon: AlertTriangle, label: "מסמן אלרגנים וכשרות",    sub: "10 אלרגנים · סטטוס כשרות" },
  { icon: Layers,     label: "בונה כרטיסיות ושאלות",      sub: "15 כרטיסים + חידון אוטומטי" },
];

function MenuImportFlow({ onStudy, onDone }) {
  const [step, setStep] = useState("input");   // input | processing | done
  const [src, setSrc] = useState("paste");      // paste | upload | photo
  const [text, setText] = useState(SAMPLE_MENU);
  const [done, setDone] = useState(0);          // pipeline steps completed

  useEffect(() => {
    if (step !== "processing") return;
    if (done >= PIPELINE.length) { const t = setTimeout(() => setStep("done"), 550); return () => clearTimeout(t); }
    const t = setTimeout(() => setDone((d) => d + 1), 850);
    return () => clearTimeout(t);
  }, [step, done]);

  // INPUT
  if (step === "input") {
    return (
      <div className="h-full flex flex-col bg-[#0c0d10]">
        <LearnHeader label="יצירת תרגול מהתפריט" onDone={onDone} />
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <p className="text-sm font-bold text-[#c4c4d4] mb-3">בחר/י מקור — ה-AI יבנה את המשחק לבד:</p>
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {[["paste", "הדבקה", ClipboardPaste], ["upload", "קובץ", Upload], ["photo", "צילום", Camera]].map(([k, label, Icon]) => {
              const active = src === k;
              return (
                <button key={k} onClick={() => setSrc(k)}
                  className={`rounded-2xl p-3 flex flex-col items-center gap-1.5 border-2 transition-colors ${active ? "bg-[#241f3a] border-[#6d5efc] text-[#6d5efc]" : "bg-[#16181c] border-[#22252b] text-[#8a8aa0]"}`}>
                  <Icon size={20} />
                  <span className="text-xs font-bold">{label}</span>
                </button>
              );
            })}
          </div>

          {src === "paste" ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={11}
              className="w-full bg-[#16181c] border border-[#22252b] rounded-2xl px-4 py-3 text-xs leading-relaxed text-[#c4c4d4] text-right resize-none focus:outline-none focus:border-[#6d5efc] shadow-sm" />
          ) : (
            <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-5 shadow-sm flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#241f3a] flex items-center justify-center flex-shrink-0">
                {src === "upload" ? <FileText size={22} className="text-[#6d5efc]" /> : <Camera size={22} className="text-[#6d5efc]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-[#eef0f6]">{src === "upload" ? "menu-2026.pdf" : "תפריט.jpg"}</p>
                <p className="text-xs text-[#8a8aa0] font-semibold">{src === "upload" ? "PDF · 1.2MB · מוכן לעיבוד" : "תמונה · תעבור OCR"}</p>
              </div>
              <CheckCircle2 size={20} className="text-[#22c08c]" />
            </div>
          )}

          <p className="text-[11px] text-[#a0a0b4] font-semibold mt-3 leading-relaxed">
            ה-AI מחלץ מבנה מסודר: מנה ← קבוצות מרכיבים, אלרגנים, כשרות, שינויים אפשריים ומוקשים — ובונה כרטיסיות ושאלות אוטומטית.
          </p>
        </div>
        <div className="px-5 py-4">
          <button onClick={() => { setDone(0); setStep("processing"); }}
            className="w-full py-4 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)] flex items-center justify-center gap-2">
            <Sparkles size={17} /> צור משחק אוטומטית
          </button>
        </div>
      </div>
    );
  }

  // PROCESSING
  if (step === "processing") {
    return (
      <div className="h-full flex flex-col bg-[#0c0d10]">
        <LearnHeader label="ה-AI עובד..." onDone={onDone} />
        <div className="flex-1 flex flex-col justify-center px-6">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-[0_10px_30px_rgba(109,94,252,0.35)] animate-pulse" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
              <Sparkles size={36} className="text-white" />
            </div>
            <p className="text-base font-black text-[#eef0f6] mt-4">בונה את המשחק מהתפריט</p>
          </div>
          <div className="space-y-2.5">
            {PIPELINE.map((p, idx) => {
              const isDone = idx < done;
              const isActive = idx === done;
              const Icon = p.icon;
              return (
                <div key={idx} className={`flex items-center gap-3 rounded-2xl p-3.5 border transition-all ${isDone ? "bg-[#16181c] border-[#22252b]" : isActive ? "bg-[#16181c] border-[#6d5efc] shadow-[0_4px_14px_rgba(109,94,252,0.15)]" : "bg-white/50 border-[#1c1e22] opacity-50"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDone ? "bg-[#15302b]" : "bg-[#241f3a]"}`}>
                    {isDone ? <Check size={19} className="text-[#22c08c]" /> : <Icon size={19} className={isActive ? "text-[#6d5efc] animate-pulse" : "text-[#b4b4c4]"} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${isDone || isActive ? "text-[#eef0f6]" : "text-[#b4b4c4]"}`}>{p.label}</p>
                    {isDone && <p className="text-[11px] text-[#22c08c] font-semibold">{p.sub}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // DONE — the "click"
  return (
    <div className="h-full flex flex-col bg-[#0c0d10]">
      <LearnHeader label="התרגול מוכן" onDone={onDone} />
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col">
        <div className="flex flex-col items-center text-center mt-2 mb-5">
          <div className="w-20 h-20 rounded-full bg-[#15302b] flex items-center justify-center mb-4">
            <Check size={40} className="text-[#22c08c]" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-black text-[#eef0f6]">המשחק נוצר! 🎉</h2>
          <p className="text-sm text-[#8a8aa0] font-semibold mt-1">15 כרטיסים · 4 קטגוריות · חידון אוטומטי</p>
        </div>

        <p className="text-xs font-bold text-[#8a8aa0] mb-2">דוגמה למה שנוצר אוטומטית:</p>
        <div className="space-y-2 mb-4">
          {[MENU_BY_ID.m6, MENU_BY_ID.m8, MENU_BY_ID.m13].map((it) => (
            <div key={it.id} className={`${C.card} p-3.5`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-[#eef0f6]">{it.name}</p>
                <span className="text-xs font-bold text-[#6d5efc]">₪{it.price}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="text-[10px] font-bold text-[#6d5efc] bg-[#241f3a] px-2 py-0.5 rounded-md">{it.groups.length} קבוצות מרכיבים</span>
                {it.allergens.length > 0 && <span className="text-[10px] font-bold text-[#e0315a] bg-[#3a1d22] px-2 py-0.5 rounded-md">{it.allergens.length} אלרגנים</span>}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${it.kosher ? "bg-[#15302b] text-[#22c08c]" : "bg-[#3a1d22] text-[#e0315a]"}`}>{it.kosher ? "כשר" : "לא כשר"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-4 space-y-2.5">
        <button onClick={onStudy}
          className="w-full py-4 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)] flex items-center justify-center gap-2">
          <Layers size={17} /> התחל ללמוד
        </button>
        <button onClick={onDone} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-[#16181c] border border-[#22252b] text-[#c4c4d4] active:bg-[#1c1e22]">
          חזרה ללימוד
        </button>
      </div>
    </div>
  );
}

// ── small shared bits ─────────────────────────────────────────────────────────
function Stat({ value, label }) {
  return (
    <div className={`${C.card} p-3 text-center`}>
      <p className="text-lg font-black text-[#eef0f6] leading-none">{value}</p>
      <p className="text-[10px] font-semibold text-[#8a8aa0] mt-1">{label}</p>
    </div>
  );
}
function StatBox({ icon: Icon, value, label, tint }) {
  return (
    <div className={`${C.card} p-3 text-center`}>
      <Icon size={16} className={`mx-auto ${tint ? "text-[#ff7a59]" : "text-[#6d5efc]"}`} />
      <p className="text-base font-black text-[#eef0f6] mt-1 leading-none">{value}</p>
      <p className="text-[10px] font-semibold text-[#8a8aa0] mt-0.5">{label}</p>
    </div>
  );
}
function Tag({ t }) {
  return <span className="text-[10px] font-bold text-[#22c08c] bg-[#15302b] px-2 py-0.5 rounded-md">{t}</span>;
}
function LearnHeader({ label, onDone }) {
  return (
    <div className="bg-[#0c0d10] px-4 pt-6 pb-3 flex items-center gap-3 sticky top-0 z-10">
      <button onClick={onDone} className="w-9 h-9 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] active:bg-[#1c1e22] shadow-sm">
        <X size={18} />
      </button>
      <span className="text-sm font-black text-[#eef0f6]">{label}</span>
    </div>
  );
}
function DoneScreen({ title, lines, onAgain, onDone }) {
  return (
    <div className="h-full flex flex-col bg-[#0c0d10]">
      <LearnHeader label="סיכום" onDone={onDone} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[#241f3a] flex items-center justify-center mb-5">
          <Trophy size={38} className="text-[#6d5efc]" />
        </div>
        <h2 className="text-2xl font-black text-[#eef0f6]">{title}</h2>
        <div className="mt-3 space-y-1">
          {lines.filter(Boolean).map((l, idx) => <p key={idx} className="text-sm text-[#8a8aa0] font-semibold">{l}</p>)}
        </div>
        <div className="w-full max-w-xs mt-8 space-y-2.5">
          <button onClick={onAgain} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0] flex items-center justify-center gap-1.5 shadow-[0_6px_18px_rgba(109,94,252,0.35)]">
            <RotateCcw size={16} /> תרגול נוסף
          </button>
          <button onClick={onDone} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-[#16181c] border border-[#22252b] text-[#c4c4d4] active:bg-[#1c1e22]">
            חזרה ללימוד
          </button>
        </div>
      </div>
    </div>
  );
}

// Empty / informational state for a settings detail panel.
function SettingsEmpty({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-16 h-16 rounded-2xl bg-[#1c1e22] border border-[#22252b] flex items-center justify-center mb-4">
        <Icon size={26} className="text-[#6d5efc]" />
      </div>
      <p className="text-base font-black text-[#eef0f6] mb-1">{title}</p>
      <p className="text-sm font-semibold text-[#8a8aa0] leading-relaxed max-w-[18rem]">{subtitle}</p>
    </div>
  );
}

// One labelled value row used inside the profile / settings panels.
function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1c1e22] last:border-b-0">
      <span className="text-sm font-bold text-[#eef0f6]">{value}</span>
      <span className="text-xs font-semibold text-[#8a8aa0]">{label}</span>
    </div>
  );
}

function SettingsScreen({ onBack, onSignOut, waiter, restaurantName }) {
  // null = the account list; otherwise the open item's id (its detail panel).
  const [open, setOpen] = useState(null);
  const phone = waiter?.phone || "";

  const MENU_ITEMS = [
    { id: "profile", icon: User, label: "הפרופיל שלי" },
    { id: "payslips", icon: FileText, label: "תלושי שכר" },
    { id: "swaps", icon: ArrowLeftRight, label: "בקשות החלפה" },
    { id: "notifs", icon: Bell, label: "התראות" },
    { id: "prefs", icon: Settings, label: "הגדרות" },
    { id: "help", icon: HelpCircle, label: "עזרה ותמיכה" },
  ];
  const current = MENU_ITEMS.find((m) => m.id === open);

  // Detail panel content per item — real data where we have it, an honest empty
  // state otherwise (so e.g. "תלושי שכר" still opens and explains there's none yet).
  const renderDetail = () => {
    switch (open) {
      case "profile":
        return (
          <div className="px-5 py-4">
            <div className={`${C.card} p-5 mb-4 flex items-center gap-3`}>
              <div className="w-14 h-14 rounded-full bg-[#6d5efc] text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(109,94,252,0.35)]">
                {ME.name.split(" ").map((w) => w[0]).join("")}
              </div>
              <div>
                <p className="text-base font-black text-[#eef0f6]">{ME.name}</p>
                <p className="text-xs text-[#8a8aa0] font-semibold">{ME.role}</p>
              </div>
            </div>
            <div className={`${C.card} overflow-hidden mb-3`}>
              <InfoRow label="שם" value={ME.name} />
              <InfoRow label="תפקיד" value={ME.role} />
              {phone && <InfoRow label="טלפון" value={phone} />}
              <InfoRow label="מסעדה" value={restaurantName || "—"} />
            </div>
            <p className="text-xs font-semibold text-[#8a8aa0] text-center px-4">לעדכון פרטים אישיים פנה/י למנהל/ת המסעדה.</p>
          </div>
        );
      case "payslips":
        return <SettingsEmpty icon={FileText} title="אין תלושי שכר עדיין" subtitle="כשהמנהל/ת תפיק תלוש שכר, הוא יופיע כאן וניתן יהיה להוריד אותו." />;
      case "swaps":
        return <SettingsEmpty icon={ArrowLeftRight} title="אין בקשות החלפה" subtitle="בקשות להחלפת משמרת שתשלח/י או שתקבל/י מחברי הצוות יופיעו כאן." />;
      case "notifs":
        return <SettingsEmpty icon={Bell} title="אין התראות חדשות" subtitle="עדכונים על פרסום סידור, שינויים במשמרות ומשימות חדשות יופיעו כאן." />;
      case "prefs":
        return (
          <div className="px-5 py-4">
            <div className={`${C.card} overflow-hidden`}>
              <InfoRow label="שפה" value="עברית" />
              <InfoRow label="גרסה" value="1.0" />
              <InfoRow label="מסעדה" value={restaurantName || "—"} />
            </div>
          </div>
        );
      case "help":
        return (
          <div className="px-5 py-4">
            <div className={`${C.card} p-5`}>
              <p className="text-sm font-black text-[#eef0f6] mb-2">צריך/ה עזרה?</p>
              <p className="text-sm font-semibold text-[#8a8aa0] leading-relaxed">
                לשאלות על משמרות, זמינות או התפריט — פנה/י ישירות למנהל/ת המסעדה.
                לבעיה טכנית באפליקציה, צרו קשר עם התמיכה של ShiftCrew.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Detail view (an item is open).
  if (current) {
    return (
      <>
        <div className="bg-[#0c0d10] px-4 pt-6 pb-3 flex items-center gap-3">
          <button onClick={() => setOpen(null)} className="w-9 h-9 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] active:bg-[#1c1e22] shadow-sm">
            <ChevronRight size={18} />
          </button>
          <span className="text-lg font-black text-[#eef0f6]">{current.label}</span>
        </div>
        <div className="flex-1 overflow-y-auto">{renderDetail()}</div>
      </>
    );
  }

  // Account list view.
  return (
    <>
      <div className="bg-[#0c0d10] px-4 pt-6 pb-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[#16181c] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] active:bg-[#1c1e22] shadow-sm">
          <ChevronRight size={18} />
        </button>
        <span className="text-lg font-black text-[#eef0f6]">החשבון שלי</span>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className={`${C.card} p-5 mb-4 flex items-center gap-3`}>
          <div className="w-14 h-14 rounded-full bg-[#6d5efc] text-white font-black text-lg flex items-center justify-center shadow-[0_4px_12px_rgba(109,94,252,0.35)]">
            {ME.name.split(" ").map((w) => w[0]).join("")}
          </div>
          <div>
            <p className="text-base font-black text-[#eef0f6]">{ME.name}</p>
            <p className="text-xs text-[#8a8aa0] font-semibold">{ME.role}{restaurantName ? ` · ${restaurantName}` : ""}</p>
          </div>
        </div>
        <div className="bg-[#16181c] rounded-3xl border border-[#22252b] shadow-sm overflow-hidden mb-4">
          {MENU_ITEMS.map((m, idx) => (
            <button key={m.id} onClick={() => setOpen(m.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 text-right active:bg-[#0c0d10] ${idx < MENU_ITEMS.length - 1 ? "border-b border-[#1c1e22]" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-[#1c1e22] flex items-center justify-center flex-shrink-0">
                <m.icon size={17} className="text-[#6d5efc]" />
              </div>
              <span className="flex-1 text-sm font-bold text-[#c4c4d4]">{m.label}</span>
              <ChevronLeft size={17} className="text-[#c4c4d4]" />
            </button>
          ))}
        </div>
        <button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 text-[#e0315a] text-sm font-bold py-3.5 bg-[#16181c] rounded-2xl border border-[#22252b] active:bg-[#0c0d10]">
          <LogOut size={16} /> התנתקות
        </button>
      </div>
    </>
  );
}

function BottomNav({ tab, setTab }) {
  return (
    <nav className="bg-[#16181c] border-t border-[#22252b] flex safe-bottom flex-shrink-0 shadow-[0_-2px_14px_rgba(30,25,70,0.05)]">
      {TABS.map(({ id, icon: Icon, label }) => {
        const active = tab === id;
        return (
          <button key={id} onClick={() => setTab(id)} className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative">
            {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 bg-[#6d5efc] rounded-full" />}
            <Icon size={21} strokeWidth={active ? 2.4 : 1.8} className={active ? "text-[#6d5efc]" : "text-[#a0a0b4]"} />
            <span className={`text-[10px] font-bold ${active ? "text-[#6d5efc]" : "text-[#a0a0b4]"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── utils ──────────────────────────────────────────────────────────────────────
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
function uniq(a) { return [...new Set(a)]; }
