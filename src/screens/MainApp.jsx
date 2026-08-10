import { useEffect, useState, useMemo, useRef } from "react";
import { Trophy, BookOpen, Zap, BarChart3, Home, LogOut, Flame, WifiOff, Target, Sparkles, Check } from "lucide-react";
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
      const { data } = await db.from("published_menu").select("*");
      if (alive) setCards((data || []).map(pubToCard));
      const { data: m } = await db.from("menu_progress").select("source_item_id, mastery").eq("team_member_id", session?.teamMemberId);
      if (alive) setMastered(new Set((m || []).filter(r => (r.mastery ?? 0) >= 4).map(r => r.source_item_id)));
      const { data: l } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
      if (alive) setLeaderboard(l || []);
      const today = new Date().toISOString().slice(0, 10);
      const { data: b } = await db.from("daily_brief").select("*").eq("restaurant_id", session?.restaurantId).eq("date", today).maybeSingle();
      if (alive) setBrief(b || {});
    })();

    // Real-time leaderboard: every team member's rating updates everyone's screen instantly.
    const channel = db.channel(`leaderboard-${session?.restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "menu_app", table: "leaderboard", filter: `restaurant_id=eq.${session?.restaurantId}` }, refetchLeaderboard)
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [session?.restaurantId, session?.teamMemberId, session?.offline]);

  const learnItem = async (id, masteryValue = 5) => {
    if (mastered.has(id) || !session?.teamMemberId) return;
    const next = new Set(mastered).add(id);
    setMastered(next);

    // Daily challenge: 3 new dishes/day → one-time +50 bonus, persisted per team member.
    const base = daily.date === todayStr() ? daily : { date: todayStr(), count: 0, bonusAwarded: false };
    const newDaily = { date: todayStr(), count: base.count + 1, bonusAwarded: base.bonusAwarded || base.count + 1 >= DAILY_TARGET };
    const justEarnedBonus = !base.bonusAwarded && newDaily.bonusAwarded;
    setDaily(newDaily);
    saveDaily(session.teamMemberId, newDaily);
    const newBonusTotal = justEarnedBonus ? bonusTotal + DAILY_BONUS : bonusTotal;
    if (justEarnedBonus) { setBonusTotal(newBonusTotal); saveNum("menu-app-bonus", session.teamMemberId, newBonusTotal); }

    const points = next.size * 100 + newBonusTotal;
    // Optimistic local leaderboard update so the rater sees their own score move instantly.
    setLeaderboard(prev => {
      const exists = prev.find(r => r.team_member_id === session.teamMemberId);
      const updated = exists
        ? prev.map(r => r.team_member_id === session.teamMemberId ? { ...r, points, mastered_count: next.size } : r)
        : [...prev, { restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, name: session.name, points, mastered_count: next.size, streak: 1, today_count: 1 }];
      return updated.sort((a, b) => b.points - a.points);
    });
    if (session.offline) return; // TEMP DEV FALLBACK — local-only, nothing to persist.
    await db.from("menu_progress").upsert({ team_member_id: session.teamMemberId, source_item_id: id, mastery: masteryValue, last_reviewed: new Date().toISOString() }, { onConflict: "team_member_id,source_item_id" });
    await db.from("leaderboard").upsert({ restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, name: session.name, points, mastered_count: next.size, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,team_member_id" });
  };

  const finishSpeed = (correctCount) => {
    if (correctCount > bestSpeed) { setBestSpeed(correctCount); saveNum("menu-app-best-speed", session?.teamMemberId, correctCount); }
  };

  if (mode === "flashcards") return <Flashcards items={modeItems || cards} onKnown={learnItem} onDone={exitMode} />;
  if (mode === "quiz") return <Quiz items={modeItems || cards} onCorrect={learnItem} onDone={exitMode} />;
  if (mode === "match") return <Matching items={modeItems || cards} onKnown={learnItem} onDone={exitMode} />;
  if (mode === "speed") return <Speed items={modeItems || cards} onKnown={learnItem} onDone={exitMode} onFinish={finishSpeed} />;

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
    ...cats.filter(({ items }) => items.filter(x => mastered.has(x.id)).length < items.length).map(({ c, items }) => {
      const known = items.filter(x => mastered.has(x.id)).length;
      return {
        id: `cat-${c}`, icon: BarChart3, color: "#6d5efc", title: `שליטה ב${CAT_LABELS[c]}`,
        desc: `סיימו ללמוד את כל פריטי ${CAT_LABELS[c]}`, progress: known, target: items.length, done: false,
        action: { label: "תרגול קטגוריה", onClick: () => { setModeItems(items); setMode("flashcards"); } },
      };
    }),
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

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      {/* Header */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onSignOut} className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]"><LogOut size={16} /></button>
        <p className="text-sm font-black">{session?.name}</p>
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
            {cats.map(({ c, items }) => {
              const known = items.filter(x => mastered.has(x.id)).length;
              const catPct = items.length ? Math.round((known / items.length) * 100) : 0;
              return (
                <div key={c} className="bg-[#16181c] rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-black text-[#eef0f6]">{CAT_LABELS[c]}</p>
                    <span className="text-[11px] font-bold text-[#6d5efc]">{known}/{items.length}</span>
                  </div>
                  <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
                    <div className="h-full bg-[#6d5efc]" style={{ width: `${catPct}%` }} />
                  </div>
                </div>
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
    ["categories", BarChart3, "קטגוריות", false],
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

function Flashcards({ items, onKnown, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!items?.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (i >= items.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">סיימת!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = items[i];
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{items.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="bg-[#16181c] rounded-xl p-6 w-full text-center space-y-3">
          <p className="text-2xl font-black text-[#eef0f6]">{it.name}</p>
          <p className="text-base font-bold text-[#ea7317]">₪{it.price}</p>
          {!revealed && <button onClick={() => setRevealed(true)} className="w-full py-2.5 rounded-lg font-bold bg-[#6d5efc] text-white text-xs">חשוף</button>}
          {revealed && (
            <>
              {it.desc && <p className="text-xs text-[#c4c4d4]">{it.desc}</p>}
              {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-[10px] font-bold text-[#e0315a]">אלרגנים: {it.allergens.join(", ")}</p></div>}
              <div className="flex gap-2">
                <button onClick={() => { onKnown(it.id); setRevealed(false); setI(i + 1); }} className="flex-1 py-2 rounded-lg font-bold text-xs bg-[#22c08c] text-white">ידעתי ✓</button>
                <button onClick={() => { setRevealed(false); setI(i + 1); }} className="flex-1 py-2 rounded-lg font-bold text-xs bg-[#22252b] text-[#c4c4d4]">עוד תרגול</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Quiz({ items, onCorrect, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const qs = useMemo(() => shuffle(items || []).slice(0, 8).map(it => ({
    q: `מה המחיר של ${it.name}?`,
    a: `₪${it.price}`,
    opts: shuffle([`₪${it.price}`, `₪${it.price + 10}`, `₪${Math.max(5, it.price - 10)}`, `₪${it.price + 20}`]),
    it,
  })), [items]);
  if (!qs.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (i >= qs.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{qs.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = qs[i];
  const next = (opt) => {
    setPicked(opt);
    const correct = opt === q.a;
    if (correct) { setScore(s => s + 1); onCorrect(q.it.id); }
    setTimeout(() => { setPicked(null); setI(i + 1); }, 500);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold text-[#eef0f6]">{i + 1}/{qs.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3"><p className="text-sm font-black text-[#eef0f6]">{q.q}</p></div>
        <div className="space-y-2">
          {q.opts.map((opt, j) => {
            const isCorrect = picked && opt === q.a;
            const isWrong = picked && opt === picked && opt !== q.a;
            return (
              <button key={j} disabled={!!picked} onClick={() => next(opt)} className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right transition-colors ${isCorrect ? "bg-[#22c08c] text-white" : isWrong ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>{opt}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Quizlet-style Match: a shuffled grid of name+price tiles; tap two tiles to pair them.
function Matching({ items, onKnown, onDone }) {
  const deck = useMemo(() => {
    // Never put two items with the same price in one round — identical price tiles
    // are visually indistinguishable and make a "correct-looking" match actually wrong.
    const seenPrices = new Set();
    const chosen = [];
    for (const it of shuffle(items || [])) {
      if (seenPrices.has(it.price)) continue;
      seenPrices.add(it.price);
      chosen.push(it);
      if (chosen.length === 6) break;
    }
    const tiles = chosen.flatMap(it => [
      { key: `${it.id}-name`, pairId: it.id, kind: "name", label: it.name },
      { key: `${it.id}-price`, pairId: it.id, kind: "price", label: `₪${it.price}` },
    ]);
    return shuffle(tiles);
  }, [items]);

  const [matched, setMatched] = useState(new Set());
  const [sel, setSel] = useState([]);
  const [wrongPair, setWrongPair] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const startedRef = useRef(Date.now());

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
        onKnown(a.pairId);
      } else {
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

function Speed({ items, onKnown, onDone, onFinish }) {
  const deck = useMemo(() => shuffle(items || []).slice(0, 12), [items]);
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [time, setTime] = useState(30);
  useEffect(() => {
    if (time <= 0) return;
    const t = setInterval(() => setTime(x => x - 1), 1000);
    return () => clearInterval(t);
  }, [time]);
  const finished = time <= 0 || i >= deck.length;
  // Fires exactly once on the false→true transition (both `time` and `i` only move forward).
  useEffect(() => { if (finished) onFinish?.(correct); }, [finished]);
  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין פריטים</p></div>;
  if (finished) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Zap size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{correct} נכונים!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = deck[i];
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><span className="text-xs font-bold text-[#f3c14b]">⏱ {time}s</span><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-black mb-1">{it.name}</p>
          <p className="text-sm text-[#8a8aa0] mb-4">₪{it.price}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setCorrect(c => c + 1); onKnown(it.id); setI(i + 1); }} className="px-4 py-3 rounded-lg bg-[#22c08c] text-white font-bold text-xs">ידעתי</button>
            <button onClick={() => setI(i + 1)} className="px-4 py-3 rounded-lg bg-[#22252b] text-[#c4c4d4] font-bold text-xs">לא יודע</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const shuffle = a => [...a].sort(() => Math.random() - 0.5);
