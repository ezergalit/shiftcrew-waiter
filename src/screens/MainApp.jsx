import { useEffect, useState, useMemo, useRef } from "react";
import { Trophy, BookOpen, Zap, BarChart3, Home, LogOut, Flame, WifiOff, Target, Sparkles, Check, Repeat, ChevronLeft, AlertTriangle, ListChecks } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MOCK_CARDS, MOCK_BRIEF, MOCK_LEADERBOARD } from "../lib/mockMenu";

const db = supabase.schema("menu_app");
const CAT_LABELS = { starters: "ראשונות", mains: "עיקריות", desserts: "קינוחים", drinks: "קוקטיילים" };
const DAILY_TARGET = 3;
const DAILY_BONUS = 50;

function pubToCard(p) {
  const ing = (p.ingredients || []).filter(Boolean);
  return { id: p.source_item_id, name: p.name, price: Number(p.price), category: p.category, desc: p.description || "", ingredients: ing, allergens: (p.allergens || []).filter(Boolean), isSpecial: !!p.is_special };
}

const COLORS = ["#22c08c", "#ff7a59", "#e0315a", "#f3a712", "#3a86ff", "#6d5efc", "#9b7bff", "#1aa376"];
const colorFor = name => COLORS[String(name).charCodeAt(0) % COLORS.length];

// Challenges — persisted locally per team member (device-scoped, not synced across devices).
const todayStr = () => new Date().toISOString().slice(0, 10);
const loadDaily = (id) => {
  if (!id) return { date: todayStr(), count: 0, bonusAwarded: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(`menu-app-daily-${id}`));
    if (parsed?.date === todayStr()) return parsed;
  } catch {}
  return { date: todayStr(), count: 0, bonusAwarded: false };
};
const saveDaily = (id, obj) => id && localStorage.setItem(`menu-app-daily-${id}`, JSON.stringify(obj));
const loadNum = (key, id) => id ? Number(localStorage.getItem(`${key}-${id}`)) || 0 : 0;
const saveNum = (key, id, val) => id && localStorage.setItem(`${key}-${id}`, String(val));

export default function MainApp({ session, onSignOut }) {
  const [tab, setTab] = useState("home");
  const [cards, setCards] = useState(null);
  const [mastered, setMastered] = useState(new Set());
  const [leaderboard, setLeaderboard] = useState([]);
  const [brief, setBrief] = useState(null);
  const [mode, setMode] = useState(null); // flashcards | quiz | match | speed
  const [modeItems, setModeItems] = useState(null); // scoped items for a challenge round; null = full menu
  const [daily, setDaily] = useState(() => loadDaily(session?.teamMemberId));
  const [bonusTotal, setBonusTotal] = useState(() => loadNum("menu-app-bonus", session?.teamMemberId));
  const [bestSpeed, setBestSpeed] = useState(() => loadNum("menu-app-best-speed", session?.teamMemberId));
  const exitMode = () => { setMode(null); setModeItems(null); };

  const refetchLeaderboard = async () => {
    const { data } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
    setLeaderboard(data || []);
  };

  useEffect(() => {
    // TEMP DEV FALLBACK — offline session (see auth/TeamLogin.jsx): skip real fetches
    // entirely and show the same content that's actually seeded in the DB, so the UI is
    // testable while Supabase's Data API is down. Remove once Supabase is healthy again.
    if (session?.offline) {
      setCards(MOCK_CARDS);
      setBrief(MOCK_BRIEF);
      setLeaderboard(MOCK_LEADERBOARD);
      return;
    }

    let alive = true;
    (async () => {
      const { data } = await db.from("published_menu").select("*").eq("restaurant_id", session?.restaurantId);
      if (alive) setCards((data || []).map(pubToCard));
      const { data: m } = await db.from("menu_progress").select("source_item_id, mastery").eq("team_member_id", session?.teamMemberId);
      if (alive) setMastered(new Set((m || []).filter(r => (r.mastery ?? 0) >= 4).map(r => r.source_item_id)));
      const { data: l } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
      if (alive) setLeaderboard(l || []);
      const today = new Date().toISOString().slice(0, 10);
      const { data: b } = await db.from("daily_brief").select("*").eq("restaurant_id", session?.restaurantId).eq("date", today).maybeSingle();
      if (alive) setBrief(b || {});
      // Mark today's brief as read (for the owner's team-activity dashboard) — only when
      // there's an actual brief to read, and only for real (non-offline) sessions.
      if (b && session?.teamMemberId) {
        await db.from("daily_brief_reads").upsert(
          { team_member_id: session.teamMemberId, restaurant_id: session.restaurantId, date: today, read_at: new Date().toISOString() },
          { onConflict: "team_member_id,date" }
        );
      }
    })();

    // Real-time leaderboard: every team member's rating updates everyone's screen instantly.
    // NOTE: .channel() must be called on the top-level `supabase` client, not the
    // schema-scoped `db` proxy — `db.channel` doesn't exist and throws (only ever
    // surfaced now that this code runs against a live connection instead of the
    // offline fallback, which never reached this line for real).
    const channel = supabase.channel(`leaderboard-${session?.restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "menu_app", table: "leaderboard", filter: `restaurant_id=eq.${session?.restaurantId}` }, refetchLeaderboard)
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [session?.restaurantId, session?.teamMemberId, session?.offline]);

  // rating: 1-5. Self-reported in Flashcards (the one genuinely subjective mode); every
  // other mode (Quiz/Speed/Matching/Allergens/NameCompletion) computes it itself from
  // actual correctness — 5 on a correct answer, 2 on a wrong one — specifically so a
  // player can't just self-report "I knew it" without being tested. Mastery (>=4) can
  // move in EITHER direction: a later wrong answer un-masters something they'd already
  // gotten right before, which is the whole point of letting objective games grade it.
  const learnItem = async (id, rating) => {
    if (!session?.teamMemberId) return;
    const wasMastered = mastered.has(id);
    const nowMastered = rating >= 4;
    const crossed = wasMastered !== nowMastered;

    let nextMasteredSize = mastered.size;
    if (crossed) {
      const next = new Set(mastered);
      if (nowMastered) next.add(id); else next.delete(id);
      nextMasteredSize = next.size;
      setMastered(next);
    }

    // Daily challenge: 3 NEWLY-mastered dishes/day → one-time +50 bonus. Only counts
    // fresh mastery (not re-grading something already known), and only counts up.
    const justMasteredFresh = !wasMastered && nowMastered;
    let newBonusTotal = bonusTotal;
    if (justMasteredFresh) {
      const base = daily.date === todayStr() ? daily : { date: todayStr(), count: 0, bonusAwarded: false };
      const newDaily = { date: todayStr(), count: base.count + 1, bonusAwarded: base.bonusAwarded || base.count + 1 >= DAILY_TARGET };
      const justEarnedBonus = !base.bonusAwarded && newDaily.bonusAwarded;
      setDaily(newDaily);
      saveDaily(session.teamMemberId, newDaily);
      if (justEarnedBonus) { newBonusTotal = bonusTotal + DAILY_BONUS; setBonusTotal(newBonusTotal); saveNum("menu-app-bonus", session.teamMemberId, newBonusTotal); }
    }

    if (crossed) {
      const points = nextMasteredSize * 100 + newBonusTotal;
      // Optimistic local leaderboard update so the rater sees their own score move instantly.
      setLeaderboard(prev => {
        const exists = prev.find(r => r.team_member_id === session.teamMemberId);
        const updated = exists
          ? prev.map(r => r.team_member_id === session.teamMemberId ? { ...r, points, mastered_count: nextMasteredSize } : r)
          : [...prev, { restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, name: session.name, points, mastered_count: nextMasteredSize, streak: 1, today_count: 1 }];
        return updated.sort((a, b) => b.points - a.points);
      });
    }

    if (session.offline) return; // TEMP DEV FALLBACK — local-only, nothing to persist.
    await db.from("menu_progress").upsert({ team_member_id: session.teamMemberId, source_item_id: id, mastery: rating, last_reviewed: new Date().toISOString() }, { onConflict: "team_member_id,source_item_id" });
    // Server-side visibility for the owner's team-activity dashboard (today_count/last_study_date
    // on leaderboard) — separate from the localStorage-based daily-bonus tracking above.
    if (justMasteredFresh) {
      await db.rpc("bump_daily_progress", { p_restaurant_id: session.restaurantId, p_team_member_id: session.teamMemberId, p_name: session.name });
    }
    if (crossed) {
      const points = nextMasteredSize * 100 + newBonusTotal;
      await db.from("leaderboard").upsert({ restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, name: session.name, points, mastered_count: nextMasteredSize, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,team_member_id" });
    }
  };

  const finishSpeed = (correctCount) => {
    if (correctCount > bestSpeed) { setBestSpeed(correctCount); saveNum("menu-app-best-speed", session?.teamMemberId, correctCount); }
  };

  if (mode === "flashcards") return <Flashcards items={modeItems || cards} onRate={learnItem} onDone={exitMode} />;
  if (mode === "quiz") return <Quiz items={modeItems || cards} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "match") return <Matching items={modeItems || cards} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "speed") return <Speed items={modeItems || cards} onAnswer={learnItem} onDone={exitMode} onFinish={finishSpeed} />;
  if (mode === "allergens") return <AllergenQuiz items={modeItems || cards} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "namecomplete") return <NameCompletion items={modeItems || cards} onAnswer={learnItem} onDone={exitMode} />;

  const pct = cards?.length ? Math.round((mastered.size / cards.length) * 100) : 0;
  const myRank = leaderboard.findIndex(r => r.team_member_id === session?.teamMemberId) + 1;
  const myStreak = leaderboard.find(r => r.team_member_id === session?.teamMemberId)?.streak || 0;
  const cats = ["starters", "mains", "desserts", "drinks"].map(c => ({ c, items: cards?.filter(x => x.category === c) || [] })).filter(g => g.items.length > 0);

  const dailyDone = daily.count >= DAILY_TARGET;
  const challenges = cards ? [
    {
      id: "daily", icon: Sparkles, color: "#f3a712", title: "אתגר יומי",
      desc: dailyDone ? `הושלם! זכיתם ב-${DAILY_BONUS} נקודות בונוס` : `למדו ${DAILY_TARGET} מנות חדשות היום`,
      progress: Math.min(daily.count, DAILY_TARGET), target: DAILY_TARGET, done: dailyDone,
      action: dailyDone ? null : { label: "התחילו ללמוד", onClick: () => { setModeItems(null); setMode("flashcards"); } },
    },
    {
      id: "allergens", icon: AlertTriangle, color: "#e0315a", title: "אתגר האלרגיות",
      desc: "קראו את שם המנה וזהו את כל האלרגיות שבה", progress: null, target: null, done: false,
      action: { label: "לאתגר האלרגיות", onClick: () => { setModeItems(null); setMode("allergens"); } },
    },
    {
      id: "namecomplete", icon: ListChecks, color: "#3a86ff", title: "התאימו תיאור למנה",
      desc: "קראו את שם המנה ובחרו את התיאור הנכון מבין 3 אפשרויות", progress: null, target: null, done: false,
      action: { label: "לאתגר", onClick: () => { setModeItems(null); setMode("namecomplete"); } },
    },
    {
      id: "full", icon: Trophy, color: "#22c08c", title: "שליטה מלאה בתפריט",
      desc: "למדו את כל המנות בתפריט", progress: mastered.size, target: cards.length,
      done: cards.length > 0 && mastered.size >= cards.length, action: null,
    },
    {
      id: "speed", icon: Zap, color: "#ff7a59", title: "שיא מהירות",
      desc: bestSpeed > 0 ? `השיא שלכם: ${bestSpeed} תשובות נכונות ב-30 שניות` : "ענו נכון על כמה שיותר מנות תוך 30 שניות",
      progress: null, target: null, done: false,
      action: { label: bestSpeed > 0 ? "נסו לשבור את השיא" : "התחילו אתגר מהירות", onClick: () => { setModeItems(null); setMode("speed"); } },
    },
    {
      id: "streak", icon: Flame, color: "#e0315a", title: "רצף למידה",
      desc: myStreak > 0 ? `${myStreak} ימים ברצף — כל הכבוד!` : "תרגלו יום אחרי יום כדי לפתוח רצף",
      progress: Math.min(myStreak, 3), target: 3, done: myStreak >= 3, action: null,
    },
  ] : [];

  // Home-page promo carousel — "ad"-style banners for the daily challenge and other
  // team members' live achievements (streak/points leaders), so the home screen hypes
  // up what's actually happening in the team, not just static shortcuts.
  const streakLeader = [...leaderboard].filter(r => (r.streak || 0) > 1).sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
  const pointsLeader = leaderboard[0];
  const promos = cards ? [
    {
      id: "daily", gradient: "linear-gradient(135deg,#f3a712,#ff7a59)", icon: Sparkles,
      kicker: "אתגר יומי", title: dailyDone ? `הושלם! +${DAILY_BONUS} נקודות בונוס 🎉` : `למדו ${DAILY_TARGET} מנות היום`,
      subtitle: dailyDone ? "חזרו מחר לאתגר חדש" : `עוד ${DAILY_TARGET - daily.count} ותקבלו ${DAILY_BONUS} נקודות בונוס`,
      cta: dailyDone ? "לכל האתגרים" : "בואו נתחיל", onClick: () => { if (dailyDone) setTab("challenges"); else { setModeItems(null); setMode("flashcards"); } },
    },
    streakLeader && streakLeader.team_member_id !== session?.teamMemberId ? {
      id: "streak-leader", gradient: "linear-gradient(135deg,#e0315a,#ff7a59)", icon: Flame,
      kicker: "בשרשרת חמה", title: `${streakLeader.name} ברצף של ${streakLeader.streak} ימים! 🔥`,
      subtitle: "מי מצליח/ה להדביק אותם?", cta: "לדירוג", onClick: () => setTab("leaderboard"),
    } : null,
    pointsLeader && pointsLeader.team_member_id !== session?.teamMemberId ? {
      id: "points-leader", gradient: "linear-gradient(135deg,#6d5efc,#9b7bff)", icon: Trophy,
      kicker: "בראש הטבלה", title: `${pointsLeader.name} מוביל/ה עם ${pointsLeader.points} נקודות`,
      subtitle: "הצטרפו לתחרות ותתפסו אותם", cta: "לדירוג המלא", onClick: () => setTab("leaderboard"),
    } : null,
    {
      id: "match", gradient: "linear-gradient(135deg,#22c08c,#1aa376)", icon: Repeat,
      kicker: "משחק חדש", title: "משחק ההתאמה", subtitle: "התאימו מנות למרכיבים שלהן במהירות שיא",
      cta: "לשחק", onClick: () => { setModeItems(null); setMode("match"); },
    },
    {
      id: "speed", gradient: "linear-gradient(135deg,#3a86ff,#6d5efc)", icon: Zap,
      kicker: "אתגר מהירות", title: bestSpeed > 0 ? `שברו את השיא של ${bestSpeed}!` : "כמה תשובות נכונות תספיקו?",
      subtitle: "30 שניות על השעון", cta: "לאתגר", onClick: () => { setModeItems(null); setMode("speed"); },
    },
  ].filter(Boolean) : [];

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      {/* Header */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onSignOut} className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]"><LogOut size={16} /></button>
        <div className="text-center">
          <p className="text-sm font-black">{session?.name}</p>
          {session?.restaurantName && <p className="text-[10px] text-[#8a8aa0] font-semibold">{session.restaurantName}</p>}
        </div>
        {myRank > 0 && <span className="text-[11px] font-bold text-[#f3c14b] bg-[#33290f] px-2 py-1 rounded-md">מקום {myRank}</span>}
      </div>
      {session?.offline && (
        <div className="bg-[#33290f] border-b border-[#664400] px-4 py-1.5 flex items-center gap-1.5 flex-shrink-0">
          <WifiOff size={12} className="text-[#f3c14b]" />
          <p className="text-[10px] font-bold text-[#f3c14b]">מצב לוקאלי — Supabase לא זמין, כלום לא נשמר באמת</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "home" && (
          <div className="space-y-3">
            {(session?.restaurantDescription || session?.restaurantCuisineTypes?.length > 0) && (
              <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3">
                {session?.restaurantCuisineTypes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {session.restaurantCuisineTypes.map((c) => (
                      <span key={c} className="bg-[#6d5efc]/15 border border-[#6d5efc]/40 text-[#a79bff] text-[10px] font-bold px-2 py-0.5 rounded-full">{c}</span>
                    ))}
                  </div>
                )}
                {session?.restaurantDescription && (
                  <p className="text-xs text-[#8a8aa0] leading-relaxed">{session.restaurantDescription}</p>
                )}
              </div>
            )}
            <PromoCarousel items={promos} />
            <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
              <p className="text-sm font-black mb-2">תרגול יומי</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMode("flashcards")} className="bg-[#16181c] text-[#6d5efc] font-bold text-xs py-2.5 rounded-lg">כרטיסיות</button>
                <button onClick={() => setMode("quiz")} className="bg-white/20 text-white font-bold text-xs py-2.5 rounded-lg">חידון</button>
                <button onClick={() => setMode("match")} className="bg-white/20 text-white font-bold text-xs py-2.5 rounded-lg">התאמה</button>
                <button onClick={() => setMode("speed")} className="bg-white/20 text-white font-bold text-xs py-2.5 rounded-lg">מהירות</button>
              </div>
            </div>
            <div className="bg-[#16181c] rounded-lg p-3">
              <p className="text-xs font-bold text-[#8a8aa0] mb-2">התקדמות</p>
              <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mb-2">
                <div className="h-full bg-[#6d5efc]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-[#8a8aa0]">{mastered.size}/{cards?.length || 0} פריטים — {pct}%</p>
            </div>
            <button onClick={() => setTab("challenges")} className="w-full bg-[#16181c] rounded-lg p-3 flex items-center gap-3 text-right">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#3a2a0f" }}>
                <Sparkles size={16} className="text-[#f3a712]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[#eef0f6]">אתגר יומי</p>
                <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mt-1.5 mb-1">
                  <div className="h-full bg-[#f3a712]" style={{ width: `${Math.min(100, (daily.count / DAILY_TARGET) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-[#8a8aa0]">{Math.min(daily.count, DAILY_TARGET)}/{DAILY_TARGET} מנות היום{dailyDone ? ` · הושלם +${DAILY_BONUS}` : ""}</p>
              </div>
              <span className="text-[10px] font-bold text-[#f3a712] flex-shrink-0">כל האתגרים ←</span>
            </button>
            {brief?.missing_items?.length > 0 && (
              <div className="bg-[#33290f] border border-[#664400] rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-[#f3c14b] mb-1">❌ חסרים היום</p>
                <p className="text-xs text-[#f3c14b]">{brief.missing_items.join(", ")}</p>
              </div>
            )}
            {brief?.new_items?.length > 0 && (
              <div className="bg-[#15302b] border border-[#0d8066] rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-[#22c08c] mb-1">⭐ חדש היום</p>
                <p className="text-xs text-[#22c08c]">{brief.new_items.join(", ")}</p>
              </div>
            )}
          </div>
        )}
        {tab === "daily" && (
          <div className="bg-[#16181c] rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-[#8a8aa0] mb-2">עדכון המנהל</p>
            {brief?.missing_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#f3c14b]">❌ חסרים:</span><p className="text-xs text-[#f3c14b] mt-0.5">{brief.missing_items.join(", ")}</p></div>}
            {brief?.new_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#22c08c]">⭐ חדש:</span><p className="text-xs text-[#22c08c] mt-0.5">{brief.new_items.join(", ")}</p></div>}
            {brief?.oven_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#6d5efc]">📦 מעלה:</span><p className="text-xs text-[#6d5efc] mt-0.5">{brief.oven_items.join(", ")}</p></div>}
            {brief?.notes && <div><span className="text-[10px] font-bold text-[#8a8aa0]">הערה:</span><p className="text-xs text-[#8a8aa0] mt-0.5">{brief.notes}</p></div>}
            {!brief?.missing_items?.length && !brief?.new_items?.length && !brief?.oven_items?.length && !brief?.notes && (
              <p className="text-xs text-[#8a8aa0]">אין עדכונים היום</p>
            )}
          </div>
        )}
        {tab === "leaderboard" && (
          <div className="bg-[#16181c] rounded-lg overflow-hidden">
            {leaderboard.length === 0 && <p className="text-xs text-[#8a8aa0] p-4 text-center">עדיין אין נתונים — התחילו ללמוד!</p>}
            {leaderboard.slice(0, 10).map((r, i) => (
              <div key={r.team_member_id} className={`flex items-center gap-2 px-3 py-2 ${i > 0 ? "border-t border-[#22252b]" : ""}`}>
                <span className="text-xs font-black w-5" style={{ color: ["#f3c14b", "#c7ccd6", "#cd8b5b"][i] || "#8a8aa0" }}>{i + 1}</span>
                <span className="w-6 h-6 rounded-full text-[9px] font-black flex items-center justify-center text-white flex-shrink-0" style={{ background: colorFor(r.name) }}>{r.name[0]}</span>
                <div className="flex-1">
                  <p className={`text-xs font-bold ${r.team_member_id === session?.teamMemberId ? "text-[#6d5efc]" : "text-[#eef0f6]"}`}>{r.name}{r.team_member_id === session?.teamMemberId ? " (אני)" : ""}</p>
                  <p className="text-[10px] text-[#8a8aa0] flex items-center gap-1">{r.mastered_count} נלמדו{r.streak > 1 && <span className="flex items-center gap-0.5"><Flame size={9} className="text-[#ff7a59]" />{r.streak}</span>}</p>
                </div>
                <p className="text-xs font-black text-[#6d5efc]">{r.points}</p>
              </div>
            ))}
          </div>
        )}
        {tab === "categories" && (
          <div className="space-y-2">
            <p className="text-[10px] text-[#8a8aa0] px-1">לחצו על קטגוריה כדי לתרגל רק אותה</p>
            {cats.map(({ c, items }) => {
              const known = items.filter(x => mastered.has(x.id)).length;
              const catPct = items.length ? Math.round((known / items.length) * 100) : 0;
              return (
                <button
                  key={c} onClick={() => { setModeItems(items); setMode("flashcards"); }}
                  className="w-full bg-[#16181c] rounded-lg p-2.5 text-right active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-black text-[#eef0f6]">{CAT_LABELS[c]}</p>
                    <span className="text-[11px] font-bold text-[#6d5efc]">{known}/{items.length}</span>
                  </div>
                  <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
                    <div className="h-full bg-[#6d5efc]" style={{ width: `${catPct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {tab === "challenges" && (
          <div className="space-y-2">
            {challenges.map(ch => (
              <div key={ch.id} className="bg-[#16181c] rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${ch.color}22` }}>
                    <ch.icon size={16} style={{ color: ch.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-[#eef0f6]">{ch.title}</p>
                      {ch.done && <Check size={14} className="text-[#22c08c] flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-[#8a8aa0] mt-0.5">{ch.desc}</p>
                  </div>
                </div>
                {ch.target != null && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.min(100, (ch.progress / ch.target) * 100)}%`, background: ch.color }} />
                    </div>
                    <p className="text-[10px] text-[#8a8aa0] mt-1">{ch.progress}/{ch.target}</p>
                  </div>
                )}
                {ch.action && !ch.done && (
                  <button onClick={ch.action.onClick} className="w-full mt-2 py-2 rounded-lg text-[11px] font-bold text-white" style={{ background: ch.color }}>{ch.action.label}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav tab={tab} setTab={setTab}
        hasDailyUpdate={!!(brief?.missing_items?.length || brief?.new_items?.length || brief?.oven_items?.length)}
        hasChallenge={!dailyDone} />
    </div>
  );
}

function BottomNav({ tab, setTab, hasDailyUpdate, hasChallenge }) {
  const items = [
    ["home", Home, "בית", false],
    ["challenges", Target, "אתגרים", hasChallenge],
    ["daily", BookOpen, "יומי", hasDailyUpdate],
    ["leaderboard", Trophy, "דירוג", false],
    ["categories", BarChart3, "תפריט", false],
  ];
  return (
    <div
      className="flex-shrink-0 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      style={{ background: "rgba(22,24,28,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex">
        {items.map(([t, Icon, label, badge]) => {
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} className="flex-1 flex flex-col items-center gap-1 py-1 relative transition-colors">
              {active && <div className="absolute inset-x-2 top-0 h-9 bg-white/[0.07] rounded-2xl" />}
              <div className="relative">
                <Icon size={20} strokeWidth={active ? 2.3 : 1.6} className={active ? "text-white" : "text-[#8a8aa0]"} />
                {badge && <span className="absolute -top-1 -left-1.5 w-2 h-2 rounded-full bg-[#e0315a]" />}
              </div>
              <span className={`text-[10px] font-semibold transition-colors ${active ? "text-white" : "text-[#8a8aa0]"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "Ad"-style promo carousel: one full-width slide at a time, auto-advances, swipeable,
// dot indicators. Each slide hypes up something real (daily challenge, a teammate's
// streak, the points leader) or teases a game mode — tapping jumps straight into it.
function PromoCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIndex(i => (i + 1) % items.length), 4500);
    return () => clearInterval(t);
  }, [items.length]);

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    setIndex(i => dx < 0 ? (i + 1) % items.length : (i - 1 + items.length) % items.length);
  };

  if (!items.length) return null;
  const p = items[Math.min(index, items.length - 1)];
  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button
        key={p.id} onClick={p.onClick}
        className="animate-fadeIn w-full text-right rounded-2xl p-4 text-white flex flex-col justify-between min-h-[112px]"
        style={{ background: p.gradient }}
      >
        <div className="flex items-center gap-1.5">
          <p.icon size={13} />
          <span className="text-[10px] font-black opacity-90">{p.kicker}</span>
        </div>
        <div>
          <p className="text-base font-black leading-tight mb-1">{p.title}</p>
          <p className="text-xs opacity-90 mb-2.5">{p.subtitle}</p>
          <span className="inline-flex items-center gap-1 bg-white/20 rounded-lg px-3 py-1.5 text-xs font-bold">
            {p.cta} <ChevronLeft size={12} />
          </span>
        </div>
      </button>
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {items.map((_, i) => (
            <button key={i} onClick={() => setIndex(i)} className="p-1" aria-label={`שקופית ${i + 1}`}>
              <span className="block rounded-full transition-all duration-300" style={{ width: i === index ? 16 : 6, height: 6, background: i === index ? "#eef0f6" : "#3a3d45" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The one genuinely subjective mode — there's nothing to objectively check when you're
// just looking at a card, so the player self-rates 1-5 after reveal. Every other mode
// grades itself instead (see learnItem in MainApp).
function Flashcards({ items, onRate, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!items?.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (i >= items.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">סיימת!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = items[i];
  const rate = (v) => { onRate(it.id, v); setRevealed(false); setI(i + 1); };
  const RATING_STYLE = { 1: "bg-[#3a1d22] text-[#e0315a]", 2: "bg-[#3a1d22] text-[#e0315a]", 3: "bg-[#33290f] text-[#f3a712]", 4: "bg-[#15302b] text-[#22c08c]", 5: "bg-[#15302b] text-[#22c08c]" };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{items.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="bg-[#16181c] rounded-xl p-6 w-full text-center space-y-3">
          <p className="text-2xl font-black text-[#eef0f6]">{it.name}</p>
          {!revealed && (
            <>
              {(it.ingredients?.length > 0 || it.allergens?.length > 0) && (
                <p className="text-[11px] font-bold text-[#8a8aa0]">
                  {[
                    it.ingredients?.length > 0 && `${it.ingredients.length} מרכיבים`,
                    it.allergens?.length > 0 && `${it.allergens.length} אלרגיות`,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              <button onClick={() => setRevealed(true)} className="w-full py-2.5 rounded-lg font-bold bg-[#6d5efc] text-white text-xs">חשוף</button>
            </>
          )}
          {revealed && (
            <>
              {it.desc && <p className="text-xs text-[#c4c4d4]">{it.desc}</p>}
              {it.ingredients?.length > 0 && <p className="text-[11px] text-[#8a8aa0]">מרכיבים: {it.ingredients.join(", ")}</p>}
              {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-[10px] font-bold text-[#e0315a]">אלרגיות: {it.allergens.join(", ")}</p></div>}
              <div className="pt-1">
                <p className="text-[10px] font-bold text-[#8a8aa0] mb-1.5">כמה טוב ידעתם?</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} onClick={() => rate(v)} className={`py-2.5 rounded-lg font-black text-sm ${RATING_STYLE[v]}`}>{v}</button>
                  ))}
                </div>
                <div className="flex justify-between mt-1 px-0.5">
                  <span className="text-[9px] text-[#8a8aa0]">לא ידעתי</span>
                  <span className="text-[9px] text-[#8a8aa0]">ידעתי מצוין</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Objective — right/wrong is checkable, so the game grades itself: correct → 5,
// wrong → 2. No self-report here, unlike Flashcards.
// Objective: read the description, pick the matching dish name among 4 options — the
// multiple-choice mirror of NameCompletion's name→description below. Price was dropped
// entirely (2026-08-11, user feedback): it's irrelevant to knowing the menu, and some
// dish *names* have a price baked into them (data-quality issue, fixed separately once
// the real menu text is in), so quizzing on price actively worked against the concept.
function Quiz({ items, onAnswer, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const pool = useMemo(() => (items || []).filter(it => it.desc), [items]);
  const qs = useMemo(() => shuffle(pool).slice(0, 8).map(it => ({
    it,
    opts: shuffle([it.name, ...pickDistractors(pool, it, 3).map(x => x.name)]),
  })), [pool]);
  if (pool.length < 4) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>צריך לפחות 4 מנות עם תיאור</p></div>;
  if (i >= qs.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{qs.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = qs[i];
  const next = (opt) => {
    setPicked(opt);
    const correct = opt === q.it.name;
    if (correct) setScore(s => s + 1);
    onAnswer(q.it.id, correct ? 5 : 2);
    setTimeout(() => { setPicked(null); setI(i + 1); }, 500);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold text-[#eef0f6]">{i + 1}/{qs.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3">
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">איזו מנה מתאימה לתיאור?</p>
          <p className="text-sm font-black text-[#eef0f6]">{q.it.desc}</p>
        </div>
        <div className="space-y-2">
          {q.opts.map((opt, j) => {
            const isCorrect = picked && opt === q.it.name;
            const isWrong = picked === opt && opt !== q.it.name;
            return (
              <button key={j} disabled={!!picked} onClick={() => next(opt)} className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right transition-colors ${isCorrect ? "bg-[#22c08c] text-white" : isWrong ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>{opt}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Quizlet-style Match: a shuffled grid of name+key-ingredients tiles; tap two tiles to
// pair them. Was name+price — switched 2026-08-11 (user feedback): price isn't relevant
// to menu knowledge, and some dish *names* have a price baked into them (data-quality
// issue from the seed data), which made price tiles actively misleading.
// Objective — a pair matched with zero wrong attempts grades 5, one wrong attempt 4,
// two 3, three+ 2. No self-report; guessing wrong repeatedly costs you the rating.
function Matching({ items, onAnswer, onDone }) {
  const deck = useMemo(() => {
    const chosen = shuffle((items || []).filter(it => it.ingredients?.length > 0)).slice(0, 6);
    const tiles = chosen.flatMap(it => [
      { key: `${it.id}-name`, pairId: it.id, kind: "name", label: it.name },
      { key: `${it.id}-ing`, pairId: it.id, kind: "ing", label: it.ingredients.slice(0, 3).join(", ") },
    ]);
    return shuffle(tiles);
  }, [items]);

  const [matched, setMatched] = useState(new Set());
  const [sel, setSel] = useState([]);
  const [wrongPair, setWrongPair] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const startedRef = useRef(Date.now());
  const wrongAttemptsRef = useRef(new Map()); // pairId -> count, for objective grading

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פריטים</p></div>;

  const done = matched.size === deck.length;
  if (done && running) setRunning(false);

  const tap = (tile) => {
    if (matched.has(tile.key) || sel.find(s => s.key === tile.key) || wrongPair.length) return;
    const nextSel = [...sel, tile];
    setSel(nextSel);
    if (nextSel.length === 2) {
      const [a, b] = nextSel;
      if (a.pairId === b.pairId && a.kind !== b.kind) {
        setMatched(m => new Set(m).add(a.key).add(b.key));
        setSel([]);
        const wrongCount = wrongAttemptsRef.current.get(a.pairId) || 0;
        const rating = wrongCount === 0 ? 5 : wrongCount === 1 ? 4 : wrongCount === 2 ? 3 : 2;
        onAnswer(a.pairId, rating);
      } else {
        // A wrong guess counts against BOTH tiles involved — whichever one the player
        // eventually matches correctly will remember this miss.
        wrongAttemptsRef.current.set(a.pairId, (wrongAttemptsRef.current.get(a.pairId) || 0) + 1);
        wrongAttemptsRef.current.set(b.pairId, (wrongAttemptsRef.current.get(b.pairId) || 0) + 1);
        setWrongPair([a.key, b.key]);
        setTimeout(() => { setWrongPair([]); setSel([]); }, 550);
      }
    }
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button>
        <p className="text-xs font-bold text-[#eef0f6]">התאמה</p>
        <p className="text-xs font-black text-[#f3c14b]">⏱ {seconds}s</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {deck.map(tile => {
            const isMatched = matched.has(tile.key);
            const isSelected = sel.find(s => s.key === tile.key);
            const isWrong = wrongPair.includes(tile.key);
            return (
              <button
                key={tile.key}
                onClick={() => tap(tile)}
                disabled={isMatched}
                className={`min-h-[72px] px-2 py-2 rounded-lg font-bold text-center text-[11px] leading-tight flex items-center justify-center transition-all duration-150 ${
                  isMatched ? "bg-[#15302b] text-[#22c08c] opacity-40" :
                  isWrong ? "bg-[#e0315a] text-white animate-pulse" :
                  isSelected ? "bg-[#6d5efc] text-white scale-95" :
                  "bg-[#16181c] text-[#eef0f6] border border-[#22252b]"
                }`}
              >
                {tile.label}
              </button>
            );
          })}
        </div>
        {done && (
          <div className="text-center mt-6">
            <Trophy size={32} className="text-[#f3c14b] mx-auto mb-2" />
            <p className="text-sm font-black text-[#eef0f6] mb-3">סיימת ב-{seconds} שניות!</p>
            <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold">סיום</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Objective, faster-paced version of the name→ingredient idea (3 options, 30s overall
// clock instead of per-question) — was originally a self-report "ידעתי/לא יודע" button
// pair, then a price quiz; both replaced (2026-08-11, user feedback: price is irrelevant
// to menu knowledge and self-report is unverifiable — this keeps neither).
function Speed({ items, onAnswer, onDone, onFinish }) {
  const pool = useMemo(() => (items || []).filter(it => it.ingredients?.length > 0), [items]);
  const deck = useMemo(() => shuffle(pool).slice(0, 12).map(it => {
    const a = shuffle(it.ingredients)[0];
    const otherIngredients = [...new Set(pickDistractors(pool, it, 6).flatMap(x => x.ingredients))].filter(ing => ing !== a);
    return { it, a, opts: shuffle([a, ...shuffle(otherIngredients).slice(0, 2)]) };
  }), [pool]);
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [time, setTime] = useState(30);
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    if (time <= 0) return;
    const t = setInterval(() => setTime(x => x - 1), 1000);
    return () => clearInterval(t);
  }, [time]);
  const finished = time <= 0 || i >= deck.length;
  // Fires exactly once on the false→true transition (both `time` and `i` only move forward).
  useEffect(() => { if (finished) onFinish?.(correct); }, [finished]);
  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פריטים</p></div>;
  if (finished) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Zap size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{correct} נכונים!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = deck[i];
  const answer = (opt) => {
    setPicked(opt);
    const isCorrect = opt === q.a;
    if (isCorrect) setCorrect(c => c + 1);
    onAnswer(q.it.id, isCorrect ? 5 : 2);
    setTimeout(() => { setPicked(null); setI(x => x + 1); }, 350);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><span className="text-xs font-bold text-[#f3c14b]">⏱ {time}s</span><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center w-full">
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-2">איזה מרכיב שייך למנה הזו?</p>
          <p className="text-lg font-black mb-4">{q.it.name}</p>
          <div className="flex flex-col gap-2">
            {q.opts.map((opt, j) => {
              const isCorrectOpt = picked && opt === q.a;
              const isWrongPick = picked && opt === picked && opt !== q.a;
              return (
                <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                  className={`py-3 rounded-lg font-black text-sm transition-colors ${isCorrectOpt ? "bg-[#22c08c] text-white" : isWrongPick ? "bg-[#e0315a] text-white" : "bg-[#16181c] border border-[#22252b] text-[#eef0f6]"}`}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];

// Objective: pick every allergen the dish actually has (submitting with none selected
// is itself the "no allergens" answer). Exact-set match required — no partial credit —
// since a missed allergen in real life isn't a "partial" mistake.
function AllergenQuiz({ items, onAnswer, onDone }) {
  const deck = useMemo(() => shuffle(items || []).slice(0, 8), [items]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין פריטים</p></div>;
  if (i >= deck.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{deck.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = deck[i];
  const actual = new Set(it.allergens || []);
  const toggle = (a) => { if (submitted) return; setSelected(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; }); };
  const submit = () => {
    if (submitted) return;
    const correct = selected.size === actual.size && [...selected].every(a => actual.has(a));
    if (correct) setScore(s => s + 1);
    onAnswer(it.id, correct ? 5 : 2);
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setSelected(new Set()); setI(x => x + 1); }, 1400);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3 text-center">
          <p className="text-sm font-black mb-1">{it.name}</p>
          <p className="text-[10px] text-[#8a8aa0]">אילו אלרגיות יש במנה הזו?</p>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ALLERGENS.map(a => {
            const on = selected.has(a);
            const showCorrect = submitted && actual.has(a);
            const showWrongPick = submitted && on && !actual.has(a);
            return (
              <button key={a} disabled={submitted} onClick={() => toggle(a)}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showCorrect ? "bg-[#22c08c] text-white border-[#22c08c]" :
                  showWrongPick ? "bg-[#e0315a] text-white border-[#e0315a]" :
                  on ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]"
                }`}>
                {a}
              </button>
            );
          })}
        </div>
        {!submitted && (
          <button onClick={submit} className="w-full py-2.5 rounded-lg font-bold text-xs bg-[#6d5efc] text-white">
            {selected.size === 0 ? "אין אלרגיות / שליחה" : "שליחה"}
          </button>
        )}
        {submitted && actual.size === 0 && <p className="text-[11px] text-center text-[#8a8aa0] mt-2">אין אלרגיות במנה זו</p>}
      </div>
    </div>
  );
}

// Objective: show the dish name, tap the correct description among 2 distractors.
// Was originally "read the description, type the dish's name" — replaced 2026-08-11
// (user feedback): the real menu's dish names are English/transliterated, so exact-match
// free-text typing was mostly testing spelling, not menu knowledge. Tap-only removes that
// friction entirely while keeping the grading objective (still can't self-report a lie).
function NameCompletion({ items, onAnswer, onDone }) {
  const pool = useMemo(() => (items || []).filter(it => it.desc), [items]);
  const deck = useMemo(() => shuffle(pool).slice(0, 8).map(it => ({
    it,
    options: shuffle([it.desc, ...pickDistractors(pool, it, 2).map(x => x.desc)]),
  })), [pool]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  if (pool.length < 3) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>צריך לפחות 3 מנות עם תיאור</p></div>;
  if (i >= deck.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{deck.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = deck[i];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const correct = opt === q.it.desc;
    if (correct) setScore(s => s + 1);
    onAnswer(q.it.id, correct ? 5 : 2);
    setTimeout(() => { setPicked(null); setI(x => x + 1); }, 1400);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full text-center space-y-3">
          <p className="text-[10px] font-bold text-[#8a8aa0]">איזה תיאור מתאים למנה?</p>
          <p className="text-lg font-black mb-3">{q.it.name}</p>
          <div className="flex flex-col gap-2">
            {q.options.map((opt, j) => {
              const isCorrectOpt = picked && opt === q.it.desc;
              const isWrongPick = picked === opt && opt !== q.it.desc;
              return (
                <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                  className={`py-3 px-3 rounded-lg font-bold text-sm text-right leading-snug transition-colors ${isCorrectOpt ? "bg-[#22c08c] text-white" : isWrongPick ? "bg-[#e0315a] text-white" : "bg-[#16181c] border border-[#22252b] text-[#eef0f6]"}`}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const shuffle = a => [...a].sort(() => Math.random() - 0.5);

// Picks `count` distractors for a multiple-choice question, preferring dishes from the
// SAME category as `it` first (e.g. another pasta for a pasta dish) — a random distractor
// from a totally different category (a salad next to a pasta) is trivially eliminated by
// elimination alone, which isn't testing menu knowledge. Falls back to any other item if
// the category doesn't have enough dishes to fill the count.
function pickDistractors(pool, it, count) {
  const others = pool.filter(x => x.id !== it.id);
  const sameCategory = shuffle(others.filter(x => x.category === it.category));
  const rest = shuffle(others.filter(x => x.category !== it.category));
  return [...sameCategory, ...rest].slice(0, count);
}
