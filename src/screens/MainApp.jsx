import { useEffect, useState, useMemo, useRef } from "react";
import { Trophy, BookOpen, Zap, BarChart3, Home, LogOut, Flame, WifiOff, Target, Sparkles, Check, Repeat, ChevronLeft, AlertTriangle, ListChecks, GraduationCap, Lock } from "lucide-react";
import { supabase } from "../lib/supabase";
import MetricsScreen from "../components/MetricsScreen";
import BriefAck from "../components/BriefAck";
import { MOCK_CARDS, MOCK_BRIEF, MOCK_LEADERBOARD } from "../lib/mockMenu";
import { pickDistractors, buildWeightedDeck, availableFacets, dishLabel, withDisplayNames } from "../lib/questionEngine";
import { pathState } from "../lib/learningPath";
import { useStudyTime } from "../lib/studyTime";

const db = supabase.schema("menu_app");
// Legacy seeded menus store these English keys. Menus built in the owner app (paste/AI
// import) use free-text Hebrew category names instead, which need no translation — hence
// `catLabel` below rather than a bare lookup. Never filter on this list: see `cats`.
const CAT_LABELS = { starters: "ראשונות", mains: "עיקריות", desserts: "קינוחים", drinks: "קוקטיילים" };
const CAT_ORDER = ["starters", "mains", "desserts", "drinks"];
const catLabel = (c) => CAT_LABELS[c] || c;

// Imported categories carry their explanation after an em dash
// ("מאקי — 6 יחידות, אצה בחוץ ואורז בפנים"); the leading phrase is the serving style.
// Hebrew has no "1 items" — a count of one takes the singular noun, and this teaser line
// is read on every flashcard, so "1 מוקשים" stands out.
const countLabel = (arr, one, many) =>
  arr?.length > 0 ? `${arr.length} ${arr.length === 1 ? one : many}` : null;

const shortCat = (c) => catLabel(c || "").split(/\s*[—–]\s*/)[0].trim();

// How long the red/green answer feedback stays before advancing. Long enough to read
// which option was right — the previous ~1s read as a flash, especially since the deck
// used to reshuffle at the same moment.
const FEEDBACK_MS = 1800;
// A dish is "new to you" while it is both recently added and still untouched. Time-boxed
// so a waiter who simply never studied doesn't see the entire menu flagged as new forever
// — that backlog is the learning path's job, not the brief's.
const NEW_DISH_WINDOW_DAYS = 21;
const DAILY_TARGET = 3;
const DAILY_BONUS = 50;

function pubToCard(p) {
  const ing = (p.ingredients || []).filter(Boolean);
  // displayName is filled in by withDisplayNames once the whole menu is loaded — whether a
  // name needs its serving style depends on the other dishes, not on this row alone.
  // Four separate warning groups, never merged: "fish" is an allergy, "raw fish" is a
  // pregnancy warning, "coriander" is a preference. A waiter reading one combined list
  // can't tell which one could put a guest in hospital. See src/lib/dishFlags.js.
  return { id: p.source_item_id, name: p.name, price: Number(p.price), category: p.category, desc: p.description || "", ingredients: ing, allergens: (p.allergens || []).filter(Boolean), pregnancy: (p.pregnancy || []).filter(Boolean), pitfalls: (p.pitfalls || []).filter(Boolean), kashrut: (p.kashrut || []).filter(Boolean), menuPosition: p.menu_position, createdAt: p.created_at, isSpecial: !!p.is_special };
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
  // Raw 1-5 score per dish (id -> score). `mastered` above is still the >=4 threshold set
  // that drives points/daily-challenge/leaderboard; this map is what the *percentages*
  // are built from, so "4 out of 5 on every dish" reads as 80% instead of 100%.
  const [masteryById, setMasteryById] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [brief, setBrief] = useState(null);
  const [briefAck, setBriefAck] = useState(null);
  const [mode, setMode] = useState(null);
  const [showMetrics, setShowMetrics] = useState(false); // flashcards | quiz | match | speed | exam | …
  const [modeItems, setModeItems] = useState(null); // scoped items for a challenge round; null = full menu
  // Store the category key (e.g. "starters") for the DB record, and its Hebrew label for
  // display — the exam_results row keys off the former so it stays stable if labels change.
  const [examCategory, setExamCategory] = useState(null); // { key, label }
  // The staged path: what the owner configured, and which category exams this member has
  // already passed. Both feed learningPath.pathState, which derives every unlock.
  const [examConfig, setExamConfig] = useState(null);
  const [passedCats, setPassedCats] = useState([]);
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
      // Ordered, not incidental: the learning path teaches categories in menu order, and
      // menu_position is the dish's place in the restaurant's own printed menu — the
      // order they think about their food, and so the order to learn it in. created_at
      // covers dishes added by hand since the import; source_item_id makes it total, so
      // the learning path can't reshuffle between loads.
      const { data } = await db.from("published_menu").select("*")
        .eq("restaurant_id", session?.restaurantId)
        .order("menu_position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }).order("source_item_id", { ascending: true });
      if (alive) setCards(withDisplayNames((data || []).map(pubToCard)));
      // Presence, recorded separately from progress: the owner's status board needs to
      // distinguish "opened the app and did nothing" from "never showed up". Fire-and-
      // forget — a failure here must not affect the session.
      db.from("team_members").update({ last_seen_at: new Date().toISOString() })
        .eq("id", session?.teamMemberId).then(() => {}, () => {});
      const { data: m } = await db.from("menu_progress").select("source_item_id, mastery").eq("team_member_id", session?.teamMemberId);
      if (alive) {
        setMastered(new Set((m || []).filter(r => (r.mastery ?? 0) >= 4).map(r => r.source_item_id)));
        setMasteryById(Object.fromEntries((m || []).map(r => [r.source_item_id, r.mastery ?? 0])));
      }
      const { data: l } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
      if (alive) setLeaderboard(l || []);
      const { data: cfg } = await db.from("exam_config").select("*").eq("restaurant_id", session?.restaurantId).maybeSingle();
      if (alive) setExamConfig(cfg || {});
      const { data: exams } = await db.from("exam_results")
        .select("category").eq("team_member_id", session?.teamMemberId).eq("passed", true);
      if (alive) setPassedCats([...new Set((exams || []).map(r => r.category))]);
      const today = new Date().toISOString().slice(0, 10);
      const { data: b } = await db.from("daily_brief").select("*").eq("restaurant_id", session?.restaurantId).eq("date", today).maybeSingle();
      if (alive) setBrief(b || {});
      // Whether THIS waiter has already acknowledged today's brief. Reading is no longer
      // recorded automatically on load: that measured "opened the app", and the owner saw
      // a ✓ next to people who never looked. It is now an explicit action plus one
      // question drawn from the brief itself — see BriefAck.
      if (b && session?.teamMemberId) {
        const { data: ack } = await db.from("daily_brief_reads")
          .select("read_at, correct").eq("team_member_id", session.teamMemberId).eq("date", today).maybeSingle();
        if (alive) setBriefAck(ack || null);
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
    setMasteryById(prev => ({ ...prev, [id]: rating }));

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

  // One row per completed exam attempt, so the owner sees exam history (and repeat
  // failures) rather than only the current mastery snapshot. Per-dish scores already
  // went to menu_progress via learnItem — this is the attempt-level record.
  const recordExam = async ({ score, passed, dishCount }) => {
    if (!examCategory) return;
    // Unlock immediately and locally: the next category and its games should open on the
    // results screen, not after a reload. The DB row below is the durable record.
    if (passed) setPassedCats((prev) => prev.includes(examCategory.key) ? prev : [...prev, examCategory.key]);
    if (!session?.teamMemberId || session.offline) return;
    const { error } = await db.from("exam_results").insert({
      restaurant_id: session.restaurantId,
      team_member_id: session.teamMemberId,
      category: examCategory.key,
      score, passed, dish_count: dishCount,
    });
    // Non-fatal: the exam already counted via menu_progress, so a failed insert loses the
    // history row but not the trainee's progress. Don't interrupt the results screen.
    if (error) console.error("exam_results insert failed:", error);
  };

  // Time spent studying, and the periodic measurement points the owner's improvement
  // chart is drawn from. Reads mastery through a getter so the hook doesn't re-subscribe
  // on every single rating.
  useStudyTime({
    session,
    ready: !!cards?.length,
    getPct: () => {
      const list = cards || [];
      if (!list.length) return 0;
      return Math.round((list.reduce((s, x) => s + (masteryById[x.id] || 0), 0) / (list.length * 5)) * 100);
    },
  });

  // Every unlock in the app is derived here rather than stored, so a menu change or a
  // mastery change re-derives correctly. See lib/learningPath.js for the rules.
  const path = useMemo(() => {
    const list = cards || [];
    const seen = [...new Set(list.map((x) => x.category).filter(Boolean))];
    const defaultOrder = [...CAT_ORDER.filter((c) => seen.includes(c)), ...seen.filter((c) => !CAT_ORDER.includes(c))];
    return pathState(list, masteryById, passedCats, {
      ...examConfig,
      category_order: examConfig?.category_order?.length ? examConfig.category_order : defaultOrder,
    });
  }, [cards, masteryById, passedCats, examConfig]);

  // A game launched from a card carries its own scope; anything else draws only from the
  // categories the waiter has actually opened — never quizzing desserts they haven't
  // reached (QUESTION-QUALITY.md #9).
  // Frozen for the life of a round. Answering calls learnItem, which updates masteryById;
  // that recomputes `path` and hands back a NEW gamePool array, which invalidated every
  // game's useMemo mid-round and rebuilt the board — a matching grid would reshuffle the
  // moment you paired two tiles. Depending only on mode/scope pins the pool for the round.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gameItems = useMemo(() => modeItems || path.gamePool, [mode, modeItems]);
  // The owner's ranking, narrowed to what the open part of the menu can actually support.
  // Memoised because availableFacets builds a fresh array: an unstable reference here
  // invalidated the decks' useMemo on every render, so answering a question rebuilt and
  // reshuffled the deck underneath the feedback the trainee was still reading.
  const gameFacets = useMemo(
    () => (examConfig?.facets?.length ? examConfig.facets : availableFacets(gameItems)),
    [examConfig, gameItems]
  );

  // Dishes the owner added recently that this waiter has never opened. Drives the "have
  // you learned the new cocktail menu?" prompt on the home screen.
  const newDishes = useMemo(() => {
    const cutoff = Date.now() - NEW_DISH_WINDOW_DAYS * 86400000;
    return (cards || []).filter(
      (c) => c.createdAt && new Date(c.createdAt).getTime() >= cutoff && !(masteryById?.[c.id] > 0)
    );
  }, [cards, masteryById]);

  // Full-screen, above the tabs: it is a place you go to, not a tab you live in.
  if (showMetrics)
    return <MetricsScreen session={session} cards={cards} masteryById={masteryById} onDone={() => setShowMetrics(false)} />;

  if (mode === "flashcards") return <Flashcards items={gameItems} onRate={learnItem} onDone={exitMode} />;
  if (mode === "quiz") return <Quiz items={gameItems} facets={gameFacets} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "match") return <Matching items={gameItems} onAnswer={learnItem} onDone={exitMode} session={session} />;
  if (mode === "speed") return <Speed items={gameItems} onAnswer={learnItem} onDone={exitMode} onFinish={finishSpeed} />;
  if (mode === "allergens") return <AllergenQuiz items={gameItems} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "namecomplete") return <NameCompletion items={gameItems} facets={gameFacets} onAnswer={learnItem} onDone={exitMode} />;
  // Two graduation formats, same contract to recordExam.
  //
  // The chip exam (pick the exact ingredient set) is the better test, but it needs dishes
  // that HAVE ingredients, and it tests ingredients whether or not the owner ranked them.
  // When either of those isn't true, the category still has to be passable — otherwise the
  // whole path deadlocks behind a button that can never be pressed — so it falls back to a
  // multiple-choice exam built from the owner's own facets.
  if (mode === "exam") {
    const examItems = modeItems || cards;
    const label = examCategory ? shortCat(examCategory.key) : "התפריט";
    const chipExamPossible =
      (examItems || []).filter((x) => x.ingredients?.length > 0).length >= 2 &&
      (!examConfig?.facets?.length || examConfig.facets.includes("ingredients") || examConfig.facets.includes("allergens"));
    return chipExamPossible
      ? <CategoryExam items={examItems} categoryLabel={label} onAnswer={learnItem} onDone={exitMode} onFinish={recordExam} />
      : <QuizExam items={examItems} facets={gameFacets} categoryLabel={label} onAnswer={learnItem} onDone={exitMode} onFinish={recordExam} />;
  }

  // Success percentage = how much of the *available* score you've actually earned, not how
  // many dishes crossed the pass mark. 4/5 on every dish reads as 80%, which is what the
  // score actually means — a threshold count would round that up to a misleading 100%.
  const scorePct = (list) => {
    if (!list?.length) return 0;
    const earned = list.reduce((sum, x) => sum + (masteryById[x.id] || 0), 0);
    return Math.round((earned / (list.length * 5)) * 100);
  };

  const pct = scorePct(cards);
  const myRank = leaderboard.findIndex(r => r.team_member_id === session?.teamMemberId) + 1;
  const myStreak = leaderboard.find(r => r.team_member_id === session?.teamMemberId)?.streak || 0;
  // Derived from the menu itself, not a fixed list. Hardcoding the four English keys meant
  // any restaurant whose menu was built in the owner app — where categories are free-text
  // Hebrew — got an empty "תפריט" tab, and with no category rows there was no way to reach
  // an exam either. Known keys keep their canonical order; anything else follows in menu order.
  const cats = (() => {
    const seen = [...new Set((cards || []).map(x => x.category).filter(Boolean))];
    const ordered = [
      ...CAT_ORDER.filter(c => seen.includes(c)),
      ...seen.filter(c => !CAT_ORDER.includes(c)),
    ];
    return ordered.map(c => ({ c, items: (cards || []).filter(x => x.category === c) }))
      .filter(g => g.items.length > 0);
  })();

  const dailyDone = daily.count >= DAILY_TARGET;
  // A challenge whose game is still locked shows what it takes to open it instead of a
  // button that would launch a mode the path hasn't reached.
  const gameLock = (mode) => path.games.find((g) => g.mode === mode);
  const lockedNote = (mode) => gameLock(mode)?.needLabel || null;
  const gatedAction = (mode, label) =>
    gameLock(mode)?.unlocked === false ? null : { label, onClick: () => { setModeItems(null); setMode(mode); } };
  const challenges = cards ? [
    {
      id: "daily", icon: Sparkles, color: "#f3a712", title: "אתגר יומי",
      desc: dailyDone ? `הושלם! זכיתם ב-${DAILY_BONUS} נקודות בונוס` : `למדו ${DAILY_TARGET} מנות חדשות היום`,
      progress: Math.min(daily.count, DAILY_TARGET), target: DAILY_TARGET, done: dailyDone,
      action: dailyDone ? null : { label: "התחילו ללמוד", onClick: () => { setModeItems(null); setMode("flashcards"); } },
    },
    {
      // Not "challenge": allergies are the one thing on this menu that can put a guest in
      // hospital, and framing them as a game undercuts the seriousness the waiter should
      // carry to the table. Wording stays calm and instructional throughout.
      id: "allergens", icon: AlertTriangle, color: "#e0315a", title: "לימוד האלרגיות",
      desc: lockedNote("allergens") || "קראו את שם המנה וזהו את כל האלרגיות שבה", progress: null, target: null, done: false,
      action: gatedAction("allergens", "ללימוד האלרגיות"),
    },
    {
      id: "namecomplete", icon: ListChecks, color: "#3a86ff", title: "התאימו תיאור למנה",
      desc: lockedNote("namecomplete") || "קראו את שם המנה ובחרו את התיאור הנכון מבין 3 אפשרויות", progress: null, target: null, done: false,
      action: gatedAction("namecomplete", "לאתגר"),
    },
    {
      id: "full", icon: Trophy, color: "#22c08c", title: "שליטה מלאה בתפריט",
      desc: "למדו את כל המנות בתפריט", progress: mastered.size, target: cards.length,
      done: cards.length > 0 && mastered.size >= cards.length, action: null,
    },
    {
      id: "speed", icon: Zap, color: "#ff7a59", title: "שיא מהירות",
      desc: lockedNote("speed") || (bestSpeed > 0 ? `השיא שלכם: ${bestSpeed} תשובות נכונות ב-30 שניות` : "ענו נכון על כמה שיותר מנות תוך 30 שניות"),
      progress: null, target: null, done: false,
      action: gatedAction("speed", bestSpeed > 0 ? "נסו לשבור את השיא" : "התחילו אתגר מהירות"),
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
  // Dishes started but not yet solid — the fallback for slide 2 on a menu with nothing new.
  const reviewDishes = (cards || [])
    .filter((c) => { const m = masteryById?.[c.id] || 0; return m > 0 && m < 4; })
    .sort((a, b) => (masteryById?.[a.id] || 0) - (masteryById?.[b.id] || 0));

  // Group new dishes by category so slide 2 reads like a manager's question ("have you
  // learned the new cocktail menu?") instead of a list of dish names.
  const newByCat = newDishes.reduce((acc, d) => {
    const c = shortCat(d.category) || "התפריט";
    (acc[c] = acc[c] || []).push(d);
    return acc;
  }, {});
  const biggestNewCat = Object.entries(newByCat).sort((a, b) => b[1].length - a[1].length)[0];

  const briefItems = [
    ...(brief?.missing_items || []).map((x) => `חסר: ${x}`),
    ...(brief?.new_items || []).map((x) => `חדש: ${x}`),
    ...(brief?.oven_items || []).map((x) => `מוגבל: ${x}`),
  ];
  const hasBrief = briefItems.length > 0 || !!brief?.notes;

  // The three lead slides, in this order, by request: today's briefing, then what is new
  // to learn, then whether the waiter is ready to move up. Everything after them is the
  // pre-existing hype (team leaders, game modes) and only shows when it applies.
  const promos = cards ? [
    {
      id: "brief", gradient: "linear-gradient(135deg,#e8a33d,#c2410c)", icon: ListChecks,
      kicker: "עדכון יומי",
      title: hasBrief
        ? (briefItems[0] || "יש הודעה מהמנהל")
        : "אין עדכונים חדשים",
      subtitle: hasBrief
        ? (briefItems.length > 1
            ? `${countLabel(briefItems.slice(1), "עדכון נוסף", "עדכונים נוספים")}${brief?.notes ? " + הודעה מהמנהל" : ""}`
            : (brief?.notes || "לפני שמתחילים את המשמרת"))
        : "הכל כרגיל — משמרת טובה!",
      cta: hasBrief ? "לעדכון המלא" : "לעדכון היומי",
      onClick: () => setTab("daily"),
    },
    // Slide 2 always exists: new dishes if there are any, otherwise what needs review.
    newDishes.length > 0 ? {
      id: "new-dishes", gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)", icon: Sparkles,
      kicker: "מנות חדשות ללמידה",
      title: biggestNewCat && biggestNewCat[1].length >= 3
        ? `כבר למדת את תפריט ${biggestNewCat[0]} החדש?`
        : newDishes.length === 1
          ? `נוספה מנה חדשה: ${dishLabel(newDishes[0])}`
          : `נוספו ${newDishes.length} מנות חדשות לתפריט`,
      subtitle: `${newDishes.length} מנות שעוד לא למדת`,
      cta: "ללמוד עכשיו",
      onClick: () => { setModeItems(newDishes); setMode("flashcards"); },
    } : reviewDishes.length > 0 ? {
      id: "review", gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)", icon: Sparkles,
      kicker: "מנות ללמידה",
      title: "אין מנות חדשות — זמן לחזק את מה שיש",
      subtitle: `${reviewDishes.length} מנות עוד לא נעולות על 5/5`,
      cta: "לחזרה",
      onClick: () => { setModeItems(reviewDishes.slice(0, 10)); setMode("flashcards"); },
    } : {
      id: "all-known", gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)", icon: Sparkles,
      kicker: "מנות ללמידה",
      title: "כל התפריט בשליטה מלאה 🎉",
      subtitle: "תרגול חוזר שומר על הרמה לפני משמרת",
      cta: "לתרגול",
      onClick: () => { setModeItems(null); setMode("flashcards"); },
    },
    // Slide 3: where the staged path says this waiter stands right now.
    path.nextStep ? {
      id: "next-stage", gradient: "linear-gradient(135deg,#14b8a6,#0d7f74)", icon: GraduationCap,
      kicker: path.nextStep.kind === "exam" ? "מוכנים לשלב הבא" : "השלב הנוכחי שלכם",
      title: path.nextStep.kind === "exam"
        ? `מבחן ${shortCat(path.nextStep.category)}`
        : `לימוד ${shortCat(path.nextStep.category)}`,
      subtitle: path.nextStep.kind === "exam"
        ? "עברתם את הסף — אפשר להיבחן ולפתוח את הקטגוריה הבאה"
        : `${Math.round(path.nextStep.pct || 0)}% מתוך ${path.nextStep.threshold}% שנדרשים כדי להיבחן`,
      cta: path.nextStep.kind === "exam" ? "למבחן" : "להמשיך ללמוד",
      onClick: () => {
        const cat = path.categories.find((c) => c.key === path.nextStep.category);
        if (!cat) return;
        if (path.nextStep.kind === "exam") { setExamCategory({ key: cat.key, label: catLabel(cat.key) }); setMode("exam"); }
        else { setModeItems(cat.items); setMode("flashcards"); }
      },
    } : null,
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
    // Only advertise a game the waiter can actually open — a carousel card that leads to a
    // locked mode is worse than no card.
    gameLock("match")?.unlocked ? {
      id: "match", gradient: "linear-gradient(135deg,#22c08c,#1aa376)", icon: Repeat,
      kicker: "משחק חדש", title: "משחק ההתאמה", subtitle: "התאימו מנות למרכיבים שלהן במהירות שיא",
      cta: "לשחק", onClick: () => { setModeItems(null); setMode("match"); },
    } : null,
    gameLock("speed")?.unlocked ? {
      id: "speed", gradient: "linear-gradient(135deg,#3a86ff,#6d5efc)", icon: Zap,
      kicker: "אתגר מהירות", title: bestSpeed > 0 ? `שברו את השיא של ${bestSpeed}!` : "כמה תשובות נכונות תספיקו?",
      subtitle: "30 שניות על השעון", cta: "לאתגר", onClick: () => { setModeItems(null); setMode("speed"); },
    } : null,
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
        <div className="flex items-center gap-1.5">
          {myRank > 0 && <span className="text-[11px] font-bold text-[#f3c14b] bg-[#33290f] px-2 py-1 rounded-md">מקום {myRank}</span>}
          <button
            onClick={() => setShowMetrics(true)}
            title="המדדים שלי"
            className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]"
          >
            <BarChart3 size={16} />
          </button>
        </div>
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
            {/* One concrete next action, so the home screen never asks the waiter to
                decide what to do — the staged path already knows. */}
            {path.nextStep && (
              <button
                onClick={() => {
                  const cat = path.categories.find((c) => c.key === path.nextStep.category);
                  setModeItems(cat?.items || null);
                  if (path.nextStep.kind === "exam") { setExamCategory({ key: cat.key, label: catLabel(cat.key) }); setMode("exam"); }
                  else setMode("flashcards");
                }}
                className="w-full rounded-xl p-4 text-white text-right"
                style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}
              >
                <p className="text-[10px] font-bold opacity-80 mb-0.5">
                  {path.nextStep.kind === "exam" ? "מוכנים לשלב הבא" : "השלב הנוכחי שלכם"}
                </p>
                <p className="text-base font-black mb-1">
                  {path.nextStep.kind === "exam"
                    ? `מבחן ${shortCat(path.nextStep.category)}`
                    : `לימוד ${shortCat(path.nextStep.category)}`}
                </p>
                {path.nextStep.kind === "study" && (
                  <>
                    <div className="h-1.5 bg-white/25 rounded-full overflow-hidden mb-1">
                      <div className="h-full bg-white" style={{ width: `${Math.min(100, (path.nextStep.pct / path.nextStep.threshold) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] opacity-90">{path.nextStep.pct}% מתוך {path.nextStep.threshold}% שנדרשים כדי להיבחן</p>
                  </>
                )}
              </button>
            )}
            <div className="bg-[#16181c] rounded-xl p-3">
              <p className="text-xs font-black text-[#eef0f6] mb-2">תרגול</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setModeItems(null); setMode("flashcards"); }}
                  className="bg-[#6d5efc] text-white font-bold text-xs py-2.5 rounded-lg">כרטיסיות</button>
                {path.games.filter(g => g.mode !== "namecomplete").map((g) => (
                  <button key={g.mode} disabled={!g.unlocked}
                    onClick={() => { setModeItems(null); setMode(g.mode); }}
                    className={`font-bold text-xs py-2.5 rounded-lg flex items-center justify-center gap-1 ${
                      g.unlocked ? "bg-[#22252b] text-[#eef0f6]" : "bg-[#141619] text-[#5a5a6e]"}`}>
                    {!g.unlocked && <Lock size={11} />}{g.label}
                  </button>
                ))}
              </div>
              {path.gated && path.games.some((g) => !g.unlocked) && (
                <p className="text-[10px] text-[#8a8aa0] mt-2">
                  משחקים נוספים נפתחים ככל שעוברים מבחנים — {
                    path.passedCount === 0 ? "עוד לא עברתם מבחן"
                      : path.passedCount === 1 ? "עברתם מבחן אחד"
                      : `עברתם ${path.passedCount} מבחנים`}
                </p>
              )}
            </div>
            <div className="bg-[#16181c] rounded-lg p-3">
              <p className="text-xs font-bold text-[#8a8aa0] mb-2">התקדמות</p>
              <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mb-2">
                <div className="h-full bg-[#6d5efc]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-[#8a8aa0]">{pct}% הצלחה · {mastered.size}/{cards?.length || 0} מנות נלמדו</p>
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
            {/* Acknowledgement lives here, under the full text — it should only be
                answerable after the brief itself is on screen. */}
            {!session?.offline && session?.teamMemberId && (
              <div className="pt-1">
                <BriefAck
                  brief={brief}
                  cards={cards}
                  session={session}
                  ack={briefAck}
                  onAcked={setBriefAck}
                />
              </div>
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
            <p className="text-[10px] text-[#8a8aa0] px-1">
              {path.gated
                ? "לומדים חלק אחרי חלק. כל מבחן שעוברים פותח את הבא ומשחקים נוספים."
                : "לחצו על קטגוריה כדי לתרגל רק אותה"}
            </p>
            {path.categories.map((cat, idx) => {
              // A category can't be examined on dishes with no ingredients to ask about.
              // Reaching the threshold is the only condition. A category with thin data
              // gets the multiple-choice exam instead of the chip one, but it is never
              // unpassable — a locked graduation would stall every category behind it.
              const examReady = cat.examUnlocked;
              const prev = path.categories[idx - 1];
              return (
                <div key={cat.key} className={`rounded-lg p-2.5 ${cat.unlocked ? "bg-[#16181c]" : "bg-[#111316] opacity-60"}`}>
                  <button
                    disabled={!cat.unlocked}
                    onClick={() => { setModeItems(cat.items); setMode("flashcards"); }}
                    className="w-full text-right active:scale-[0.99] transition-transform disabled:active:scale-100"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      {/* Imported categories can carry their whole explanatory line
                          ("מאקי — 6 יחידות, אצה בחוץ…"), so clamp instead of letting one
                          row grow to four lines. */}
                      <p className="text-xs font-black text-[#eef0f6] line-clamp-2 flex-1 flex items-center gap-1.5" title={catLabel(cat.key)}>
                        {!cat.unlocked && <Lock size={11} className="text-[#8a8aa0] flex-shrink-0" />}
                        {cat.passed && <Check size={12} className="text-[#22c08c] flex-shrink-0" />}
                        {catLabel(cat.key)}
                      </p>
                      {cat.unlocked && <span className="text-[11px] font-bold text-[#6d5efc] flex-shrink-0">{cat.pct}%</span>}
                    </div>
                    <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${cat.pct}%`, background: cat.passed ? "#22c08c" : "#6d5efc" }} />
                    </div>
                    <p className="text-[10px] text-[#8a8aa0] mt-1">
                      {/* shortCat, not the full label: imported categories carry their
                          whole explanation ("מאקי — 6 יחידות, אצה בחוץ ואורז בפנים") and
                          inlining that makes the sentence unreadable. */}
                      {cat.unlocked
                        ? `${cat.items.length} מנות · לחצו לתרגול`
                        : `נפתח אחרי שעוברים את המבחן של ${shortCat(prev?.key)}`}
                    </p>
                  </button>
                  {cat.unlocked && (
                    <button
                      disabled={!examReady}
                      onClick={() => { setModeItems(cat.items); setExamCategory({ key: cat.key, label: catLabel(cat.key) }); setMode("exam"); }}
                      className={`w-full mt-2 py-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 ${
                        examReady ? "bg-[#15302b] text-[#22c08c]" : "bg-[#1c1e22] text-[#8a8aa0]"
                      }`}
                    >
                      <GraduationCap size={13} />
                      {cat.passed ? `עברתם! אפשר להיבחן שוב`
                        : examReady ? `מוכנים למבחן ${shortCat(cat.key)}?`
                        : `הגיעו ל-${cat.threshold}% כדי להיבחן`}
                    </button>
                  )}
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
          <p className="text-2xl font-black text-[#eef0f6]">{dishLabel(it)}</p>
          {!revealed && (
            <>
              {(it.ingredients?.length > 0 || it.allergens?.length > 0 || it.pitfalls?.length > 0) && (
                <p className="text-[11px] font-bold text-[#8a8aa0]">
                  {[
                    countLabel(it.ingredients, "מרכיב", "מרכיבים"),
                    countLabel(it.allergens, "אלרגיה", "אלרגיות"),
                    countLabel(it.pitfalls, "מוקש", "מוקשים"),
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
              {it.pitfalls?.length > 0 && <div className="bg-[#3a2f1d] p-2 rounded-lg"><p className="text-[10px] font-bold text-[#f3c14b]">מוקשים: {it.pitfalls.join(", ")}</p></div>}
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
// Rebuilt 2026-08-12 on the smart question engine (src/lib/questionEngine.js) — user
// feedback: most questions were trivially easy (the dish name literally appeared in the
// correct option). Now a mixed deck of 4 question kinds (masked description→name,
// ingredient trap, allowed modifications, name→masked description) with similarity-ranked
// distractors and name-leak masking. See the engine file for the full rationale.
// 2026-08-12: added qServingStyle — asks which serving style a dish belongs to, with the
// full category lines as options, so the unit counts they carry get tested too.
function Quiz({ items, facets, onAnswer, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const pool = useMemo(() => items || [], [items]);
  // Weighted by what the owner said matters, not a fixed builder list — otherwise the
  // ranking on their settings screen would quietly do nothing here.
  // Keyed on facet content, not array identity — a caller handing us a freshly built
  // array must never rebuild the deck the trainee is partway through.
  const facetKey = (facets || []).join(",");
  const qs = useMemo(() => buildWeightedDeck(pool, 8, facets), [pool, facetKey]);
  if (qs.length < 3) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פרטים במנות כדי לבנות חידון</p></div>;
  if (i >= qs.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{qs.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = qs[i];
  const next = (opt) => {
    setPicked(opt);
    const correct = opt === q.correct;
    if (correct) setScore(s => s + 1);
    onAnswer(q.itemId, correct ? 5 : 2);
    setTimeout(() => { setPicked(null); setI(i + 1); }, FEEDBACK_MS);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold text-[#eef0f6]">{i + 1}/{qs.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3">
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">{q.prompt}</p>
          <p className={`font-black text-[#eef0f6] ${q.subjectKind === "desc" ? "text-sm" : "text-lg"}`}>{q.subject}</p>
        </div>
        <div className="space-y-2">
          {q.options.map((opt, j) => {
            const isCorrect = picked && opt === q.correct;
            const isWrong = picked === opt && opt !== q.correct;
            return (
              <button key={j} disabled={!!picked} onClick={() => next(opt)} className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right leading-snug transition-colors ${isCorrect ? "bg-[#22c08c] text-white" : isWrong ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>{opt}</button>
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
const BOARDS_PER_GAME = 2;
// A wrong match costs 5 seconds. Without it the fastest strategy is to tap pairs at random
// until something sticks, which is the opposite of what the game is meant to train.
const WRONG_MATCH_PENALTY_S = 5;

function Matching({ items, onAnswer, onDone, session }) {
  // `board` advances only when the player clears the current grid. It is the ONLY thing
  // the deck depends on besides the (now frozen) item pool, so a grid can never be
  // rebuilt in the middle of play — matching a pair used to swap the whole board.
  const [board, setBoard] = useState(0);
  const [finished, setFinished] = useState(false);
  const deck = useMemo(() => {
    const chosen = shuffle((items || []).filter(it => it.ingredients?.length > 0)).slice(0, 6);
    const tiles = chosen.flatMap(it => [
      { key: `${it.id}-name`, pairId: it.id, kind: "name", label: dishLabel(it) },
      { key: `${it.id}-ing`, pairId: it.id, kind: "ing", label: it.ingredients.slice(0, 3).join(", ") },
    ]);
    return shuffle(tiles);
  }, [items, board]);

  const [matched, setMatched] = useState(new Set());
  const [sel, setSel] = useState([]);
  const [wrongPair, setWrongPair] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [penalty, setPenalty] = useState(0);
  const [stats, setStats] = useState({ pairs: 0, clean: 0, seconds: 0 });
  // Top-3 fastest for this restaurant, loaded once the game ends.
  const [records, setRecords] = useState(null);
  const startedRef = useRef(Date.now());
  const wrongAttemptsRef = useRef(new Map()); // pairId -> count, for objective grading

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const startBoard = (nextBoard) => {
    setMatched(new Set());
    setSel([]);
    setWrongPair([]);
    wrongAttemptsRef.current = new Map();
    startedRef.current = Date.now();
    setSeconds(0);
    setPenalty(0);
    setRunning(true);
    setBoard(nextBoard);
  };

  // Record the run and read back the restaurant's fastest three. Runs once per finished
  // game (`finished` only flips on the last board), and only for a real session — an
  // offline fallback session has no restaurant to compare against.
  useEffect(() => {
    if (!finished || records !== null) return;
    let alive = true;
    (async () => {
      if (session?.offline || !session?.restaurantId) { if (alive) setRecords([]); return; }
      // A failed insert must not cost the player their result screen, so the podium is
      // read back regardless of whether the write landed.
      await db.from("match_times").insert({
        restaurant_id: session.restaurantId,
        team_member_id: session.teamMemberId,
        name: session.name,
        seconds: stats.seconds,
        boards: BOARDS_PER_GAME,
        pairs: stats.pairs,
        clean: stats.clean,
      });
      const { data } = await db
        .from("match_times")
        .select("name, seconds, created_at")
        .eq("restaurant_id", session.restaurantId)
        .eq("boards", BOARDS_PER_GAME)   // only compare runs of the same length
        .order("seconds", { ascending: true })
        .limit(3);
      if (alive) setRecords(data || []);
    })();
    return () => { alive = false; };
  }, [finished, records, session, stats]);

  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פריטים</p></div>;

  if (finished) {
    const accuracy = stats.pairs ? Math.round((stats.clean / stats.pairs) * 100) : 0;
    return (
      <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <Trophy size={40} className="text-[#f3c14b]" />
        <div>
          <p className="text-4xl font-black">{accuracy}%</p>
          <p className="text-sm text-[#8a8aa0] mt-1">
            {stats.pairs} התאמות ב-{BOARDS_PER_GAME} לוחות · {stats.seconds} שניות
          </p>
        </div>
        <p className="text-xs text-[#8a8aa0]">מתוכן {stats.clean} נכונות בניסיון הראשון</p>

        <div className="w-full max-w-[280px]">
          <p className="text-[11px] font-black text-[#8a8aa0] mb-2">🏆 השיאים של המסעדה</p>
          {records === null ? (
            <p className="text-[11px] text-[#8a8aa0]">טוען…</p>
          ) : records.length === 0 ? (
            <p className="text-[11px] text-[#8a8aa0]">אין עדיין שיאים — הזמן שלכם ייכנס ראשון</p>
          ) : (
            <div className="flex flex-col gap-1">
              {records.map((r, i) => {
                // Highlight the row that is this run: same name and same time.
                const isMine = r.name === session?.name && r.seconds === stats.seconds;
                return (
                  <div
                    key={`${r.name}-${r.created_at}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold ${
                      isMine ? "bg-[#241f4d] border border-[#6d5efc]" : "bg-[#16181c]"
                    }`}
                  >
                    <span className="text-sm">{["🥇", "🥈", "🥉"][i]}</span>
                    <span className="flex-1 text-right text-[#eef0f6] truncate">{r.name}</span>
                    <span className="text-[#f3c14b] font-black">{r.seconds}s</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full max-w-[240px]">
          <button
            onClick={() => { setStats({ pairs: 0, clean: 0, seconds: 0 }); setRecords(null); setFinished(false); startBoard(board + 1); }}
            className="px-4 py-3 rounded-2xl bg-[#6d5efc] text-white font-black text-sm"
          >
            עוד סבב
          </button>
          <button onClick={onDone} className="px-4 py-3 rounded-2xl bg-[#22252b] text-[#c4c4d4] font-bold text-sm">סיום</button>
        </div>
      </div>
    );
  }

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
        setStats((st) => ({ ...st, pairs: st.pairs + 1, clean: st.clean + (wrongCount === 0 ? 1 : 0) }));
      } else {
        // A wrong guess counts against BOTH tiles involved — whichever one the player
        // eventually matches correctly will remember this miss.
        wrongAttemptsRef.current.set(a.pairId, (wrongAttemptsRef.current.get(a.pairId) || 0) + 1);
        wrongAttemptsRef.current.set(b.pairId, (wrongAttemptsRef.current.get(b.pairId) || 0) + 1);
        setPenalty((p) => p + WRONG_MATCH_PENALTY_S);
        setWrongPair([a.key, b.key]);
        setTimeout(() => { setWrongPair([]); setSel([]); }, 550);
      }
    }
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button>
        <p className="text-xs font-bold text-[#eef0f6]">התאמה · לוח {(board % BOARDS_PER_GAME) + 1}/{BOARDS_PER_GAME}</p>
        <p className={`text-xs font-black ${wrongPair.length ? "text-[#e0315a]" : "text-[#f3c14b]"}`}>
          ⏱ {seconds + penalty}s{penalty > 0 && <span className="text-[10px] font-bold text-[#e0315a]"> (+{penalty})</span>}
        </p>
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
            <p className="text-sm font-black text-[#eef0f6] mb-1">לוח {(board % BOARDS_PER_GAME) + 1} מתוך {BOARDS_PER_GAME} הושלם</p>
            <p className="text-xs text-[#8a8aa0] mb-3">
              {seconds + penalty} שניות{penalty > 0 ? ` (${penalty} קנס)` : ""}
            </p>
            <button
              onClick={() => {
                setStats((st) => ({ ...st, seconds: st.seconds + seconds + penalty }));
                // Summary after the last board of the set; otherwise deal a fresh grid.
                if ((board + 1) % BOARDS_PER_GAME === 0) setFinished(true);
                else startBoard(board + 1);
              }}
              className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold"
            >
              {(board + 1) % BOARDS_PER_GAME === 0 ? "לתוצאה" : "ללוח הבא"}
            </button>
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
const SPEED_SECONDS = 30;
// A round is short enough that leaving instantly would just be a free deck reroll; long
// enough that being stuck for the full 30s after a mis-tap is annoying. 10s splits it.
const SPEED_EXIT_AFTER_S = 10;

function Speed({ items, onAnswer, onDone, onFinish }) {
  const pool = useMemo(() => (items || []).filter(it => it.ingredients?.length > 0), [items]);
  const deck = useMemo(() => shuffle(pool).slice(0, 12).map(it => {
    const a = shuffle(it.ingredients)[0];
    const otherIngredients = [...new Set(pickDistractors(pool, it, 6).flatMap(x => x.ingredients))].filter(ing => ing !== a);
    return { it, a, opts: shuffle([a, ...shuffle(otherIngredients).slice(0, 2)]) };
  }), [pool]);
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [time, setTime] = useState(SPEED_SECONDS);
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
      {/* No way out at all used to mean a mis-tap cost the full 30s. The exit appears only
          after 10 seconds so it can't be used to reroll an unwanted deck instantly. */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-bold text-[#f3c14b]">⏱ {time}s</span>
        <p className="text-xs font-bold">{i + 1}/{deck.length}</p>
        {SPEED_SECONDS - time >= SPEED_EXIT_AFTER_S ? (
          <button onClick={onDone} className="text-xs text-[#8a8aa0]">יציאה ←</button>
        ) : (
          <span className="text-[10px] text-[#5a5a6e] font-bold">
            יציאה בעוד {SPEED_EXIT_AFTER_S - (SPEED_SECONDS - time)}s
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center w-full">
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-2">איזה מרכיב שייך למנה הזו?</p>
          <p className="text-lg font-black mb-4">{dishLabel(q.it)}</p>
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

// The same nine the owner app offers and the AI import is allowed to return. "סולפיטים"
// used to be a tenth option here — an allergen no owner could ever tag, so selecting it
// was always wrong for a reason the trainee had no way to learn.
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום"];
// "מוקשים" — what a guest often asks to avoid by preference, not by safety. Separate from
// ALLERGENS on purpose: folding a preference into the allergen list makes the allergen
// list less trustworthy, and a waiter reads the two for different reasons. Free text, so
// these are only a starting palette — any restaurant adds its own.
const PITFALLS = ["כוסברה", "חריף", "דג נא", "שום", "בצל", "ג'ינג'ר", "וסאבי", "מיונז", "אלכוהול", "טחינה"];

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
  // Kept as state rather than recomputed on render: after `submitted` flips, the verdict
  // must describe the answer that was actually sent.
  const wasCorrect = submitted && selected.size === actual.size && [...selected].every(a => actual.has(a));
  const missed = [...actual].filter((a) => !selected.has(a));
  const overPicked = [...selected].filter((a) => !actual.has(a));
  const submit = () => {
    if (submitted) return;
    const correct = selected.size === actual.size && [...selected].every(a => actual.has(a));
    if (correct) setScore(s => s + 1);
    onAnswer(it.id, correct ? 5 : 2);
    setSubmitted(true);
    // A wrong answer needs longer on screen than a right one — there is something to read.
    setTimeout(() => { setSubmitted(false); setSelected(new Set()); setI(x => x + 1); }, correct ? 1400 : 2600);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3 text-center">
          <p className="text-sm font-black mb-1">{dishLabel(it)}</p>
          <p className="text-[10px] text-[#8a8aa0]">אילו אלרגיות יש במנה הזו?</p>
        </div>
        {/* The verdict has to be stated, not inferred from chip colours. Answering "no
            allergies" on a dish that has them used to paint every real allergen green and
            nothing red, so a wrong answer looked exactly like a right one. */}
        {submitted && (
          <div className={`rounded-lg p-3 mb-3 text-center border ${
            wasCorrect ? "bg-[#15302b] border-[#22c08c]" : "bg-[#3a1d22] border-[#e0315a]"
          }`}>
            <p className={`text-sm font-black ${wasCorrect ? "text-[#22c08c]" : "text-[#e0315a]"}`}>
              {wasCorrect ? "✓ נכון" : "✗ טעית"}
            </p>
            {!wasCorrect && (
              <p className="text-[11px] font-bold text-[#eef0f6] mt-1">
                {missed.length > 0 && (
                  selected.size === 0
                    ? `יש אלרגיות במנה: ${missed.join(", ")}`
                    : `פספסתם: ${missed.join(", ")}`
                )}
                {missed.length > 0 && overPicked.length > 0 && " · "}
                {overPicked.length > 0 && `אין במנה: ${overPicked.join(", ")}`}
              </p>
            )}
            {wasCorrect && actual.size === 0 && (
              <p className="text-[11px] text-[#8a8aa0] mt-1">אין אלרגיות במנה זו</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ALLERGENS.map(a => {
            const on = selected.has(a);
            // Three distinct post-answer states, not two: picked-and-right, picked-and-wrong,
            // and right-but-missed. The last one used to be indistinguishable from the first.
            const gotIt = submitted && on && actual.has(a);
            const wasMissed = submitted && !on && actual.has(a);
            const showWrongPick = submitted && on && !actual.has(a);
            return (
              <button key={a} disabled={submitted} onClick={() => toggle(a)}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                  gotIt ? "bg-[#22c08c] text-white border-[#22c08c]" :
                  wasMissed ? "bg-[#3a1d22] text-[#22c08c] border-[#22c08c] border-dashed" :
                  showWrongPick ? "bg-[#e0315a] text-white border-[#e0315a] line-through" :
                  on ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]"
                }`}>
                {wasMissed ? `${a} ←` : a}
              </button>
            );
          })}
        </div>
        {!submitted && (
          <button onClick={submit} className="w-full py-2.5 rounded-lg font-bold text-xs bg-[#6d5efc] text-white">
            {selected.size === 0 ? "אין אלרגיות / שליחה" : "שליחה"}
          </button>
        )}
      </div>
    </div>
  );
}

// Objective: show the dish name, tap the correct description among 2 distractors.
// Was originally "read the description, type the dish's name" — replaced 2026-08-11
// (user feedback): the real menu's dish names are English/transliterated, so exact-match
// free-text typing was mostly testing spelling, not menu knowledge. Tap-only removes that
// friction entirely while keeping the grading objective (still can't self-report a lie).
// Rebuilt 2026-08-12 on the smart question engine — the old version showed the raw
// descriptions as options, so "סלמון אבוקדו" → "סלמון ואבוקדו…" answered itself. Now the
// deck mixes masked-description matching with the modifications question ("אילו שינויים
// ניתן לעשות?") and the ingredient trap, all with similarity-ranked near-miss traps.
function NameCompletion({ items, facets, onAnswer, onDone }) {
  const pool = useMemo(() => items || [], [items]);
  // Same owner-ranked weighting as the quiz; this mode differs by presentation, not by
  // which aspects of the menu it is allowed to ask about.
  const facetKey = (facets || []).join(",");
  const deck = useMemo(() => buildWeightedDeck(pool, 8, facets), [pool, facetKey]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  if (deck.length < 3) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פרטים במנות כדי לבנות אתגר</p></div>;
  if (i >= deck.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{deck.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = deck[i];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const correct = opt === q.correct;
    if (correct) setScore(s => s + 1);
    onAnswer(q.itemId, correct ? 5 : 2);
    setTimeout(() => { setPicked(null); setI(x => x + 1); }, FEEDBACK_MS);
  };
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{deck.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full text-center space-y-3">
          <p className="text-[10px] font-bold text-[#8a8aa0]">{q.prompt}</p>
          <p className="text-lg font-black mb-3">{q.subject}</p>
          <div className="flex flex-col gap-2">
            {q.options.map((opt, j) => {
              const isCorrectOpt = picked && opt === q.correct;
              const isWrongPick = picked === opt && opt !== q.correct;
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

// The graduation step for a category. Deliberately NOT free text: an earlier version asked
// the trainee to describe the dish and scored how many real ingredients they happened to
// mention. That only measured recall, never precision — so listing every ingredient on the
// menu scored 100% on every dish, and it couldn't tell Greek Truffle Cream 38 from 44 from
// 48, which is precisely the distinction that matters in service.
//
// Instead: the real ingredients are mixed with near-miss decoys taken from the OTHER dishes
// in the same category, and the trainee has to pick the exact set. Scored by Jaccard
// (correct / correct+missed+wrong), so both missing an ingredient and inventing one cost
// you, and "select everything" collapses to a low score. Fully deterministic — no AI, no
// language matching, nothing to tune — which also makes the number honest enough for the
// owner to act on.
function CategoryExam({ items, categoryLabel, onAnswer, onDone, onFinish }) {
  const deck = useMemo(() => {
    const pool = (items || []).filter((it) => it.ingredients?.length > 0);
    return shuffle(pool)
      .slice(0, 4)
      .map((it) => {
        const real = it.ingredients || [];
        const isReal = (x) => real.some((r) => r.trim() === x.trim());
        const others = pool.filter((x) => x.id !== it.id);
        // Same-category siblings make the hardest, fairest decoys: for the three Truffle
        // Creams the decoys ARE the ingredients that tell them apart.
        const near = [...new Set(others.flatMap((x) => x.ingredients || []))].filter((x) => !isReal(x));
        const decoys = shuffle(near).slice(0, Math.min(5, Math.max(3, real.length)));
        return {
          it,
          options: shuffle([
            ...real.map((label) => ({ label, correct: true })),
            ...decoys.map((label) => ({ label, correct: false })),
          ]),
        };
      });
  }, [items]);

  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(new Set());
  const [pickedAll, setPickedAll] = useState(new Set());
  const [result, setResult] = useState(null);
  const [scores, setScores] = useState([]);

  // A real exam is timed. Each dish here is two multi-selects (ingredients + allergens),
  // heavier than a single multiple-choice, so it gets more room than the intake exam's 12s.
  const SECONDS_PER_DISH = 45;
  const [secondsLeft, setSecondsLeft] = useState(0);
  const started = deck.length >= 2;
  useEffect(() => {
    if (!started) return;
    setSecondsLeft(deck.length * SECONDS_PER_DISH);
  }, [started, deck.length]);
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started]);
  const outOfTime = started && secondsLeft <= 0;

  // Record the attempt exactly once, when the last question is graded. Declared above the
  // early returns below because hooks can't run conditionally; the ref guards against
  // re-firing on every re-render of the finished screen.
  const finished = started && (i >= deck.length || outOfTime);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!finished || reportedRef.current) return;
    reportedRef.current = true;
    // Average over the whole deck, not just what was answered — otherwise running out of
    // time after one lucky question would score higher than finishing the exam.
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / deck.length);
    onFinish?.({ score: avg, passed: avg >= 70, dishCount: deck.length });
  }, [finished, scores, deck.length, onFinish]);

  if (deck.length < 2)
    return (
      <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6] px-8 text-center" dir="rtl">
        <p className="text-sm">צריך לפחות 2 מנות עם מרכיבים בקטגוריה הזו כדי להיבחן</p>
      </div>
    );

  if (finished) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / deck.length);
    const passed = avg >= 70;
    return (
      <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${passed ? "bg-[#15302b]" : "bg-[#3a1d22]"}`}>
          <GraduationCap size={38} className={passed ? "text-[#22c08c]" : "text-[#e0315a]"} />
        </div>
        <div>
          <p className="text-4xl font-black">{avg}%</p>
          <p className="text-sm font-bold text-[#8a8aa0] mt-1">מבחן {categoryLabel}</p>
        </div>
        <p className="text-sm text-[#c4c4d4] max-w-xs leading-relaxed">
          {passed ? "עברת! אתה מכיר את הקטגוריה הזו טוב." : "עוד לא עברת — תרגלו את הקטגוריה ותנסו שוב."}
        </p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#6d5efc] text-white font-black text-sm">סיום</button>
      </div>
    );
  }

  const q = deck[i];
  const realIng = q.it.ingredients || [];
  const realAll = q.it.allergens || [];

  // Correct / (correct + missed + wrong). Both empty is a perfect answer — knowing a dish
  // has no allergens is real knowledge, and selecting one anyway is penalised.
  const jaccard = (selected, correct) => {
    const s = new Set([...selected].map((x) => x.trim()));
    const c = new Set(correct.map((x) => x.trim()));
    const tp = [...c].filter((x) => s.has(x)).length;
    const fp = [...s].filter((x) => !c.has(x)).length;
    const fn = [...c].filter((x) => !s.has(x)).length;
    return tp + fp + fn === 0 ? 1 : tp / (tp + fp + fn);
  };

  const toggle = (setter) => (label) =>
    setter((prev) => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  const submit = () => {
    if (result) return;
    const ingJ = jaccard(picked, realIng);
    const allJ = jaccard(pickedAll, realAll);
    const score = Math.round((ingJ * 0.6 + allJ * 0.4) * 100);
    const rating = score >= 85 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
    onAnswer(q.it.id, rating);
    setScores((s) => [...s, score]);
    setResult({
      score,
      wrongIng: [...picked].filter((x) => !realIng.some((r) => r.trim() === x.trim())),
      missIng: realIng.filter((x) => !picked.has(x)),
      wrongAll: [...pickedAll].filter((x) => !realAll.some((r) => r.trim() === x.trim())),
      missAll: realAll.filter((x) => !pickedAll.has(x)),
    });
  };

  const next = () => { setResult(null); setPicked(new Set()); setPickedAll(new Set()); setI((x) => x + 1); };

  // Post-submit colouring: green = you got it, red = you picked it and it's not in the dish,
  // amber outline = it was in the dish and you missed it.
  const chipClass = (label, isSelected, isCorrect) => {
    if (!result) return isSelected ? "bg-[#6d5efc] text-white border-[#6d5efc]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]";
    if (isSelected && isCorrect) return "bg-[#22c08c] text-white border-[#22c08c]";
    if (isSelected && !isCorrect) return "bg-[#e0315a] text-white border-[#e0315a]";
    if (!isSelected && isCorrect) return "bg-[#33290f] text-[#f3a712] border-[#f3a712]";
    return "bg-[#16181c] text-[#4a4a5a] border-[#22252b]";
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← יציאה</button>
        <p className="text-xs font-bold truncate px-2">מבחן {shortCat(categoryLabel)}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Red for the last 30s — enough warning to finish the dish in hand. */}
          <span className={`text-xs font-black ${secondsLeft <= 30 ? "text-[#e0315a]" : "text-[#f3c14b]"}`}>
            ⏱ {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
          <p className="text-xs font-bold text-[#8a8aa0]">{i + 1}/{deck.length}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-[#16181c] rounded-xl p-4 text-center mb-4">
          <p className="text-xl font-black">{dishLabel(q.it)}</p>
          {result && (
            <p className={`text-3xl font-black mt-2 ${result.score >= 70 ? "text-[#22c08c]" : "text-[#e0315a]"}`}>{result.score}%</p>
          )}
        </div>

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-2">מה נמצא במנה? (בחרו את כל הנכונים)</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {q.options.map((opt) => (
            <button
              key={opt.label}
              disabled={!!result}
              onClick={() => toggle(setPicked)(opt.label)}
              className={`text-[12px] font-bold px-3 py-2 rounded-lg border transition-colors ${chipClass(opt.label, picked.has(opt.label), opt.correct)}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] font-bold text-[#8a8aa0] mb-2">אילו אלרגיות יש במנה? (אם אין — אל תבחרו כלום)</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ALLERGENS.map((a) => (
            <button
              key={a}
              disabled={!!result}
              onClick={() => toggle(setPickedAll)(a)}
              className={`text-[12px] font-bold px-3 py-2 rounded-lg border transition-colors ${chipClass(a, pickedAll.has(a), realAll.some((r) => r.trim() === a.trim()))}`}
            >
              {a}
            </button>
          ))}
        </div>

        {!result && (
          <>
            <button
              onClick={submit}
              disabled={picked.size === 0}
              className={`w-full py-3.5 rounded-2xl font-black text-sm ${
                picked.size ? "bg-[#6d5efc] text-white" : "bg-[#22252b] text-[#b4b4c4]"
              }`}
            >
              שליחה
            </button>
            {picked.size === 0 && (
              <p className="text-[10px] text-[#8a8aa0] text-center mt-2">בחרו לפחות מרכיב אחד</p>
            )}
          </>
        )}

        {result && (
          <div className="space-y-3">
            {result.missAll.length > 0 && (
              <div className="bg-[#3a1d22] border border-[#e0315a]/40 rounded-xl p-3">
                <p className="text-[11px] font-black text-[#e0315a] mb-1">⚠️ פספסתם אלרגיות</p>
                <p className="text-sm text-[#eef0f6]">{result.missAll.join(", ")}</p>
                <p className="text-[10px] text-[#c4c4d4] mt-1.5">זה הדבר הכי חשוב לדעת — לקוח עלול להיפגע.</p>
              </div>
            )}
            {result.wrongAll.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">סימנתם אלרגיות שאינן במנה: {result.wrongAll.join(", ")}</p>
            )}
            {result.wrongIng.length > 0 && (
              <p className="text-[11px] text-[#e0315a]">לא נמצא במנה: {result.wrongIng.join(", ")}</p>
            )}
            {result.missIng.length > 0 && (
              <p className="text-[11px] text-[#f3a712]">פספסתם: {result.missIng.join(", ")}</p>
            )}
            {q.it.desc && (
              <div className="bg-[#16181c] rounded-xl p-3">
                <p className="text-[11px] font-bold text-[#8a8aa0] mb-1">התיאור המלא</p>
                <p className="text-sm text-[#c4c4d4] leading-relaxed">{q.it.desc}</p>
              </div>
            )}
            <button onClick={next} className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#6d5efc] text-white">
              {i + 1 >= deck.length ? "לתוצאה" : "לשאלה הבאה"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The graduation exam for categories the chip exam can't serve: dishes with no ingredient
// lists, or an owner who ranked ingredients and allergens out of their programme. Same
// pass mark and the same onFinish contract as CategoryExam, so the path treats them
// identically — what differs is only which knowledge is being checked.
function QuizExam({ items, facets, categoryLabel, onAnswer, onDone, onFinish }) {
  const pool = useMemo(() => items || [], [items]);
  const facetKey = (facets || []).join(",");
  const deck = useMemo(() => buildWeightedDeck(pool, 8, facets), [pool, facetKey]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const reportedRef = useRef(false);

  const finished = deck.length > 0 && i >= deck.length;
  const score = deck.length ? Math.round((correctCount / deck.length) * 100) : 0;
  const passed = score >= 70;

  // Declared above the early returns — hooks can't run conditionally — and guarded by a
  // ref so a re-render of the results screen can't record the attempt twice.
  useEffect(() => {
    if (finished && !reportedRef.current) {
      reportedRef.current = true;
      onFinish?.({ score, passed, dishCount: deck.length });
    }
  }, [finished, score, passed, deck.length]);

  if (deck.length < 3) return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 px-8 text-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <p className="text-sm">אין מספיק פרטים במנות של {categoryLabel} כדי לבנות מבחן.</p>
      <p className="text-xs text-[#8a8aa0]">בקשו מהמנהל/ת להשלים תיאורים או מרכיבים.</p>
      <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold">חזרה</button>
    </div>
  );

  if (finished) return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 px-8 text-center bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${passed ? "bg-[#15302b]" : "bg-[#3a1d22]"}`}>
        <GraduationCap size={38} className={passed ? "text-[#22c08c]" : "text-[#e0315a]"} />
      </div>
      <p className="text-4xl font-black" style={{ color: passed ? "#22c08c" : "#e0315a" }}>{score}%</p>
      <p className="text-sm font-bold">{passed ? "עברת! אתה מכיר את הקטגוריה הזו טוב." : "עוד לא עברת — תרגלו את הקטגוריה ותנסו שוב."}</p>
      <button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold mt-2">חזרה</button>
    </div>
  );

  const q = deck[i];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const ok = opt === q.correct;
    if (ok) setCorrectCount((c) => c + 1);
    onAnswer(q.itemId, ok ? 5 : 2);
    setTimeout(() => { setPicked(null); setI((x) => x + 1); }, FEEDBACK_MS);
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← יציאה</button>
        <p className="text-xs font-bold">מבחן {categoryLabel}</p>
        <p className="text-xs font-bold text-[#8a8aa0]">{i + 1}/{deck.length}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3">
          <p className="text-[10px] font-bold text-[#8a8aa0] mb-1">{q.prompt}</p>
          <p className={`font-black ${q.subjectKind === "desc" ? "text-sm leading-snug" : "text-lg"}`}>{q.subject}</p>
        </div>
        <div className="space-y-2">
          {q.options.map((opt, j) => {
            const isCorrect = picked && opt === q.correct;
            const isWrong = picked === opt && opt !== q.correct;
            return (
              <button key={j} disabled={!!picked} onClick={() => answer(opt)}
                className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right leading-snug transition-colors ${
                  isCorrect ? "bg-[#22c08c] text-white" : isWrong ? "bg-[#e0315a] text-white" : "bg-[#16181c] text-[#c4c4d4] border border-[#22252b]"}`}>
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const shuffle = a => [...a].sort(() => Math.random() - 0.5);

// pickDistractors moved to src/lib/questionEngine.js (2026-08-12) and upgraded: same
// category first as before, but now the most-SIMILAR dishes first (shared ingredients/
// description words) instead of random — near-misses are what make a question hard.
