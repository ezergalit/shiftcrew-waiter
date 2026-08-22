import { useEffect, useState, useMemo, useRef } from "react";
import { BookOpen, BarChart3, Home, LogOut, WifiOff, Check, ChevronRight, ListChecks, GraduationCap, Repeat, Layers, HelpCircle, Puzzle, Zap, ShieldAlert, FileText, Lock } from "lucide-react";
import { supabase } from "../lib/supabase";
import MetricsScreen from "../components/MetricsScreen";
import BriefAck from "../components/BriefAck";
import BriefGate, { briefHasContent } from "../components/BriefGate";
import AppTour from "../components/AppTour";
import TasksTab, { useShiftTasks, PERIOD_LABEL } from "../components/TasksTab";
import ManagerMessages from "../components/ManagerMessages";
import { ShiftQuestion, ShiftChip, ShiftGate } from "../components/ShiftPicker";
import { loadShift, saveShift, loadRole, saveRole, taskFitsShift, taskFitsRole } from "../lib/shiftChoice";
import MenuBrowser from "../components/MenuBrowser";
import { isUnderstood } from "../lib/progressiveSession";
import ProgressiveFlashcards from "../games/ProgressiveFlashcards";
import { buildStudySession, nextConsecutiveFives, isRetired, QUICK_SESSION_SIZE } from "../lib/studySession";
import { MOCK_CARDS, MOCK_BRIEF, MOCK_LEADERBOARD } from "../lib/mockMenu";
import { pickDistractors, buildWeightedDeck, availableFacets, dishLabel, withDisplayNames } from "../lib/questionEngine";
import { pathState } from "../lib/learningPath";
import { useStudyTime } from "../lib/studyTime";
import { hapticAnswer } from "../lib/haptics";
import {
  CAT_LABELS, CAT_ORDER, catLabel, shortCat, countLabel, colorFor, shuffle,
  todayStr, loadDaily, saveDaily, loadNum, saveNum, FEEDBACK_MS,
} from "../games/shared";
import Flashcards from "../games/Flashcards";
import GroupFlashcards from "../games/GroupFlashcards";
import CategoryExam from "../games/CategoryExam";
import QuizExam from "../games/QuizExam";
import MenuExam from "../games/MenuExam";


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
// The quiz games were removed (user, 2026-08-20): the app teaches from the menu and
// tests with the exams, so a shelf of mini-games in between was noise.
const MODE_LABELS = {
  flashcards: "כרטיסיות",
  quick: "5 דקות לפני משמרת",
  exam: "בוחן קטגוריה",
  progressive: "תרגול לפי התפריט",
};
const DAILY_BONUS = 50;

// First-run tour flag, device-scoped like the welcome slides.
const TOUR_DONE_KEY = "menu-app-apptour-done";

function pubToCard(p) {
  const ing = (p.ingredients || []).filter(Boolean);
  // displayName is filled in by withDisplayNames once the whole menu is loaded — whether a
  // name needs its serving style depends on the other dishes, not on this row alone.
  // Four separate warning groups, never merged: "fish" is an allergy, "raw fish" is a
  // pregnancy warning, "coriander" is a preference. A waiter reading one combined list
  // can't tell which one could put a guest in hospital. See src/lib/dishFlags.js.
  return { id: p.source_item_id, name: p.name, price: Number(p.price), category: p.category, menuGroup: p.menu_group || null, desc: p.description || "", ingredients: ing, allergens: (p.allergens || []).filter(Boolean), pregnancy: (p.pregnancy || []).filter(Boolean), pitfalls: (p.pitfalls || []).filter(Boolean), kashrut: (p.kashrut || []).filter(Boolean), menuPosition: p.menu_position, createdAt: p.created_at, // `starred` is the manager's emphasis toggle (owner app, 2026-08-13); `is_special` is
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
  // Menu-tab drill-down (2026-08-19): a tapped category shows its dish list instead of
  // launching a deck, and a tapped dish opens the continuous progressive session.
  const [catView, setCatView] = useState(null); // category key or null
  const [groupView, setGroupView] = useState(null); // menu (menu_group) key or null
  // Bumped to remount MenuBrowser at its top level (see the tour's onNavigate).
  const [browseKey, setBrowseKey] = useState(0);
  // Today's shift (opening/closing/none) + stable role (waiter/bar). The shift is a
  // daily answer — loadShift returns null on a new day, which reopens the question.
  const [myShift, setMyShift] = useState(() => loadShift(session?.teamMemberId));
  const [myRole, setMyRole] = useState(() => loadRole(session?.teamMemberId));
  const [shiftEditing, setShiftEditing] = useState(false);
  const [tourOpen, setTourOpen] = useState(() =>
    !!session?.teamMemberId && localStorage.getItem(`menu-app-apptour-done-${session.teamMemberId}`) !== "1");
  const { rows: shiftRows, doneIds: taskDone, toggle: toggleTask } = useShiftTasks(session);
  const [prog, setProg] = useState(null); // { items, label, progress, firstId }
  // Re-running the gate from the daily tab is practice — it never rewrites the ack row.
  const [gatePractice, setGatePractice] = useState(false);
  // The staged path: what the owner configured, and which category exams this member has
  // already passed. Both feed learningPath.pathState, which derives every unlock.
  const [examConfig, setExamConfig] = useState(null);
  // Seconds studied today: seeded from the snapshots already written, then ticked live by
  // useStudyTime so the ring moves while the waiter studies instead of jumping every two
  // minutes when a flush lands.
  const [todaySeconds, setTodaySeconds] = useState(0);
  // Minutes studied since Sunday — feeds the personal greeting ("השבוע למדת X דקות").
  const [weekSeconds, setWeekSeconds] = useState(0);
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

  // Continuous practice from the menu tab: category scope (or the whole menu), optionally
  // opening on one specific dish. The progress snapshot seeds the session; from there the
  // component keeps its own live copy so each pick sees the rating just given.
  const startProgressive = (catKey, firstId = null) => {
    const items = catKey ? (cards || []).filter((c) => c.category === catKey) : (cards || []);
    if (!items.length) return;
    const progress = {};
    for (const it of items) progress[it.id] = { mastery: masteryById?.[it.id] ?? null, consecutiveFives: fivesById?.[it.id] || 0 };
    setProg({ items, label: catKey ? shortCat(catKey) : "התפריט", progress, firstId, catKey });
    setMode("progressive");
  };

  // Remember the current round so closing the app mid-way can be picked up later. Category
  // rounds store the category so the same scope comes back, not a fresh full-menu deck.
  useEffect(() => {
    if (!session?.teamMemberId) return;
    // Progressive sessions are excluded from resume: they are picked one card at a time
    // from live progress, so there is no fixed deck to come back to — reopening the list
    // and tapping again rebuilds the exact same state.
    if (!mode || mode === "progressive") return;
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
      // Weekly was only ever fetched after a scoring event or a realtime ping, so a
      // fresh load showed an empty weekly board even when points existed for this week.
      void refetchWeekly();
      const { data: cfg } = await db.from("exam_config").select("*").eq("restaurant_id", session?.restaurantId).maybeSingle();
      if (alive) setExamConfig(cfg || {});
      // Everything already recorded, so the numbers survive a refresh. One fetch since
      // Sunday serves both sums: the whole range is the week, today's rows are the day.
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const wkStart = new Date(dayStart); wkStart.setDate(wkStart.getDate() - wkStart.getDay());
      const { data: weekSnaps } = await db.from("progress_snapshots")
        .select("seconds_delta, taken_at").eq("team_member_id", session?.teamMemberId)
        .gte("taken_at", wkStart.toISOString());
      if (alive) {
        setWeekSeconds((weekSnaps || []).reduce((n, r) => n + (r.seconds_delta || 0), 0));
        setTodaySeconds((weekSnaps || []).filter((r) => new Date(r.taken_at) >= dayStart)
          .reduce((n, r) => n + (r.seconds_delta || 0), 0));
      }
      const { data: exams } = await db.from("exam_results")
        .select("category").eq("team_member_id", session?.teamMemberId).eq("passed", true);
      if (alive) setPassedCats([...new Set((exams || []).map(r => r.category))]);
      const today = new Date().toISOString().slice(0, 10);
      const { data: b, error: bErr } = await db.from("daily_brief").select("*").eq("restaurant_id", session?.restaurantId).eq("date", today).maybeSingle();
      // A brief that fails to load looks exactly like a day with no brief — the same
      // shape of silent failure that hid the empty team tab on the owner side.
      if (bErr) console.error("daily_brief", bErr.message, bErr.details, bErr.hint, bErr.code);
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
    // Native-only success/error haptic. Graded answers only — self-rating a
    // flashcard "2" is a judgment call, not a mistake, and shouldn't buzz.
    if (objective) hapticAnswer(rating >= 4);
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
    if (error) console.error("exam_results insert failed:", error.message, error.details, error.hint, error.code);
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

  // עדכון יומי של המסעדה — the daily-brief gate. First entry of the day (per waiter, per
  // the daily_brief_reads row) blocks everything until the brief's questions are answered.
  // Requires the menu to be loaded (distractors come from it); never shown offline, and
  // never shown when today's brief has no content at all.
  // The day starts with one question: are you on shift? (user, 2026-08-20). Asked before
  // the brief gate — someone who isn't working today gets no daily tasks and no brief,
  // just the learning path. Answered once per day; changeable any time from the chip.
  if (!session?.offline && cards?.length > 0 && myShift === null)
    return (
      <ShiftGate
        role={myRole}
        onPick={(sh, role) => {
          setMyShift(sh); saveShift(session?.teamMemberId, sh);
          if (role) { setMyRole(role); saveRole(session?.teamMemberId, role); }
        }}
      />
    );
  if (!session?.offline && cards?.length > 0 && brief !== null && briefHasContent(brief) && !briefAck?.read_at && myShift !== "none")
    return <BriefGate brief={brief} cards={cards} session={session} onPassed={setBriefAck} />;
  if (gatePractice)
    return <BriefGate brief={brief} cards={cards} session={session} practice onClose={() => setGatePractice(false)} />;

  // Full-screen, above the tabs: it is a place you go to, not a tab you live in.
  if (showMetrics)
    return <MetricsScreen session={session} cards={cards} masteryById={masteryById} weekly={weekly} leaderboard={leaderboard} onDone={() => setShowMetrics(false)} />;

  if (mode === "progressive" && prog)
    return <ProgressiveFlashcards items={prog.items} label={prog.label} firstId={prog.firstId} initialProgress={prog.progress}
      onExam={prog.catKey ? () => {
        setExamCategory({ key: prog.catKey, label: catLabel(prog.catKey) });
        setModeItems(prog.items);
        setMode("exam");
      } : null}
      onRate={(id, r) => learnItem(id, r, { objective: false })} onDone={() => { setMode(null); setProg(null); }} />;

  if (mode === "flashcards") return <Flashcards items={studySession.deck} session={studySession} onRate={(id, r) => learnItem(id, r, { objective: false })} onDone={exitMode} />;
  if (mode === "quick") return <Flashcards items={quickSession.deck} session={quickSession} quick onRate={(id, r) => learnItem(id, r, { objective: false })} onDone={exitMode} />;
  // Thin-category study: group cards (front = "שתייה קלה מוגזת", back = the carry list
  // with prices). A per-item flashcard there flips קולה into קולה — teaches nothing.
  if (mode === "groupcards") return <GroupFlashcards items={gameItems} onRate={(id, r) => learnItem(id, r, { objective: false })} onDone={exitMode} />;
  // Two graduation formats, same contract to recordExam.
  //
  // The chip exam (pick the exact ingredient set) is the better test, but it needs dishes
  // that HAVE ingredients, and it tests ingredients whether or not the owner ranked them.
  // When either of those isn't true, the category still has to be passable — otherwise the
  // whole path deadlocks behind a button that can never be pressed — so it falls back to a
  // multiple-choice exam built from the owner's own facets.
  // The whole-menu exam (user request, 2026-08-20): timed service scenarios across every
  // category, sized by the owner (exam_config.general_exam_questions). Rebuilt the same
  // day from multiple-choice recall into the questions the floor actually asks — compose
  // the dish, recommend for a pregnant guest, three rolls with salmon. This is the goal
  // the tutorial points at; everything else in the app is training for it.
  // ⚠️ The pass mark is MenuExam's own 70, NOT exam_config.pass_threshold — that column is
  // the mastery % needed to SIT a category exam, not the mark needed to pass one. Both
  // exams in this app pass at 70, so the number means the same thing wherever it appears.
  if (mode === "general_exam") {
    return <MenuExam
      items={cards}
      deckSize={examConfig?.general_exam_questions || 40}
      categoryOrder={examConfig?.category_order || []}
      onAnswer={learnItem}
      onDone={exitMode}
      onFinish={recordExam}
    />;
  }
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
  // Derived from the menu itself, not a fixed list. Hardcoding the four English keys meant
  // any restaurant whose menu was built in the owner app — where categories are free-text
  // Hebrew — got an empty "תפריט" tab, and with no category rows there was no way to reach
  // an exam either. Known keys keep their canonical order; anything else follows in menu order.
  // A restaurant has several menus, and categories live inside one (menu_group, 2026-08-20).
  // Menus are the level above categories in the menu tab, so finding one dish is two taps
  // instead of scrolling the whole list. A menu with no group set falls back to one bucket,
  // which is exactly how every restaurant that predates the column keeps working.
  const menuGroups = (() => {
    const seen = [...new Set((cards || []).map(x => x.menuGroup).filter(Boolean))];
    if (!seen.length) return [];
    const firstPos = (g) => Math.min(...(cards || []).filter(x => x.menuGroup === g).map(x => x.menuPosition ?? 1e9));
    return seen.sort((a, b) => firstPos(a) - firstPos(b)).map(g => {
      const items = (cards || []).filter(x => x.menuGroup === g);
      return { g, items, catCount: new Set(items.map(x => x.category)).size };
    });
  })();

  const cats = (() => {
    const pool = groupView ? (cards || []).filter(x => x.menuGroup === groupView) : (cards || []);
    const seen = [...new Set(pool.map(x => x.category).filter(Boolean))];
    const ordered = [
      ...CAT_ORDER.filter(c => seen.includes(c)),
      ...seen.filter(c => !CAT_ORDER.includes(c)),
    ];
    return ordered.map(c => ({ c, items: pool.filter(x => x.category === c) }))
      .filter(g => g.items.length > 0);
  })();

  const briefItems = [
    ...(brief?.missing_items || []).map((x) => `חסר: ${x}`),
    ...(brief?.new_items || []).map((x) => `חדש: ${x}`),
    ...(brief?.oven_items || []).map((x) => `מוגבל: ${x}`),
  ];
  const hasBrief = briefItems.length > 0 || !!brief?.notes;
  const briefRead = !!briefAck?.read_at;

  // Home layout follows the user's 2026-08-20 sketch: a personal greeting bubble up top
  // (manager-to-team voice, with this waiter's own week), then the daily update and the
  // next category to learn as two cards side by side, then the untouched practice block.
  // Same palette as everywhere else — the sketch changed the layout, not the colours.
  const firstName = (session?.name || "").split(" ")[0];
  const weekMinutes = Math.floor(weekSeconds / 60);
  // The category the greeting cards steer toward: the path's recommendation, or the
  // weakest not-yet-passed category as a fallback so the card never goes blank.
  const focusCat = path.recommended
    ? path.categories.find((c) => c.key === path.recommended.key)
    : path.categories.find((c) => !c.passed) || path.categories[0];

  // The two learning tasks the app closes on the waiter's behalf, from real progress:
  // reading today's brief, and reaching the owner's daily minute goal. A tick a waiter
  // can give themselves for studying would measure tapping, not studying.
  const goalMinutes = examConfig?.daily_goal_minutes || DEFAULT_DAILY_MINUTES;
  // The task list is built from real content only — a row exists because the restaurant
  // sent something or the waiter has something concrete to do. Nothing here is a bare
  // checkbox: every entry either opens a screen or opens the manager's own instruction.
  // Two lists (user, 2026-08-20): what this shift needs, and what the waiter is
  // working on in general. The numbers are assigned by TasksTab from the open rows,
  // so finishing one renumbers the rest — nothing here carries a fixed position.
  const dayTasks = [];

  if (hasBrief && myShift !== "none") {
    dayTasks.push({
      id: "brief", group: "daily",
      title: "לקרוא את העדכון היומי",
      subtitle: briefItems.slice(0, 2).join(" · ") || brief?.notes || "מה קורה היום במסעדה",
      done: briefRead, cta: briefRead ? "לצפייה ←" : "לקריאה ←",
      onOpen: () => setTab("daily"),
    });
  }

  // The learning group steers INTO the menu first (user, 2026-08-20): someone who has
  // barely practised gets "read the menu" as task #1 — reading before drilling. The
  // second step depends on how much they've studied today: not much ⇒ keep learning the
  // focus category from the menu itself; enough ⇒ move to practising it.
  const touchedCount = Object.keys(masteryById || {}).length;
  if (touchedCount < 10) {
    dayTasks.push({
      id: "readmenu", group: "general",
      title: "לעבור על התפריט ולהכיר את המנות",
      subtitle: "קוראים מנה-מנה — מרכיבים, אלרגנים ומה אומרים לאורח",
      done: false, cta: "לתפריט ←",
      onOpen: () => setTab("categories"),
    });
  }

  if (newDishes.length > 0) {
    dayTasks.push({
      id: "newdishes", group: "general",
      title: `ללמוד ${newDishes.length === 1 ? "מנה חדשה בתפריט" : `${newDishes.length} מנות חדשות בתפריט`}`,
      subtitle: newDishes.slice(0, 3).map((d) => d.name).join(" · "),
      done: false, cta: "ללמידה ←",
      onOpen: () => { setModeItems(newDishes); setMode("flashcards"); },
    });
  }

  if (focusCat) {
    // Under half of today's goal studied ⇒ still in reading mode; past it ⇒ practise.
    const studiedEnough = todaySeconds >= (goalMinutes * 60) / 2;
    dayTasks.push({
      id: "focus", group: "general",
      title: studiedEnough ? `לתרגל ${shortCat(focusCat.key)}` : `ללמוד ${shortCat(focusCat.key)} מהתפריט`,
      subtitle: `${focusCat.pct}% · ${focusCat.items?.length || 0} מנות בקטגוריה`,
      done: todaySeconds >= goalMinutes * 60, cta: studiedEnough ? "לתרגול ←" : "ללימוד ←",
      onOpen: () => (studiedEnough ? startProgressive(focusCat.key) : setTab("categories")),
    });
  }

  // The manager's own instructions. They carry their text as `body`, so tapping opens the
  // instruction to read before it can be closed.
  // Filtered by today's answer: openers see the opening checklist, closers the closing
  // one, "not working today" hides all shift chores, and role-tagged tasks reach only
  // that role. Both filters default to VISIBLE for anything they don't recognise.
  for (const r of shiftRows) {
    if (r.kind === "learning") continue;   // handled above, from real progress
    if (myShift && !taskFitsShift(r.kind, myShift)) continue;
    if (!taskFitsRole(r.role, myRole)) continue;
    dayTasks.push({
      id: r.id, group: r.kind === "training" ? "general" : "daily",
      title: r.title, subtitle: r.subtitle,
      body: r.subtitle || r.title,
      periodLabel: PERIOD_LABEL[r.kind],
      todayOnly: !!r.expires_on,
      done: taskDone.has(r.id), cta: "לפתיחה ←",
    });
  }

  // The whole-menu exam is the certificate, so it opens only after every category exam
  // has been passed (user, 2026-08-20). Until then the card stays on screen but states
  // exactly what is left — a locked button with no reason is just a dead end.
  const catsWithExam = path.categories || [];
  const examsLeft = catsWithExam.filter((c) => !c.passed);
  const generalUnlocked = catsWithExam.length > 0 && examsLeft.length === 0;
  // ⚠️ Locked ⇒ renders NOTHING (user, 2026-08-20). A "you can't do this yet" banner at
  // the top of the learning tab is the first thing a new waiter reads, and it frames the
  // screen as blocked. The tour explains the path; this tab just shows what to practise,
  // and the exam appears the day it is actually available.
  const generalExamCard = () =>
    generalUnlocked ? (
      <button
        onClick={() => { setExamCategory({ key: "general", label: "התפריט המלא" }); setMode("general_exam"); }}
        className="w-full rounded-2xl p-3.5 text-right text-white active:scale-[0.99] transition-transform flex items-center gap-3"
        style={{ background: "linear-gradient(135deg,#14b8a6,#0d7f74)" }}
      >
        <GraduationCap size={20} className="flex-shrink-0" />
        <span className="flex-1">
          <span className="block text-sm font-black">מבחן התפריט המלא</span>
          <span className="block text-[11px] font-bold opacity-90">
            {examConfig?.general_exam_questions || 40} שאלות על כל התפריט, עם שעון — זו המטרה הסופית
          </span>
        </span>
      </button>
    ) : null;

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      {/* First-run interactive tour: walks the real screens, one step per tab. Shown once
          per member — the flag is device-scoped, same as the welcome slides. */}
      {tourOpen && (
        <AppTour
          onNavigate={(t) => {
            setTab(t);
            // ⚠️ The tour points at the TOP level of each tab ("tap a menu", "tap a
            // category"), but both tabs keep their own drill-down state. Landing on a
            // dish list with the spotlight looking for a menu card leaves the waiter
            // staring at a dimmed screen, so send each tab back to its first level.
            // ⚠️ Only when the tab actually CHANGES. Consecutive steps share a tab
            // ("tap a menu" then "tap a category"), and resetting on every step remounted
            // the browser right after the waiter's tap — undoing the tap they were just
            // told to make.
            if (t !== tab) {
              if (t === "categories") setBrowseKey((k) => k + 1);
              if (t === "learn") { setCatView(null); setGroupView(null); }
            }
          }}
          onDone={() => {
            setTourOpen(false);
            if (session?.teamMemberId) localStorage.setItem(`${TOUR_DONE_KEY}-${session.teamMemberId}`, "1");
          }}
        />
      )}
      {/* Header */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between flex-shrink-0">
        <SignOutButton onSignOut={onSignOut} />
        <div className="text-center">
          <p className="text-sm font-black">{session?.name}</p>
          {session?.restaurantName && <p className="text-[11px] text-[#8a8aa0] font-semibold">{session.restaurantName}</p>}
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
      <div key={tab} className="flex-1 overflow-y-auto px-4 py-3 animate-fadeIn">
        {tab === "home" && (
          <TasksTab tasks={dayTasks} onDone={toggleTask}>
            {/* A personal note from the manager outranks everything on this screen —
                someone wrote it to this waiter by name. */}
            <ManagerMessages session={session} />
            {/* Which shift is this? Until it's answered the manager's checklists can't be
                filtered, so the question sits first; afterwards it collapses to a chip
                that reopens it — the answer is changeable at any moment. Only shown when
                the manager actually uses shift tasks. */}
            {shiftRows.length > 0 && ((!myShift || shiftEditing) ? (
              <ShiftQuestion
                role={myRole}
                onPick={(sh, role) => {
                  setMyShift(sh); saveShift(session?.teamMemberId, sh);
                  setMyRole(role); saveRole(session?.teamMemberId, role);
                  setShiftEditing(false);
                }}
              />
            ) : (
              <ShiftChip shift={myShift} role={myRole} onChange={() => setShiftEditing(true)} />
            ))}
            {/* Picked up where you stopped. Above everything else because it is the one
                card that expires — dismissing it removes it for good. */}
            {resumeOffer && (
              <div className="bg-[#16181c] border border-[#6d5efc] rounded-xl p-3 flex items-center gap-3">
                <Repeat size={16} className="text-[#6d5efc] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-[#eef0f6]">להמשיך מאיפה שהפסקתם?</p>
                  <p className="text-[11px] font-bold text-[#8a8aa0]">
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

            {/* Personal greeting bubble — the manager's voice opening the shift (user's
                sketch, 2026-08-20). The waiter's own week + the manager's note, if any. */}
            <div className="rounded-2xl p-4 relative overflow-hidden text-[#EEF0F6]"
                 style={{ background: "linear-gradient(135deg,#0F5C46,#0a3d2f)" }}>
              <p className="text-base font-black">שלום {session?.name || firstName || "לך"} 👋</p>
              <p className="text-xs font-bold text-[#EEF0F6]/80 mt-1">
                {newDishes.length > 0
                  ? `נשאר לך ללמוד ${newDishes.length === 1 ? "מנה חדשה אחת" : `${newDishes.length} מנות חדשות`} בתפריט 🍽️`
                  : weekMinutes === 1 ? "השבוע למדת דקה אחת 💪" : weekMinutes > 0 ? `השבוע למדת ${weekMinutes} דקות 💪` : "שבוע חדש — זמן טוב להתחיל ללמוד 💪"}
                {myRank > 0 && <span className="text-[#f3c14b] font-black"> · מקום #{myRank}</span>}
              </p>
              {newDishes.length > 0 && (
                <button
                  onClick={() => { setModeItems(newDishes); setMode("flashcards"); }}
                  className="mt-2 text-[11px] font-black text-[#0F5C46] bg-[#EEF0F6] rounded-lg px-3 py-1.5 min-h-[36px] active:scale-[0.98] transition-transform"
                >
                  ללמידת המנות החדשות ←
                </button>
              )}
            </div>

          </TasksTab>
        )}
        {/* Learning tab: the practice grid and overall progress. It used to sit at the
            bottom of the old home screen, under the cards — which meant the thing the
            app exists for was the last thing on the page. */}
                {tab === "learn" && catView && (() => {
          // Drill-down (2026-08-19): the category's dishes, one by one, under "לתרגול X:".
          // Tapping a dish opens it as the first card of a progressive session; the big
          // button starts the same session without choosing an opener.
          const items = (cards || []).filter((c) => c.category === catView);
          // A "thin" category — most items carry no ingredients and no description
          // (soft drinks and the like) — can't build the regular question types, but it
          // has a quiz of its own: do you know the carry list? (user request, 2026-08-20)
          const thin = items.length >= 3 &&
            items.filter((x) => !(x.ingredients?.length) && !x.desc).length / items.length >= 0.5;
          return (
            <div className="space-y-2">
              {/* Back sits top-right (user request, 2026-08-20) — in RTL that is the
                  "backwards" side, and a real button reads better than a text link. */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setCatView(null)}
                  title="חזרה לכל הקטגוריות"
                  className="w-10 h-10 rounded-xl bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-shrink-0 active:scale-95 transition-transform"
                >
                  <ChevronRight size={19} />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#eef0f6]">לתרגול {shortCat(catView)}:</p>
                  <p className="text-[11px] text-[#8a8aa0]">הקישו על מנה ללימוד ממוקד, או התחילו תרגול מלא</p>
                </div>
              </div>
              {/* Thin categories study as group cards, not per-item flashcards —
                  a card whose front and back both say קולה teaches nothing. */}
              <button onClick={() => { if (thin) { setModeItems(items); setMode("groupcards"); } else startProgressive(catView); }}
                className="w-full py-3 min-h-[48px] rounded-xl bg-[#6d5efc] text-white text-sm font-black active:scale-[0.99] transition-transform">
                תרגול {shortCat(catView)}
              </button>
              {/* The exam belongs inside the category page too (user, 2026-08-20) —
                  finishing the dishes here and having to hunt for the exam outside
                  was confusing. Same gate and launch as the list view's button. */}
              {(() => {
                const cat = (path.categories || []).find((c) => c.key === catView);
                if (!cat) return null;
                const examReady = cat.examUnlocked;
                // Same rule as the list: until the exam is actually available there is
                // no row for it here either.
                if (!examReady) return null;
                return (
                  <button
                    onClick={() => { setModeItems(cat.items); setExamCategory({ key: cat.key, label: catLabel(cat.key) }); setMode("exam"); }}
                    className="w-full py-3 min-h-[48px] rounded-xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform bg-[#22c08c] text-white"
                  >
                    <GraduationCap size={15} />
                    {cat.passed ? "עברתם את הבוחן! אפשר לגשת שוב" : `מבחן ${shortCat(catView)}`}
                  </button>
                );
              })()}
              {items.map((it) => {
                const m = masteryById?.[it.id] || 0;
                const done = isUnderstood(fivesById?.[it.id]);
                return (
                  <button key={it.id} onClick={() => startProgressive(catView, it.id)}
                    className="w-full text-right bg-[#16181c] rounded-lg p-2.5 active:scale-[0.99] transition-transform">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-[#eef0f6] flex-1 line-clamp-1">{dishLabel(it)}</p>
                      {done && <span className="text-[11px] font-black text-[#22c08c] flex-shrink-0">✓ מכירים</span>}
                    </div>
                    {it.desc && <p className="text-[11px] text-[#8a8aa0] mt-0.5 line-clamp-1">{it.desc}</p>}
                    <div className="h-1 bg-[#22252b] rounded-full overflow-hidden mt-1.5 max-w-[110px]">
                      <div className="h-full" style={{ width: `${done ? 100 : m * 20}%`, background: done ? "#22c08c" : "#6d5efc" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}
        {/* Menus level: only when the restaurant's menu is actually split into menus.
            Nothing changes for a restaurant whose dishes carry no menu_group. */}
        {/* Menus level: a restaurant has several menus and categories live inside one.
            Shown only when this restaurant's dishes actually carry a menu_group, so a
            menu that predates the column behaves exactly as before. */}
        {tab === "learn" && !catView && !groupView && menuGroups.length > 1 && (
          <div className="space-y-2">
            {/* The whole-menu exam is the goal this tab exists for, so it sits at the top
                level rather than one drill-down in. */}
            {generalExamCard()}
            <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">
              קודם עוברים על המנות בתפריט, אחר כך נבחנים בכל קטגוריה.
            </p>
            {menuGroups.map(({ g, items, catCount }) => {
              const pct = scorePct(items);
              return (
                <button key={g} data-tour="learn-menu" onClick={() => setGroupView(g)}
                  className="w-full text-right bg-[#16181c] rounded-2xl p-3.5 border border-[#22252b] active:scale-[0.99] transition-transform">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-[#eef0f6]">{g}</span>
                    <span className="text-xs font-black" style={{ color: pct >= 50 ? "#22c08c" : pct > 0 ? "#f3a712" : "#5a5a6e" }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mt-2">
                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: pct >= 50 ? "#22c08c" : "#6d5efc" }} />
                  </div>
                  <p className="text-[11px] text-[#8a8aa0] mt-1.5">{catCount} קטגוריות · {items.length} מנות</p>
                  {/* Say what the tap does, in the words the waiter would use for it
                      (user, 2026-08-20) — "לתרגול תפריט סושי", not a bare menu name. */}
                  <p className="text-[11px] font-black text-[#22c08c] mt-1.5">לתרגול {g} ←</p>
                </button>
              );
            })}
          </div>
        )}

        {tab === "learn" && !catView && (groupView || menuGroups.length <= 1) && (
          <div className="space-y-2">
            {groupView && (
              <div className="flex items-center gap-2.5">
                <button onClick={() => setGroupView(null)} title="חזרה לכל התפריטים"
                  className="w-10 h-10 rounded-xl bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#eef0f6] flex-shrink-0 active:scale-95 transition-transform">
                  <ChevronRight size={19} />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-[#5a5a6e]">התפריטים</p>
                  <p className="text-sm font-black text-[#eef0f6] line-clamp-1">{groupView}</p>
                </div>
              </div>
            )}
            {generalExamCard()}
            <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">
              {/* No order is imposed — steer, never block. */}
              בוחרים קטגוריה, עוברים על המנות שבה, וכשמכירים אותן — נבחנים.
              {path.recommended ? ` ממליצים להתחיל ב${shortCat(path.recommended.key)}.` : ""}
            </p>
            {/* `path.categories` is built from the whole menu — inside a menu, show only
                that menu's categories, or the header and the list disagree. */}
            {path.categories.filter((cat) => !groupView || cat.items?.[0]?.menuGroup === groupView).map((cat) => {
              // A category can't be examined on dishes with no ingredients to ask about.
              // Reaching the threshold is the only condition. A category with thin data
              // gets the multiple-choice exam instead of the chip one, but it is never
              // unpassable — a locked graduation would stall every category behind it.
              const examReady = cat.examUnlocked;
              return (
                <div key={cat.key} className="rounded-2xl p-3 bg-[#16181c]">
                  <button
                    data-tour="learn-category"
                    onClick={() => setCatView(cat.key)}
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
                    <p className="text-[11px] text-[#8a8aa0] mt-1">
                      {/* shortCat, not the full label: imported categories carry their
                          whole explanation ("מאקי — 6 יחידות, אצה בחוץ ואורז בפנים") and
                          inlining that makes the sentence unreadable. */}
                      {cat.items.length} מנות · לחצו לתרגול
                      {cat.passed
                        ? " · נכלל בתרגול"
                        : path.recommended?.key === cat.key ? " · מומלץ להתחיל כאן" : ""}
                    </p>
                  </button>
                  {/* ⚠️ Not ready ⇒ no exam row at all (user, 2026-08-20). The old
                      "reach 50% to take the exam" line named a number the waiter has no
                      way to interpret and put a dead button on every category. The exam
                      shows up the moment it is actually available — and then it asks,
                      rather than sitting there greyed out. */}
                  {examReady && (
                    cat.passed ? (
                      <button
                        onClick={() => { setModeItems(cat.items); setExamCategory({ key: cat.key, label: catLabel(cat.key) }); setMode("exam"); }}
                        className="w-full mt-2 py-2 min-h-[36px] rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 bg-[#15302b] text-[#22c08c]"
                      >
                        <GraduationCap size={13} />
                        עברתם את הבוחן! אפשר לגשת שוב
                      </button>
                    ) : (
                      <div className="mt-2 rounded-xl bg-[#15302b]/60 border border-[#22c08c]/40 p-2.5 space-y-2">
                        <p className="text-[11px] font-black text-[#22c08c] leading-snug">
                          אתם מכירים מספיק מ{shortCat(cat.key)} — מוכנים לבוחן?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setModeItems(cat.items); setExamCategory({ key: cat.key, label: catLabel(cat.key) }); setMode("exam"); }}
                            className="flex-1 py-2 min-h-[36px] rounded-lg font-black text-[11px] bg-[#22c08c] text-[#06231a]"
                          >
                            לבוחן {shortCat(cat.key)}
                          </button>
                          <button
                            onClick={() => startProgressive(cat.key)}
                            className="flex-1 py-2 min-h-[36px] rounded-lg font-bold text-[11px] bg-[#22252b] text-[#c4c4d4]"
                          >
                            להמשיך ללמוד
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* The menu tab is the menu: menu → category → dishes with descriptions. Read
            only, so checking a dish mid-shift never touches the waiter's score. */}
        {tab === "categories" && <MenuBrowser key={browseKey} cards={cards} onPractice={(c) => startProgressive(c)} />}

        {tab === "daily" && (
          <div className="space-y-2.5">
          {/* A waiter who lands here from a task row has no obvious way out (user,
              2026-08-20). RTL puts the first flex child on the right, which is where
              a back control belongs. */}
          <button
            onClick={() => setTab("home")}
            className="flex items-center gap-2 text-[#eef0f6] active:scale-95 transition-transform"
          >
            <span className="w-9 h-9 rounded-xl bg-[#191b1f] border border-[#22252b] flex items-center justify-center">
              <ChevronRight size={18} />
            </span>
            <span className="text-xs font-black text-[#8a8aa0]">חזרה למשימות</span>
          </button>
          <div className="bg-[#16181c] border border-[#8b5cf6]/40 rounded-2xl p-3.5 space-y-2 relative overflow-hidden">
            <span className="absolute top-0 right-0 h-full w-[3px]" style={{ background: "linear-gradient(180deg,#8b5cf6,#6d28d9)" }} />
            <p className="text-xs font-black text-[#a79bff] mb-2">עדכון יומי של המסעדה</p>
            {brief?.missing_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#f3c14b]">❌ חסרים:</span><p className="text-xs text-[#f3c14b] mt-0.5">{brief.missing_items.join(", ")}</p></div>}
            {brief?.new_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#22c08c]">⭐ חדש:</span><p className="text-xs text-[#22c08c] mt-0.5">{brief.new_items.join(", ")}</p></div>}
            {brief?.oven_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#6d5efc]">📦 מעלה:</span><p className="text-xs text-[#6d5efc] mt-0.5">{brief.oven_items.join(", ")}</p></div>}
            {brief?.notes && <div><span className="text-[11px] font-bold text-[#8a8aa0]">הערה:</span><p className="text-xs text-[#8a8aa0] mt-0.5">{brief.notes}</p></div>}
            {!brief?.missing_items?.length && !brief?.new_items?.length && !brief?.oven_items?.length && !brief?.notes && (
              <div className="text-center py-3 space-y-2">
                <p className="text-sm font-bold text-[#eef0f6]">אין כרגע עדכון יומי</p>
                <p className="text-xs text-[#8a8aa0]">אבל תמיד כדאי לנצל את הזמן לחזרה על התפריט</p>
                <button
                  onClick={() => { setModeItems(null); setMode("quick"); }}
                  className="px-5 py-2.5 min-h-[44px] rounded-lg bg-[#6d5efc] text-white text-xs font-black"
                >
                  ללמידה — 5 דקות לפני משמרת ←
                </button>
              </div>
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
            {/* Re-run the gate as practice — reading is already recorded, so this never
                touches the ack row; it exists for a waiter who wants to drill the brief. */}
            {!session?.offline && briefAck?.read_at && briefHasContent(brief) && (
              <button
                onClick={() => setGatePractice(true)}
                className="w-full py-2.5 min-h-[44px] rounded-lg bg-[#22252b] text-[#eef0f6] text-xs font-black"
              >
                לעבור שוב על העדכון היומי והשאלות
              </button>
            )}
          </div>
          </div>
        )}
              </div>

      <BottomNav tab={tab} setTab={setTab}
        hasDailyUpdate={!!(brief?.missing_items?.length || brief?.new_items?.length || brief?.oven_items?.length)} />
    </div>
  );
}

function BottomNav({ tab, setTab, hasDailyUpdate }) {
  const items = [
    // Tasks · Menu · Learning (user, 2026-08-20). "בית" was never a place — it was a
    // pile of cards; the shift checklist is what a waiter actually opens the app for.
    ["home", ListChecks, "משימות", hasDailyUpdate],
    ["categories", BookOpen, "תפריט", false],
    ["learn", GraduationCap, "תרגול ובחינה", false],
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
            <button key={t} data-tour={`nav-${t}`} onClick={() => setTab(t)} className="flex-1 flex flex-col items-center gap-1 py-1 relative transition-colors">
              {active && <div className="absolute inset-x-2 top-0 h-9 bg-white/[0.07] rounded-2xl" />}
              <div className="relative">
                <Icon size={20} strokeWidth={active ? 2.3 : 1.6} className={active ? "text-white" : "text-[#8a8aa0]"} />
                {badge && <span className="absolute -top-1 -left-1.5 w-2 h-2 rounded-full bg-[#e0315a]" />}
              </div>
              <span className={`text-[11px] font-semibold transition-colors ${active ? "text-white" : "text-[#8a8aa0]"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Sign-out with a confirmation and a 5-second cool-off (user request, 2026-08-20):
// tapping the header icon opens a confirmation whose "התנתקות" button stays LOCKED for
// five counted-down seconds — only after the timer runs out can it be pressed. Nothing
// disconnects on its own; cancel is available the whole time.
function SignOutButton({ onSignOut }) {
  const [open, setOpen] = useState(false);
  const [secs, setSecs] = useState(5);

  useEffect(() => {
    if (!open || secs <= 0) return;
    const t = setTimeout(() => setSecs((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [open, secs]);

  return (
    <>
      <button
        onClick={() => { setSecs(5); setOpen(true); }}
        title="התנתקות"
        className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]"
      >
        <LogOut size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" dir="rtl">
          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-5 w-full max-w-xs text-center space-y-3">
            <p className="text-sm font-black text-[#eef0f6]">להתנתק מהחשבון?</p>
            <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
              ההתקדמות שלכם שמורה — בכניסה הבאה פשוט מזינים שוב את הקוד והשם.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-[#22252b] text-[#eef0f6] text-xs font-black"
              >
                ביטול
              </button>
              <button
                onClick={onSignOut}
                disabled={secs > 0}
                className={`flex-1 py-2.5 min-h-[44px] rounded-xl text-xs font-black transition-colors ${
                  secs > 0 ? "bg-[#1c1e22] text-[#5a5a6e]" : "bg-[#e0315a] text-white"
                }`}
              >
                {secs > 0 ? `התנתקות (${secs})` : "התנתקות מהחשבון"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
