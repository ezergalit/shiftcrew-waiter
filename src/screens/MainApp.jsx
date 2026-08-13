import { useEffect, useState, useMemo, useRef } from "react";
import { Trophy, BookOpen, Zap, BarChart3, Home, LogOut, Flame, WifiOff, Target, Sparkles, Check, ChevronLeft, AlertTriangle, ListChecks, GraduationCap, Star, Repeat } from "lucide-react";
import { supabase } from "../lib/supabase";
import MetricsScreen from "../components/MetricsScreen";
import BriefAck from "../components/BriefAck";
import { buildStudySession, nextConsecutiveFives, isRetired, QUICK_SESSION_SIZE } from "../lib/studySession";
import { MOCK_CARDS, MOCK_BRIEF, MOCK_LEADERBOARD } from "../lib/mockMenu";
import { pickDistractors, buildWeightedDeck, availableFacets, dishLabel, withDisplayNames } from "../lib/questionEngine";
import { pathState } from "../lib/learningPath";
import { useStudyTime } from "../lib/studyTime";
import {
  CAT_LABELS, CAT_ORDER, catLabel, shortCat, countLabel, colorFor, shuffle,
  todayStr, loadDaily, saveDaily, loadNum, saveNum, FEEDBACK_MS,
} from "../games/shared";
import Flashcards from "../games/Flashcards";
import Quiz from "../games/Quiz";
import Matching from "../games/Matching";
import Speed from "../games/Speed";
import AllergenQuiz from "../games/AllergenQuiz";
import NameCompletion from "../games/NameCompletion";
import CategoryExam from "../games/CategoryExam";
import QuizExam from "../games/QuizExam";


const db = supabase.schema("menu_app");
// A dish is "new to you" while it is both recently added and still untouched. Time-boxed
// so a waiter who simply never studied doesn't see the entire menu flagged as new forever
// — that backlog is the learning path's job, not the brief's.
const NEW_DISH_WINDOW_DAYS = 21;
const DAILY_TARGET = 3;
// Fallback only. The real figure is the owner's `exam_config.daily_goal_minutes` — a busy
// kitchen wants 10, a new opening might want 25 — and this is what a restaurant that has
// never opened the setting gets.
const DEFAULT_DAILY_MINUTES = 10;

// For the "carry on?" card — the stored value is a mode key, and "quiz" on screen would
// read as a bug rather than a name.
const MODE_LABELS = {
  flashcards: "כרטיסיות",
  quick: "5 דקות לפני משמרת",
  quiz: "חידון",
  match: "התאמה",
  speed: "מהירות",
  allergens: "לימוד האלרגיות",
  namecomplete: "התאמת תיאור",
  exam: "מבחן קטגוריה",
};
const DAILY_BONUS = 50;

function pubToCard(p) {
  const ing = (p.ingredients || []).filter(Boolean);
  // displayName is filled in by withDisplayNames once the whole menu is loaded — whether a
  // name needs its serving style depends on the other dishes, not on this row alone.
  // Four separate warning groups, never merged: "fish" is an allergy, "raw fish" is a
  // pregnancy warning, "coriander" is a preference. A waiter reading one combined list
  // can't tell which one could put a guest in hospital. See src/lib/dishFlags.js.
  return { id: p.source_item_id, name: p.name, price: Number(p.price), category: p.category, desc: p.description || "", ingredients: ing, allergens: (p.allergens || []).filter(Boolean), pregnancy: (p.pregnancy || []).filter(Boolean), pitfalls: (p.pitfalls || []).filter(Boolean), kashrut: (p.kashrut || []).filter(Boolean), menuPosition: p.menu_position, createdAt: p.created_at, // `starred` is the manager's emphasis toggle (owner app, 2026-08-13); `is_special` is
  // the older flag some seeded dishes still carry. Either one lights the star — reading
  // only the old column silently disconnected the manager's button from the waiter side.
  isSpecial: !!(p.starred || p.is_special) };
}

// Where the waiter was when they last closed the app. Stored per member and stamped, so a
// half-finished round from three days ago is not offered as "carry on where you left off"
// — by then the deck is stale and the offer is just noise.
const RESUME_KEY = "menu-app-resume";
const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const saveResume = (id, obj) => {
  if (!id) return;
  try { localStorage.setItem(`${RESUME_KEY}-${id}`, JSON.stringify({ ...obj, at: Date.now() })); } catch { /* full or blocked */ }
};
const clearResume = (id) => id && localStorage.removeItem(`${RESUME_KEY}-${id}`);
const loadResume = (id) => {
  if (!id) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(`${RESUME_KEY}-${id}`) || "null");
    if (!raw?.mode || !raw?.at) return null;
    if (Date.now() - raw.at > RESUME_MAX_AGE_MS) return null;
    return raw;
  } catch { return null; }
};

export default function MainApp({ session, onSignOut }) {
  const [tab, setTab] = useState("home");
  const [cards, setCards] = useState(null);
  const [mastered, setMastered] = useState(new Set());
  // Raw 1-5 score per dish (id -> score). `mastered` above is still the >=4 threshold set
  // that drives points/daily-challenge/leaderboard; this map is what the *percentages*
  // are built from, so "4 out of 5 on every dish" reads as 80% instead of 100%.
  const [masteryById, setMasteryById] = useState({});
  const [fivesById, setFivesById] = useState({});
  const [verifiedById, setVerifiedById] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  // The weekly board is the one people compete on; `leaderboard` stays as the all-time
  // record behind it. They cannot be the same number: all-time points are a pure function
  // of how many dishes are mastered right now, while "earned this week" is a running sum
  // of events that no amount of current state can reconstruct.
  const [weekly, setWeekly] = useState([]);
  const [boardScope, setBoardScope] = useState("week");
  const [brief, setBrief] = useState(null);
  const [briefAck, setBriefAck] = useState(null);
  const [mode, setMode] = useState(null);
  const [showMetrics, setShowMetrics] = useState(false); // flashcards | quiz | match | speed | exam | …
  const [modeItems, setModeItems] = useState(null); // scoped items for a challenge round; null = full menu
  // Offered once per app open, never nagged: dismissing it clears the record.
  const [resumeOffer, setResumeOffer] = useState(null);
  // Store the category key (e.g. "starters") for the DB record, and its Hebrew label for
  // display — the exam_results row keys off the former so it stays stable if labels change.
  const [examCategory, setExamCategory] = useState(null); // { key, label }
  // The staged path: what the owner configured, and which category exams this member has
  // already passed. Both feed learningPath.pathState, which derives every unlock.
  const [examConfig, setExamConfig] = useState(null);
  // Seconds studied today: seeded from the snapshots already written, then ticked live by
  // useStudyTime so the ring moves while the waiter studies instead of jumping every two
  // minutes when a flush lands.
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [passedCats, setPassedCats] = useState([]);
  const [daily, setDaily] = useState(() => loadDaily(session?.teamMemberId));
  const [bonusTotal, setBonusTotal] = useState(() => loadNum("menu-app-bonus", session?.teamMemberId));
  const [bestSpeed, setBestSpeed] = useState(() => loadNum("menu-app-best-speed", session?.teamMemberId));
  const exitMode = () => {
    // Leaving on purpose is not "interrupted" — only an unfinished round left by closing
    // the app is worth resuming.
    clearResume(session?.teamMemberId);
    setMode(null);
    setModeItems(null);
  };

  // Remember the current round so closing the app mid-way can be picked up later. Category
  // rounds store the category so the same scope comes back, not a fresh full-menu deck.
  useEffect(() => {
    if (!session?.teamMemberId) return;
    if (!mode) return;
    saveResume(session.teamMemberId, {
      mode,
      categoryKey: modeItems?.length ? modeItems[0]?.category ?? null : null,
      scoped: !!modeItems?.length,
    });
  }, [mode, modeItems, session?.teamMemberId]);

  // Surface the offer once, after the menu is loaded so the deck can actually be rebuilt.
  useEffect(() => {
    if (!cards?.length || mode) return;
    const r = loadResume(session?.teamMemberId);
    if (r) setResumeOffer(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards?.length]);

  // Sunday-start week, matching add_weekly_points in the database. Both sides must agree
  // or a waiter's score would land in one week and be read from another.
  const weekStartStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  };

  const refetchWeekly = async () => {
    if (!session?.restaurantId || session?.offline) return;
    const { data } = await db.from("weekly_scores")
      .select("team_member_id, name, points")
      .eq("restaurant_id", session.restaurantId)
      .eq("week_start", weekStartStr())
      .order("points", { ascending: false });
    setWeekly(data || []);
  };

  const refetchLeaderboard = async () => {
    const { data } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
    void refetchWeekly();
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
      const { data: m } = await db.from("menu_progress").select("source_item_id, mastery, consecutive_fives, verified").eq("team_member_id", session?.teamMemberId);
      if (alive) {
        // Points follow VERIFIED mastery only — a self-reported 5 doesn't count here.
        setMastered(new Set((m || []).filter(r => (r.mastery ?? 0) >= 4 && r.verified).map(r => r.source_item_id)));
        setVerifiedById(Object.fromEntries((m || []).map(r => [r.source_item_id, !!r.verified])));
        setMasteryById(Object.fromEntries((m || []).map(r => [r.source_item_id, r.mastery ?? 0])));
        // Consecutive perfect ratings, for retiring a dish from the study rotation.
        setFivesById(Object.fromEntries((m || []).map(r => [r.source_item_id, r.consecutive_fives ?? 0])));
      }
      const { data: l } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
      if (alive) setLeaderboard(l || []);
      const { data: cfg } = await db.from("exam_config").select("*").eq("restaurant_id", session?.restaurantId).maybeSingle();
      if (alive) setExamConfig(cfg || {});
      // Everything already recorded for today, so the goal survives a refresh.
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const { data: todaySnaps } = await db.from("progress_snapshots")
        .select("seconds_delta").eq("team_member_id", session?.teamMemberId)
        .gte("taken_at", dayStart.toISOString());
      if (alive) setTodaySeconds((todaySnaps || []).reduce((n, r) => n + (r.seconds_delta || 0), 0));
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
  /**
   * Record one rating.
   *
   * `objective` is the whole point of the signature: flashcards are self-reported, so the
   * waiter decides their own score, and letting that mint points made the leaderboard a
   * measure of how many times someone tapped "5". Only a mode that grades itself can
   * VERIFY a dish, and only verified dishes are worth points. A wrong answer in a graded
   * mode un-verifies the dish, so a mistake costs the points it earned.
   */
  const learnItem = async (id, rating, { objective = true } = {}) => {
    if (!session?.teamMemberId) return;
    const wasVerified = !!verifiedById[id];
    const nowVerified = rating >= 4 && (objective || wasVerified);
    const wasMastered = mastered.has(id);
    const nowMastered = rating >= 4 && nowVerified;
    const crossed = wasMastered !== nowMastered;
    setVerifiedById(prev => ({ ...prev, [id]: nowVerified }));
    setMasteryById(prev => ({ ...prev, [id]: rating }));
    const nextFives = nextConsecutiveFives(fivesById[id], rating);
    setFivesById(prev => ({ ...prev, [id]: nextFives }));

    let nextMasteredSize = mastered.size;
    if (crossed) {
      const next = new Set(mastered);
      if (nowMastered) next.add(id); else next.delete(id);
      nextMasteredSize = next.size;
      setMastered(next);
    }

    // Daily challenge: 3 NEWLY-mastered dishes/day → one-time +50 bonus. Only counts
    // fresh mastery (not re-grading something already known), and only counts up.
    // Each dish counts toward the daily challenge at most once per day. Without the id
    // list, un-mastering and re-mastering the same dish counted again every time.
    const base = daily.date === todayStr() ? daily : { date: todayStr(), count: 0, bonusAwarded: false, ids: [] };
    const countedToday = new Set(base.ids || []);
    const justMasteredFresh = !wasMastered && nowMastered && !countedToday.has(id);
    let newBonusTotal = bonusTotal;
    if (justMasteredFresh) {
      const newDaily = { date: todayStr(), count: base.count + 1, bonusAwarded: base.bonusAwarded || base.count + 1 >= DAILY_TARGET, ids: [...countedToday, id] };
      const justEarnedBonus = !base.bonusAwarded && newDaily.bonusAwarded;
      setDaily(newDaily);
      saveDaily(session.teamMemberId, newDaily);
      if (justEarnedBonus) {
        newBonusTotal = bonusTotal + DAILY_BONUS;
        setBonusTotal(newBonusTotal);
        saveNum("menu-app-bonus", session.teamMemberId, newBonusTotal);
        if (!session.offline) {
          void db.rpc("add_weekly_points", {
            p_restaurant_id: session.restaurantId,
            p_team_member_id: session.teamMemberId,
            p_name: session.name,
            p_points: DAILY_BONUS,
          }).then(refetchWeekly, () => {});
        }
      }
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
    await db.from("menu_progress").upsert({ team_member_id: session.teamMemberId, source_item_id: id, mastery: rating, consecutive_fives: nextFives, verified: nowVerified, last_reviewed: new Date().toISOString() }, { onConflict: "team_member_id,source_item_id" });
    // Server-side visibility for the owner's team-activity dashboard (today_count/last_study_date
    // on leaderboard) — separate from the localStorage-based daily-bonus tracking above.
    if (justMasteredFresh) {
      await db.rpc("bump_daily_progress", { p_restaurant_id: session.restaurantId, p_team_member_id: session.teamMemberId, p_name: session.name });
    }
    if (crossed) {
      const points = nextMasteredSize * 100 + newBonusTotal;
      await db.from("leaderboard").upsert({ restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, name: session.name, points, mastered_count: nextMasteredSize, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,team_member_id" });
      // Weekly is accrued, not recomputed: +100 for a dish that just became verified-
      // mastered, -100 if it fell back out. Symmetric on purpose — a mistake costing the
      // points it earned is the same rule the all-time score already follows.
      await db.rpc("add_weekly_points", {
        p_restaurant_id: session.restaurantId,
        p_team_member_id: session.teamMemberId,
        p_name: session.name,
        p_points: nowMastered ? 100 : -100,
      });
      void refetchWeekly();
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
    onSecond: () => setTodaySeconds((n) => n + 1),
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
  // The flashcard deck for THIS session: a short, weakness-weighted slice of the scope
  // rather than every dish in it. Frozen for the round for the same reason gameItems is —
  // rating a card changes the progress map, and rebuilding mid-session would reshuffle the
  // deck under the waiter's hands.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const studySession = useMemo(() => {
    const progress = {};
    for (const it of gameItems || []) {
      progress[it.id] = { mastery: masteryById?.[it.id] ?? null, consecutiveFives: fivesById?.[it.id] || 0 };
    }
    return buildStudySession(gameItems, progress);
  }, [gameItems]);

  // "5 minutes before a shift": one short round of what matters tonight — the dishes the
  // owner starred, the ones just added, and the ones this waiter is weakest on.
  //
  // That is exactly what buildStudySession already ranks (untouched scores highest, low
  // mastery next, STAR_BOOST lifts starred), so the quick round is the same algorithm at a
  // smaller size rather than a second selection rule that could drift away from it.
  //
  // Deliberately drawn from the WHOLE menu, not path.gamePool: a dish the owner is pushing
  // tonight matters whether or not its category's exam has been passed. It is flashcards,
  // so it is self-reported and cannot mint points either way.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quickSession = useMemo(() => {
    const progress = {};
    for (const it of cards || []) {
      progress[it.id] = { mastery: masteryById?.[it.id] ?? null, consecutiveFives: fivesById?.[it.id] || 0 };
    }
    return buildStudySession(cards, progress, QUICK_SESSION_SIZE, Math.random, { repeatWeak: false });
  }, [cards, mode]);

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

  if (mode === "flashcards") return <Flashcards items={studySession.deck} session={studySession} onRate={(id, r) => learnItem(id, r, { objective: false })} onDone={exitMode} />;
  if (mode === "quick") return <Flashcards items={quickSession.deck} session={quickSession} quick onRate={(id, r) => learnItem(id, r, { objective: false })} onDone={exitMode} />;
  if (mode === "quiz") return <Quiz items={gameItems} facets={gameFacets} openKeys={path.openKeys} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "match") return <Matching items={gameItems} onAnswer={learnItem} onDone={exitMode} session={session} />;
  if (mode === "speed") return <Speed items={gameItems} onAnswer={learnItem} onDone={exitMode} onFinish={finishSpeed} />;
  if (mode === "allergens") return <AllergenQuiz items={gameItems} onAnswer={learnItem} onDone={exitMode} />;
  if (mode === "namecomplete") return <NameCompletion items={gameItems} facets={gameFacets} openKeys={path.openKeys} onAnswer={learnItem} onDone={exitMode} />;
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
  // Rank follows the weekly board, since that is the competition on screen. Falls back to
  // all-time before any points have been scored this week, so a returning waiter doesn't
  // see their standing vanish every Sunday morning.
  const myRank = (weekly.length
    ? weekly.findIndex(r => r.team_member_id === session?.teamMemberId)
    : leaderboard.findIndex(r => r.team_member_id === session?.teamMemberId)) + 1;
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

  // The daily goal, in minutes, set by the owner.
  const goalMinutes = examConfig?.daily_goal_minutes || DEFAULT_DAILY_MINUTES;
  const studiedMinutes = Math.floor(todaySeconds / 60);
  const goalPct = Math.min(100, Math.round((todaySeconds / (goalMinutes * 60)) * 100));
  const goalMet = studiedMinutes >= goalMinutes;

  const dailyDone = daily.count >= DAILY_TARGET;
  // A challenge whose game is still locked shows what it takes to open it instead of a
  // button that would launch a mode the path hasn't reached.
  // Every mode is open now (see learningPath.js) — these stay only so the challenge cards
  // keep one shape, and they never withhold anything.
  const gameLock = (mode) => path.games.find((g) => g.mode === mode);
  const lockedNote = () => null;
  const gatedAction = (mode, label) => ({ label, onClick: () => { setModeItems(null); setMode(mode); } });
  const challenges = cards ? [
    // Drops off the list once it is done for the day. A finished challenge with no action
    // left is just a spent row at the top of the page; the bonus was already awarded and
    // announced, and it comes back on its own tomorrow.
    goalMet ? null : {
      id: "daily-minutes", icon: Target, color: "#f3a712", title: "היעד היומי",
      desc: `${goalMinutes} דקות לימוד היום — נשארו ${Math.max(0, goalMinutes - studiedMinutes)}`,
      progress: Math.min(studiedMinutes, goalMinutes), target: goalMinutes, done: false,
      action: { label: "להתחיל ללמוד", onClick: () => { setModeItems(null); setMode("quick"); } },
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
      // No action button — this one is a status card, so the whole card is the target and
      // it opens the menu itself, where the remaining dishes actually are.
      id: "full", icon: Trophy, color: "#22c08c", title: "שליטה מלאה בתפריט",
      desc: "למדו את כל המנות בתפריט", progress: mastered.size, target: cards.length,
      done: cards.length > 0 && mastered.size >= cards.length, action: null,
      onCardClick: () => setTab("categories"),
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
  ].filter(Boolean) : [];

  // Home-page carousel — exactly three slides, by request: today's briefing, what is new
  // to learn, and the study round to do next. Everything else that used to live here (the
  // daily challenge, team leaders, game teasers) already has its own place further down
  // the home screen or in the challenges tab; repeating it up here was noise, and it
  // buried the three things that actually matter before a shift.
  // Slides 2 and 3 always render a card — never a gap — so the count stays at three.
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
    // Slide 3: where the staged path says this waiter stands. Like slide 2 it never
    // disappears — with every category already passed there is still something to do,
    // and an empty third slot would leave the carousel with two.
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
    } : {
      id: "study-round", gradient: "linear-gradient(135deg,#14b8a6,#0d7f74)", icon: GraduationCap,
      kicker: "לימוד מנות",
      title: "סבב לימוד מותאם אליכם",
      subtitle: "המנות שהכי כדאי לחזור עליהן, לפי איך שהצלחתם בפעם הקודמת",
      cta: "לסבב לימוד",
      onClick: () => { setModeItems(null); setMode("flashcards"); },
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
            {/* Picked up where you stopped. Above everything else because it is the one
                card that expires — dismissing it removes it for good. */}
            {resumeOffer && (
              <div className="bg-[#16181c] border border-[#6d5efc] rounded-xl p-3 flex items-center gap-3">
                <Repeat size={16} className="text-[#6d5efc] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-[#eef0f6]">להמשיך מאיפה שהפסקתם?</p>
                  <p className="text-[10px] font-bold text-[#8a8aa0]">
                    {MODE_LABELS[resumeOffer.mode] || "סבב לימוד"}
                    {resumeOffer.categoryKey ? ` · ${shortCat(resumeOffer.categoryKey)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    const items = resumeOffer.categoryKey
                      ? (cards || []).filter((c) => c.category === resumeOffer.categoryKey)
                      : null;
                    setModeItems(items?.length ? items : null);
                    setMode(resumeOffer.mode);
                    setResumeOffer(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#6d5efc] text-white text-[11px] font-black flex-shrink-0"
                >
                  להמשיך
                </button>
                <button
                  onClick={() => { clearResume(session?.teamMemberId); setResumeOffer(null); }}
                  className="text-[#5a5a6e] text-[11px] font-bold flex-shrink-0"
                >
                  לא
                </button>
              </div>
            )}

            {/* First thing on the home screen: the one action that fits in the two minutes
                a waiter actually has before service. */}
            <button
              onClick={() => { setModeItems(null); setMode("quick"); }}
              className="w-full rounded-2xl p-4 text-right flex items-center gap-3 bg-gradient-to-l from-[#1b3a36] to-[#16181c] border border-[#22c08c]"
            >
              <div className="w-9 h-9 rounded-full bg-[#22c08c]/20 flex items-center justify-center flex-shrink-0">
                <Zap size={17} className="text-[#22c08c]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-[#eef0f6]">5 דקות לפני משמרת</p>
                <p className="text-[10px] font-bold text-[#8a8aa0]">
                  {quickSession.deck.length} מנות — מה שסומן, מה שחדש, ומה שהכי חלש אצלכם
                </p>
              </div>
              <ChevronLeft size={16} className="text-[#22c08c] flex-shrink-0" />
            </button>

            {/* The daily goal, in minutes, as a ring you can read at a glance. Minutes and
                not dishes: the owner sets the number, and time is what a waiter can
                actually promise before a shift. */}
            <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3 flex items-center gap-3">
              <div className="relative w-[52px] h-[52px] flex-shrink-0">
                <svg viewBox="0 0 52 52" className="w-[52px] h-[52px] -rotate-90">
                  <circle cx="26" cy="26" r="22" fill="none" stroke="#22252b" strokeWidth="6" />
                  <circle
                    cx="26" cy="26" r="22" fill="none"
                    stroke={goalMet ? "#22c08c" : "#f3a712"} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${(goalPct / 100) * 2 * Math.PI * 22} ${2 * Math.PI * 22}`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black"
                      style={{ color: goalMet ? "#22c08c" : "#eef0f6" }}>
                  {goalMet ? "✓" : `${goalPct}%`}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[#eef0f6]">
                  {goalMet ? "השלמתם את היעד היומי 🎉" : "היעד היומי"}
                </p>
                <p className="text-[10px] font-bold text-[#8a8aa0]">
                  {studiedMinutes} מתוך {goalMinutes} דקות לימוד היום
                </p>
              </div>
            </div>
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
                  <button key={g.mode}
                    onClick={() => { setModeItems(null); setMode(g.mode); }}
                    className="font-bold text-xs py-2.5 rounded-lg flex items-center justify-center gap-1 bg-[#22252b] text-[#eef0f6]">
                    {g.label}
                  </button>
                ))}
              </div>
              {/* Nothing is locked, so the note explains SCOPE instead: practice draws
                  from the categories already passed, and passing another widens it. */}
              {path.scopedToOpen && path.openKeys?.length > 0 && (
                <p className="text-[10px] text-[#8a8aa0] mt-2 leading-relaxed">
                  {path.passedCount === 0
                    ? `כל התרגול פתוח — כרגע על ${shortCat(path.openKeys[0])}. עברו מבחן כדי להוסיף עוד קטגוריות לתרגול.`
                    : `התרגול כולל: ${path.openKeys.map(shortCat).join(" · ")}. כל מבחן שעוברים מוסיף קטגוריה.`}
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
        {tab === "leaderboard" && (() => {
          // Weekly is the default view: a lifetime total means whoever started first wins
          // forever, and a waiter who joined on Sunday can never catch up. All-time is
          // kept behind a toggle because the total is still something people are proud of.
          const weeklyRows = weekly.map((w) => {
            const all = leaderboard.find((r) => r.team_member_id === w.team_member_id);
            return { ...w, mastered_count: all?.mastered_count ?? 0, streak: all?.streak ?? 0 };
          });
          const rows = boardScope === "week" ? weeklyRows : leaderboard;
          return (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                {[{ k: "week", label: "השבוע" }, { k: "all", label: "כל הזמנים" }].map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setBoardScope(o.k)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      boardScope === o.k
                        ? "bg-[#6d5efc] text-white border-[#6d5efc]"
                        : "bg-[#16181c] text-[#8a8aa0] border-[#22252b]"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {boardScope === "week" && (
                <p className="text-[10px] text-[#8a8aa0] px-1 leading-relaxed">
                  הניקוד מתאפס בכל יום ראשון — כל שבוע מתחיל מחדש, וגם מי שהצטרף אתמול יכול לנצח.
                </p>
              )}

              <div className="bg-[#16181c] rounded-lg overflow-hidden">
                {rows.length === 0 && (
                  <p className="text-xs text-[#8a8aa0] p-4 text-center">
                    {boardScope === "week" ? "עוד לא נצברו נקודות השבוע — אתם יכולים להיות ראשונים" : "עדיין אין נתונים — התחילו ללמוד!"}
                  </p>
                )}
                {rows.slice(0, 10).map((r, i) => (
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
            </div>
          );
        })()}
        {tab === "categories" && (
          <div className="space-y-2">
            <p className="text-[10px] text-[#8a8aa0] px-1 leading-relaxed">
              {/* No order is imposed any more — say so, and steer without blocking. */}
              כל הקטגוריות פתוחות — אפשר להתחיל מאיפה שרוצים.
              {path.recommended ? ` ממליצים להתחיל ב${shortCat(path.recommended.key)}.` : ""}
              {path.scopedToOpen ? " מבחן שעוברים מוסיף את הקטגוריה לתרגול." : ""}
            </p>
            {path.categories.map((cat) => {
              // A category can't be examined on dishes with no ingredients to ask about.
              // Reaching the threshold is the only condition. A category with thin data
              // gets the multiple-choice exam instead of the chip one, but it is never
              // unpassable — a locked graduation would stall every category behind it.
              const examReady = cat.examUnlocked;
              return (
                <div key={cat.key} className="rounded-lg p-2.5 bg-[#16181c]">
                  <button
                    onClick={() => { setModeItems(cat.items); setMode("flashcards"); }}
                    className="w-full text-right active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      {/* Imported categories can carry their whole explanatory line
                          ("מאקי — 6 יחידות, אצה בחוץ…"), so clamp instead of letting one
                          row grow to four lines. */}
                      <p className="text-xs font-black text-[#eef0f6] line-clamp-2 flex-1 flex items-center gap-1.5" title={catLabel(cat.key)}>
                        {cat.passed && <Check size={12} className="text-[#22c08c] flex-shrink-0" />}
                        {catLabel(cat.key)}
                      </p>
                      <span className="text-[11px] font-bold text-[#6d5efc] flex-shrink-0">{cat.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${cat.pct}%`, background: cat.passed ? "#22c08c" : "#6d5efc" }} />
                    </div>
                    <p className="text-[10px] text-[#8a8aa0] mt-1">
                      {/* shortCat, not the full label: imported categories carry their
                          whole explanation ("מאקי — 6 יחידות, אצה בחוץ ואורז בפנים") and
                          inlining that makes the sentence unreadable. */}
                      {cat.items.length} מנות · לחצו לתרגול
                      {cat.passed
                        ? " · נכלל בתרגול"
                        : path.recommended?.key === cat.key ? " · מומלץ להתחיל כאן" : ""}
                    </p>
                  </button>
                  {(
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
            {challenges.map(ch => {
              // A card with a destination becomes the button itself; the rest stay static.
              const Tag = ch.onCardClick ? "button" : "div";
              return (
              <Tag
                key={ch.id}
                onClick={ch.onCardClick}
                className={`bg-[#16181c] rounded-lg p-3 block w-full text-right ${ch.onCardClick ? "cursor-pointer active:bg-[#191b1f]" : ""}`}
              >
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
                {ch.onCardClick && (
                  <p className="text-[10px] font-bold mt-2" style={{ color: ch.color }}>לצפייה בתפריט ←</p>
                )}
              </Tag>
              );
            })}
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
