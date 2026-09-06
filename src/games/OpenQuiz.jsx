import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, Check, X as XIcon } from "lucide-react";
import ExitExam from "./ExitExam";
import AnswerInput from "../components/AnswerInput";
import { shortCat, shuffle, ingLabel } from "./shared";
import { generate, grade, setMenuVocab, norm, toks, wMatch, describeQuestionFor } from "../lib/examEngine";
import { menuFromCards } from "../lib/examMenu";
import { buildVocab } from "../lib/examSuggest";
import { loadLearnedAlts, withLearnedAlts, judgeAnswer, saveLearnedAlts, judgeLeaf } from "../lib/examJudge";
import { gradeDescription, descAskable } from "../lib/describeLeaf";
import { isSimple, simpleQuestions, gradeSimple } from "../lib/simpleDish";
import { questionStyle } from "../lib/quizBank";
import { supabase } from "../lib/supabase";
const db = supabase.schema("menu_app");
// זמן קריאה בין שאלות במבחן — לא נספר בשעון (יותם, 6.9)
const REVIEW_S = 30;
// דרגת קושי פר-מסעדה: features.exam_level = relaxed | normal | strict (יותם, 6.9)
const PASS_MARK = { relaxed: 60, normal: 70, strict: 80 };
import { buildSetQuestions, composeQuiz, nextSeen, scoreNamed, examPlan, suggestDish, resolveDish } from "../lib/quizBank";

// ── מחזור «נשאל» (יותם, 6.9: «מלצר שנכשל לא מקבל את אותו הבוחן פעם נוספת») ──
// פר-מכשיר, פר-מסעדה, פר-קטגוריה. מה שנשאל שוקע לסוף; כשהבנק כולו נראה — סבב חדש.
const seenKey = (restaurantId, cat) => `menu-app-quiz-seen:${restaurantId || "r"}:${cat}`;
const loadSeen = (restaurantId, cat) => { try { return JSON.parse(localStorage.getItem(seenKey(restaurantId, cat))) || []; } catch { return []; } };
const saveSeen = (restaurantId, cat, list) => { try { localStorage.setItem(seenKey(restaurantId, cat), JSON.stringify(list)); } catch { /* private mode */ } };

// The category quiz, answered by WRITING instead of picking (user, 29.8).
//
// ⚠️ Read the header of CategoryExam before changing this. Typed answers were tried twice
// before and failed in opposite directions: scoring by "how many real ingredients did you
// mention" let a waiter list the whole menu and score 100%, and grading a strict recall of
// the stored strings gave 13% to someone who plainly knew the dish. Both are fixed here by
// the exam engine rather than by scoring tweaks:
//   · it only ASKS about a dish with ≥3 askable ingredients, so "סוכריות קרם ברולה"
//     (whose only non-name ingredient is קולי פטל) is never asked — that was the 13% case;
//   · `minOk` is ~70% of them, so a missed detail still passes;
//   · words from the dish's own name and description are FREE — never counted as wrong;
//   · `maxInv` caps invented answers, so the shotgun collapses to partial credit.
// Verified against the live Studio menu: truth→full, truth−1→full, truth+1 wrong→full,
// truth+3 wrong→partial, 25-ingredient shotgun→partial, blank→zero.

const LVL_SCORE = [0, 50, 100];

// «תסביר לי מה חלקי בדיוק» (user, 1.9) — the engine returns a per-chip detail;
// this renders it: what counted, what didn't and why, and how much is missing.
// תווית לשורת תיאור לפי סוגה — מרכיב לפי משקל, ובלי «תיבול» על שורות שאינן מרכיבים.
// 🔴 ברמת המודול: גרסה ראשונה ישבה בתוך GradeDetail ונקראה ממסך התוצאה של OpenQuiz ⇒
// ReferenceError בכל שליחה של כרטיס תיאור במבחן (build 51). lint לא תפס — no-undef כבוי.
const rowTag = (r) => r.kind === "desc" ? "הכנה" : r.kind === "form" ? "צורה והגשה" : r.kind === "core" ? "מרכיב"
  : r.kind === "warn" ? "רגישות" : r.crit ? "בטיחות" : r.w >= 2 ? "מרכזי" : r.w < 1 ? "תיבול" : null;

// «לסכם את כל מה שהוא כן צדק בו כדי לקצר את הרשימה; לחיצה מראה במה צדק» (יותם, 6.9)
function OkSummary({ items }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-right text-[11.5px] font-bold text-[#22c08c] leading-snug">
      ✓ צדקת ב-{items.length}{items.length === 1 ? "" : ""}{open ? ":" : ` — ${items.slice(0, 3).join(" · ")}${items.length > 3 ? " …" : ""}`}{!open && <span className="text-[#5a5a6e]"> (הקש לפירוט)</span>}
      {open && <span className="block text-[#c4c4d4] font-normal mt-0.5">{items.join(" · ")}</span>}
    </button>
  );
}
function GradeDetail({ g, unit = "המלצות", nameToks = [] }) {
  if (!g?.detail?.length && !g?.missing) return null;
  // «אנשובי» על «אנשובי במלח» — זה שם המנה, לא תשובה: אומרים את זה במקום «לא נספר» סתמי
  const isName = (d) => nameToks.length > 0 && toks(d.chip).every((w) => nameToks.some((n) => wMatch(w, n)));
  const label = (d) =>
    d.status === "ok" ? `✓ נספר${d.credited?.length ? " — " + d.credited.join(", ") : ""}${d.leftover ? " · ⚠️ יש בו גם מילה שלא במקומה" : ""}`
    : d.contradicts ? "✗ סותר את התשובה (ההפך מהאמת)"
    : d.status === "free" && isName(d) ? "◌ זה שם המנה — השאלה על מה שיש בתוכה"
    : d.status === "free" ? "◌ תיאור/הסבר — לא נספר ולא הוריד"
    : d.status === "wrong" ? "✗ לא עונה לבקשה — מוריד את הציון"
    : "❓ לא מזוהה — נשלח לשופט";
  const cls = (d) => d.status === "ok" ? "text-[#22c08c]" : d.status === "free" ? "text-[#8a8aa0]"
    : d.status === "unknown" ? "text-[#9b7bff]" : "text-[#f3a712]";
  return (
    <div className="space-y-1 mt-1">
      <OkSummary items={(g.detail || []).filter((d) => d.status === "ok" && !d.leftover).map((d) => d.chip)} />
      {(g.detail || []).filter((d) => d.status !== "ok" || d.leftover).map((d, i) => (
        <p key={i} className="text-[11.5px] font-bold leading-snug">
          <span className="text-[#eef0f6]">«{d.chip}»</span>{" "}
          <span className={cls(d)}>{label(d)}</span>
        </p>
      ))}
      {g.missing > 0 && (
        <p className="text-[11.5px] font-black text-[#f3c14b]">חסרו עוד {g.missing} {unit}</p>
      )}
    </div>
  );
}
const LVL_RATING = [1, 3, 5];

// Weighted final score (user, 31.8: «שאלות כלליות צריכות להחזיק משקל כבד יותר
// בתוצאה, ככל שהיא ארוכה יותר») — a recommendation card weighs at least 2 and up
// to its minOk; a per-dish describe card weighs 1. One helper for the finish
// effect and the finish screen, so the two can never disagree.
const weightedAvg = (scores) => {
  const wsum = scores.reduce((a, s) => a + s.w, 0);
  return wsum ? Math.round(scores.reduce((a, s) => a + s.v * s.w, 0) / wsum) : 0;
};

export default function OpenQuiz({ items, allItems, categoryLabel, restaurantId, teamMemberId = null, onAnswer, onDone, onFinish, exam = null, quizOff = [], examEasy = false, examLevel = "normal" }) {
  const easy = examEasy || examLevel === "relaxed";
  const strict = examLevel === "strict";
  const passMark = PASS_MARK[examLevel] || 70;
  // The engine and the autocomplete both read the WHOLE restaurant, not this category:
  // grading needs the full vocabulary to tell a foreign word from a menu word, and the
  // suggestion pool must not narrow to the dishes being asked about.
  // ⚠️ Keyed on the SOURCE array, not on `items` — MainApp re-renders every second (study
  // clock) and passes a fresh `items` filter each time; keying on it rebuilt the whole
  // engine (and the deck below) once a second, and the exam "kept switching questions".
  const menuSrc = allItems?.length ? allItems : items;
  const fullMenu = useMemo(() => menuFromCards(menuSrc), [menuSrc]);
  const vocab = useMemo(() => buildVocab(fullMenu), [fullMenu]);

  const bank = useMemo(() => {
    setMenuVocab(fullMenu);
    return generate(fullMenu);
  }, [fullMenu]);

  // ── הרכב הבוחן (יותם, 6.9) ─────────────────────────────────────────────────
  // מנות: «60-70% מהמנות באקראי — 12 ראשונות ⇒ 7, 7 סלטים ⇒ 5, 4 ומטה ⇒ כולן».
  // כל כרטיס מנה = «תמליץ ותאר»: מרכיבים + אלרגיות (השאלה המפורקת). ועוד 1-2 שאלות-סט
  // בלי תיאור («ציין את כל הראשונות שטבעוני יכול לאכול», «לקוח רוצה דג נא ואבוקדו —
  // על מה תמליץ?») — דטרמיניסטיות, בלי שופט. מה שנשאל שוקע לסוף המחזור.
  // המבחן המלא (`exam`) = אותם כרטיסים מכל הקטגוריות, מכסה פר-קטגוריה לפי מספר המנות.
  // ⚠️ קטגוריות משקאות שומרות את הרכב 31.8 (מעט תיאור, בעיקר המלצות).
  const askedRef = useRef({});            // cat ⇒ { asked: ids, bank: ids } — נשמר בסיום
  // 🔴 Frozen for the sitting (useState initializer, not useMemo): the composition is
  // random, so any rebuild mid-sitting swaps the card under the waiter's hands. Yotam saw
  // exactly that in the full exam (6.9) — `exam={{…}}` and `items={cards.filter(…)}` are new
  // objects on every MainApp render, and a memo keyed on them rebuilt the deck every second.
  const [deck] = useState(() => {
    const food = (items || []).filter((i) => !i.knowledge);
    const byDish = new Map();
    for (const q of bank) {
      if (q.sit !== "describe" && q.sit !== "allergens" && q.sit !== "flavor") continue;
      const e = byDish.get(q.dish) || { dish: q.dish };
      e[q.sit] = q;
      byDish.set(q.dish, e);
    }
    // מנה פשוטה (יותם, 6.9: המבורגר ילדים, פסטה ילדים, בייגל…) — שואלים רק מה שרלוונטי מתוך
    // התיאור (בלקיחת ההזמנה · כמה גרם · כמה יחידות · כמה לשולחן), במקום «תמליץ ותאר»+אלרגיות
    // מנה פשוטה בלי שאלה נגזרת (בייגל שכולו ליווי) — לא נבחנת בכלל (יותם: «אף לקוח לא ישאל מה
    // יש בבייגל קולורי»); הידע עליה נכנס דרך שאלות-הסט של הקטגוריה.
    const dishCard = (it) => {
      if (isSimple(it)) { const sq = simpleQuestions(it); return sq.length ? { dish: it.name, it, simple: sq } : null; }
      const e = byDish.get(it.name); return e ? { ...e, it } : null;
    };
    const drinkCat = !exam && food.some((i) => i.drink);
    askedRef.current = {};

    // ── משקאות (לא במבחן המלא): ההרכב של 31.8 ללא שינוי ──
    if (drinkCat) {
      const withItem = food.map(dishCard).filter(Boolean);
      const catName = food[0]?.category;
      const recPool = catName ? bank.filter((q) => (q.sit === "drinkrec" || q.sit === "dishrec") && q.cat === catName) : [];
      let recs = [];
      if (recPool.length) {
        const key = `menu-app-recasked:${restaurantId || "r"}:${catName}`;
        let seen = [];
        try { seen = JSON.parse(localStorage.getItem(key)) || []; } catch { /* fresh */ }
        const fresh = shuffle(recPool.filter((q) => !seen.includes(q.dish)));
        const used = shuffle(recPool.filter((q) => seen.includes(q.dish)));
        recs = [...fresh, ...used].slice(0, 6).map((q) => ({ rec: q, dish: q.ask }));
        try {
          const asked = recs.map((r) => r.rec.dish);
          localStorage.setItem(key, JSON.stringify(fresh.length >= recs.length ? [...seen, ...asked] : asked));
        } catch { /* private mode */ }
      }
      const dishCards = shuffle(withItem).sort((a, b) => (b.it?.isSpecial ? 1 : 0) - (a.it?.isSpecial ? 1 : 0));
      return [...dishCards.slice(0, 2), ...recs];
    }

    // ── מנות: קטגוריה אחת (בוחן) או כל הקטגוריות במכסה (מבחן) ──
    const cats = exam ? [...new Set(food.filter((i) => !i.drink).map((i) => i.category))] : [food[0]?.category].filter(Boolean);
    const askable = new Map(cats.map((c) => [c, food.filter((i) => i.category === c).map(dishCard).filter(Boolean)]));
    const plan = exam ? examPlan(Object.fromEntries([...askable].map(([c, l]) => [c, l.length])), exam.total || 40) : null;
    const out = [];
    for (const cat of cats) {
      const cards = askable.get(cat) || [];
      if (!cards.length || (plan && !plan[cat])) continue;
      const catItems = food.filter((i) => i.category === cat);
      const sets = buildSetQuestions(catItems, cat, { off: quizOff });
      const pool = catItems.map((i) => i.name);
      const seen = loadSeen(restaurantId, cat);
      const { cards: picked, asked } = composeQuiz({
        dishes: cards.map((c) => ({ name: c.dish, starred: !!c.it?.isSpecial })),
        sets, seen, size: plan ? plan[cat] : null,
      });
      askedRef.current[cat] = { asked, bank: [...cards.map((c) => `dish:${c.dish}`), ...sets.map((q) => q.id)] };
      for (const c of picked) {
        if (c.kind === "dish") { const e = cards.find((x) => x.dish === c.name); if (e) out.push(e); }
        else out.push({ set: c.set, cat, pool: shuffle(pool), poolDishes: catItems });
      }
    }
    return out;
  });

  // Phrasings previous waiters have had accepted. Loaded once and folded into the
  // questions, so tier 1 matches them for free and this sitting never pays for them again.
  const [alts, setAlts] = useState(new Map());
  useEffect(() => { loadLearnedAlts(restaurantId).then(setAlts); }, [restaurantId]);
  const [judging, setJudging] = useState(false);
  // מזהה ישיבה אחד לכל מבחן — נכתב על כל תשובה ועל שורת התוצאה, כדי שהמנהל יראה בדיוק
  // את התשובות של המבחן הזה (ולא של ישיבה שכנה/נטושה באותו חלון זמן).
  const [sittingId] = useState(() => (globalThis.crypto?.randomUUID?.() || `s${Date.now()}${Math.round(performance.now())}`));

  const [i, setI] = useState(0);
  const [ings, setIngs] = useState([]);
  const [alls, setAlls] = useState([]);
  const [recAns, setRecAns] = useState([]);
  const [flavs, setFlavs] = useState([]);
  const [setSel, setSetSel] = useState([]);   // שאלת-סט: שמות המנות שנכתבו
  const [descText, setDescText] = useState(""); // מבחן: «תאר את המנה ללקוח» — פסקה חופשית
  const [simpleAns, setSimpleAns] = useState([]); // מנה פשוטה: תשובה קצרה לכל שאלה
  const [result, setResult] = useState(null);
  // שלב 2 (יותם, 1.9): בחרת משקה בשאלת המלצה ⇒ «עכשיו תאר אותו לאורח» — טקסט
  // חופשי, נבדק במצב-משפט ואם צריך עולה לשופט. {dish, q, text, res, judging}
  const [stage2, setStage2] = useState(null);
  const [scores, setScores] = useState([]);
  const [finished, setFinished] = useState(false);

  // 60s a dish: writing from memory is slower than recognising, and the previous typed
  // attempt's 25s was part of why it felt punitive.
  const SECONDS_PER_DISH = 60;
  const started = deck.length >= 2;
  const [secondsLeft, setSecondsLeft] = useState(0);
  // מבחן: מסך הסבר לפני שהשעון מתחיל (יותם, 6.9); בוחן — מתחילים מיד
  const [briefed, setBriefed] = useState(!exam);
  const [confirming, setConfirming] = useState(false);   // «אתה בטוח שאתה רוצה להתחיל?» (יותם, 6.9)
  const [startedAt, setStartedAt] = useState(null);
  const [blocked, setBlocked] = useState(null);   // null = עדיין לא ידוע · 0 = פתוח · >0 = חסום
  const [reviewLeft, setReviewLeft] = useState(REVIEW_S);
  const [reporting, setReporting] = useState(null); // {text} כשכותבים דיווח על טעות
  const [reports, setReports] = useState(0);
  const [reportedCards, setReportedCards] = useState([]);   // אינדקסים שכבר דווחו — בלי דיווח כפול
  const [aborted, setAborted] = useState(false);
  const [toast, setToast] = useState("");
  const [qStartedAt, setQStartedAt] = useState(0);
  const [elapsedQ, setElapsedQ] = useState(0);
  const total = deck.length * SECONDS_PER_DISH;
  const perQ = deck.length ? Math.round(total / deck.length) : SECONDS_PER_DISH;
  useEffect(() => { if (started) setSecondsLeft(total); }, [started, total]);
  // 3 דיווחים פתוחים ב-24 שעות ⇒ המבחן חסום למסעדה עד טיפול (יותם, 6.9)
  useEffect(() => {
    // תצוגת המנהל (preview) אין לה חבר צוות — לא נחסמת ולא מדווחת (ה-RLS ממילא דוחה)
    if (!exam || !restaurantId || !teamMemberId) return;
    // ספירה דרך RPC (SECURITY DEFINER): החסימה היא ברמת המסעדה, אבל מלצר רואה רק את
    // הדיווחים שלו — קריאה ישירה לטבלה הייתה סופרת רק אותם.
    db.rpc("exam_block_count").then(({ data, error }) => setBlocked(error ? 0 : (data || 0)));
  }, [exam, restaurantId, teamMemberId]);
  useEffect(() => {
    // השעון עומד בזמן קריאת התשובה ובזמן כתיבת דיווח — לא לוקח מזמן המבחן
    if (!started || !briefed || finished || secondsLeft <= 0 || judging || stage2?.judging || (exam && (result || reporting))) return;
    const t = setTimeout(() => { setSecondsLeft((s) => s - 1); setElapsedQ((e) => e + 1); }, 1000);
    return () => clearTimeout(t);
  }, [started, briefed, finished, secondsLeft, exam, result, reporting, judging, stage2]);
  // 30 שניות לקרוא במה טעית, ואז ממשיכים לבד (יותם, 6.9)
  useEffect(() => {
    if (!exam || !result || finished) return;
    if (reporting) return;
    if (reviewLeft <= 0) { next(); return; }
    const t = setTimeout(() => setReviewLeft((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [exam, result, finished, reviewLeft, reporting]);   // eslint-disable-line react-hooks/exhaustive-deps
  // נגמר הזמן ⇒ מסיימים, גם אם לא נענתה אף שאלה (אחרת המסך תקוע על 00:00)
  useEffect(() => { if (started && briefed && secondsLeft === 0 && !finished) setFinished(true); }, [started, briefed, secondsLeft, finished]);

  useEffect(() => {
    // 🔴 בלי השומר הזה האפקט נורה כל שנייה (onFinish הוא arrow חדש בכל רנדר של MainApp,
    // שמתרנדר כל שנייה משעון הלימוד) ⇒ שורת exam_results חדשה בכל שנייה על מסך הסיום.
    if (!finished || reportedRef.current) return;
    reportedRef.current = true;
    const avg = examAvg();
    // מה שנשאל נרשם — עבר או נכשל — כדי שהישיבה הבאה תהיה אחרת (יותם, 6.9)
    for (const [cat, { asked, bank: ids }] of Object.entries(askedRef.current)) saveSeen(restaurantId, cat, nextSeen(loadSeen(restaurantId, cat), asked, ids));
    // מבחן מלא: «עבר» נקבע ע"י המנהל בבדיקה (יותם) — נרשם false עד שהוא מאשר.
    // גם ישיבה שהופסקה בדיווחים נרשמת (עם הדיווחים) — «3 דיווחים» אינם מחיקה של מבחן כושל
    onFinish?.({ score: avg, passed: exam ? false : avg >= passMark, dishCount: deck.length, sittingId, pending: !!exam, reports, startedAt });
  }, [finished, restaurantId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // «נתקע במסך התשובה» (יותם, 6.9): במבחן המלא התוצאה ארוכה (שורות תיאור + ככה מתארים) וכפתור
  // «המנה הבאה» ירד מתחת לקצה המסך בטלפון — והשורש היה מסך בלי גלילה (early-return של MainApp
  // מחוץ למיכל הגולל). המיכל גולל עכשיו, והכפתור נגלל לתצוגה כשהתוצאה מופיעה.
  // ⚠️ מעל כל ה-early returns (חוקי hooks — פעם שביעית בפרויקט)
  const nextRef = useRef(null);
  const reportedRef = useRef(false);
  const finishedRef = useRef(false);
  useEffect(() => { finishedRef.current = finished; }, [finished]);
  // ציון הישיבה: כרטיס שלא נענה (הזמן נגמר) נספר כאפס — אחרת 5 מתוך 40 מושלמות = 100%.
  // כרטיס שדווח כטעות באפליקציה יוצא מהחישוב לגמרי (לא לטובה ולא לרעה).
  const examAvg = () => {
    const counted = scores.filter((x) => !x.excluded);
    if (!exam) return weightedAvg(counted);
    const missing = Math.max(0, deck.length - scores.length);
    return weightedAvg([...counted, ...Array.from({ length: missing }, () => ({ v: 0, w: 1 }))]);
  };
  // «כל פעולה שתבצע תישלח למנהל» — לוג של כל תשובה במבחן (fire-and-forget)
  const logAnswer = (answer, lvl) => {
    if (!exam || !teamMemberId || !restaurantId) return;
    const c = deck[i];
    db.from("exam_answers").insert({ restaurant_id: restaurantId, team_member_id: teamMemberId, sitting_id: sittingId, category: c?.cat || c?.it?.category || null,
      dish: c?.dish || c?.set?.ask?.slice(0, 120) || c?.rec?.ask?.slice(0, 120) || null, question: c?.set ? "set" : c?.rec ? "rec" : c?.simple ? "simple" : "dish",
      answer, lvl }).then(({ error }) => { if (error) console.error("exam_answers:", error.message); });
  };
  // דיווח על טעות באפליקציה (יותם, 6.9): השאלה נשלחת לבדיקה ולא נספרת — לא לטובה ולא לרעה.
  // 3 דיווחים בישיבה ⇒ «אנחנו מטפלים, אפשר להיבחן מחר» והמבחן נחסם למסעדה (טריגר ⇒ תור המפעיל).
  const sendReport = async () => {
    const text = (reporting?.text || "").trim();
    if (!text) return;
    const c = deck[i];
    const { error } = await db.from("exam_reports").insert({
      restaurant_id: restaurantId, team_member_id: teamMemberId, sitting_id: sittingId, dish: c?.dish || null,
      question: c?.set?.ask || c?.rec?.ask || (c?.simple ? c.simple.map((q) => q.ask).join(" | ") : `describe:${c?.dish}`),
      answer: result?.set ? { typed: result.set.sel } : { parts: (result?.parts || []).map((p) => ({ key: p.key, answer: p.answer ?? p.text ?? null })) },
      verdict: result?.set ? { lvl: result.set.r.lvl } : { parts: (result?.parts || []).map((p) => ({ key: p.key, lvl: p.g?.lvl, rows: p.leaf?.rows?.map((r) => [r.canonical[0], r.status]) })) },
      explanation: text.slice(0, 500),
    });
    if (error) { setToast("הדיווח לא נשלח — בדוק חיבור ונסה שוב"); console.error("exam_reports:", error.message); return; }
    // רק אחרי שהשליחה הצליחה: השאלה יוצאת מהציון
    setScores((s) => s.map((x, k) => (k === s.length - 1 ? { ...x, excluded: true } : x)));
    setReportedCards((r) => [...r, i]);
    const n = reports + 1;
    setReports(n); setReporting(null);
    if (n >= 3) { setAborted(true); setFinished(true); return; }
    setToast("הדיווח נשלח. השאלה הזו לא נספרת — לא לטובה ולא לרעה.");
    setReviewLeft(REVIEW_S);
  };
  useEffect(() => { if (result) setTimeout(() => nextRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), 50); }, [result]);

  if (!started) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm font-black text-[#eef0f6]">אין מספיק מנות לבוחן כאן</p>
        <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
          בוחן בכתיבה נבנה רק ממנות שיש בהן מספיק מרכיבים לשאול עליהם.
          <br />נסו קטגוריה אחרת, או חזרו אחרי שנשלים את פרטי המנות.
        </p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">חזרה</button>
      </div>
    );
  }

  const cur = deck[i];
  const askAll = !!cur?.allergens;
  // המבחן המלא (יותם, 6.9: «אין שאלה אחת של תיאור מנה פתוחה?»): כרטיס מנה = תיאור חופשי
  // (עלה התיאור + השופט) + אלרגיות בצ'יפים. בבחנים נשארים צ'יפי מרכיבים — אפס AI.
  // תיאור ≠ מרכיבים (יותם, 6.9): במבחן, כרטיס מנה = תיאור חופשי (נבחן על «מה המנה» — הכנה/צורה/
  // הגשה/בטיחות, עם השופט) **וגם** מרכיבים בצ'יפים **וגם** אלרגיות — שלושה פסקים נפרדים. תיאור
  // חופשי מוצג רק כשלכרטיס יש מה לבחון בו (שורות תיאור/בטיחות); אחרת צ'יפים בלבד.
  // שאלת תיאור רק כשיש מה לתאר (צורה/הכנה/עיקר במשקל ≥2, או בטיחות) — «מוגש לצד» לבדו אינו שאלה
  const openDesc = !!(exam && cur?.describe && !cur.it?.drink && descAskable(cur.it));
  // «אנשובי במלח»: השם הוא המרכיב — השאלה אומרת את זה («מעבר לאנשובי שבשם») כדי שהמלצר
  // ידע על מה עונים, ולא יקבל «לא הצלחת» על שכתב את שם המנה (יותם, 6.9)
  // ו«איך מטובלת המנה?» כשמה שנשאר מעבר לשם הוא תיבול/רוטב/קישוט («אנשובי במלח»: שמן זית, בצל,
  // צ'ילי, צלפים) — זו התשובה, ולא «מה יש בה»
  const qs = cur?.it && !cur.it.drink ? questionStyle(cur.it, cur.describe?.targets) : { nameIng: null, dressing: false };
  const nameIng = qs.nameIng;
  const beyond = nameIng ? ` — מעבר ל${nameIng} שבשם` : "";

  const submit = async () => {
    const build = (key, q, answer) => ({ key, q: withLearnedAlts(q, alts), answer });
    // שאלת-סט (ציין את כולן / המלצה מרומזת): סט מדויק, בלי שופט. בחירה שגויה יקרה מפספוס.
    if (cur.set) {
      // כתיבה חופשית (יותם, 6.9): כל שם שנכתב מפוענח למנה מהקטגוריה; לא זוהה = טעות
      const resolved = setSel.map((t) => resolveDish(cur.pool, t, cur.poolDishes));
      const r = scoreNamed(cur.set.answer, resolved, cur.set.need ?? null);
      const v = LVL_SCORE[r.lvl];
      setResult({ parts: [], set: { q: cur.set, r, sel: setSel, resolved }, avg: v });
      logAnswer({ typed: setSel, resolved }, r.lvl);
      setScores((s) => [...s, { v, w: cur.set.need || Math.max(2, cur.set.answer.length) }]);
      return;
    }
    if (cur.rec) {
      const g = grade(cur.rec, recAns);
      const parts = [{ key: "rec", q: cur.rec, answer: recAns, g }];
      const avg = LVL_SCORE[g.lvl];
      setResult({ parts, avg });
      logAnswer({ rec: recAns }, g.lvl);
      setScores((s) => [...s, { v: avg, w: Math.max(2, cur.rec.minOk || 1) }]);
      // שלב 2: זיהינו איזה משקה נבחר? מציעים לתאר אותו. רק על המלצות משקה,
      // ורק כשהתשובה זוכתה לפחות חלקית — אין טעם לתאר משהו שלא נבחר נכון.
      if (g.lvl > 0 && cur.rec.sit === "drinkrec") {
        const picked = recAns
          .map((c) => fullMenu.find((d) => d.drink && toks(d.name).length &&
            toks(c).length && toks(d.name).every((w) => toks(c).some((cwd) => wMatch(cwd, w)))
            || (d.drink && toks(c).some((cwd) => toks(d.name).some((w) => w.length >= 3 && wMatch(cwd, w)) &&
                !fullMenu.some((o) => o !== d && o.drink && toks(o.name).some((ow) => wMatch(cwd, ow)))))
            ? d : null))
          .find(Boolean);
        const q2 = picked ? describeQuestionFor(picked) : null;
        if (q2) setStage2({ dish: picked, q: withLearnedAlts(q2, alts), text: "", res: null, judging: false });
      }
      return;
    }
    if (cur.simple) {
      const parts = cur.simple.map((q, k) => ({ key: `s${k}`, sq: q, text: simpleAns[k] || "", g: gradeSimple(q, simpleAns[k] || "") }));
      const avg = Math.round(parts.reduce((a, p) => a + LVL_SCORE[p.g.lvl], 0) / parts.length);
      const worst = Math.min(...parts.map((p) => p.g.lvl));
      setResult({ parts, avg });
      logAnswer({ simple: simpleAns }, worst);
      setScores((s) => [...s, { v: avg, w: 1 }]);
      if (cur.it) onAnswer?.(cur.it.id, LVL_RATING[worst]);
      return;
    }
    if (openDesc) {
      setJudging(true);
      let leaf;
      try {
        leaf = await gradeDescription({ dish: cur.it, targets: null, text: descText, judge: judgeLeaf, easy, strict, mode: "desc" });
      } catch {
        leaf = await gradeDescription({ dish: cur.it, targets: null, text: descText, judge: null, easy, strict, mode: "desc" });   // לעולם לא נתקעים
      } finally {
        setJudging(false);
      }
      const ingQ = withLearnedAlts(cur.describe, alts);
      const parts = [
        { key: "desc", q: cur.describe, answer: [descText], g: { lvl: leaf.lvl }, leaf },
        { ...build("ings", ingQ, ings), g: grade(ingQ, ings) },
        ...(cur.allergens ? [{ ...build("alls", cur.allergens, alls), g: grade(withLearnedAlts(cur.allergens, alts), alls) }] : []),
      ];
      const avg = Math.round(parts.reduce((a, p) => a + LVL_SCORE[p.g.lvl], 0) / parts.length);
      const worst = Math.min(...parts.map((p) => p.g.lvl));
      if (finishedRef.current) return;
      setResult({ parts, avg });
      logAnswer({ desc: descText.slice(0, 1200), ings, alls }, worst);
      setScores((s) => [...s, { v: avg, w: 1 }]);
      if (cur.it) onAnswer?.(cur.it.id, LVL_RATING[worst]);
      return;
    }
    let parts = [
      cur.describe && build("ings", cur.describe, ings),
      cur.flavor && build("flav", cur.flavor, flavs),
      cur.allergens && build("alls", cur.allergens, alls),
    ].filter(Boolean).map((p) => ({ ...p, g: grade(p.q, p.answer) }));
    const logGeneric = (lvl) => logAnswer({ ings, flavs, alls }, lvl);

    // ⚠️ Tier 2 runs for INGREDIENTS ONLY — and only in the full exam (Yotam: quizzes = no AI). Allergens are a closed list of eight values whose
    // synonyms are already hard-coded in the engine, so there is no unusual phrasing left
    // for a model to adjudicate — and the only thing it could add is the chance of
    // crediting a waiter for an allergen they never named. That is a safety field, and it
    // stays deterministic.
    const needsJudge = exam ? parts.find((p) => p.key === "ings" && p.g.escalate) : null;
    if (needsJudge) {
      setJudging(true);
      // Only the chips tier 1 could not place. Sending the whole answer wastes tokens on
      // words that already matched and invites the model to "credit" them to themselves.
      const expected = needsJudge.q.targets.map((t) => t.t);
      const unmatched = needsJudge.answer.filter(
        (a) => !expected.some((t) => norm(t) === norm(a)),
      );
      const credited = unmatched.length
        ? await judgeAnswer({ ask: needsJudge.q.ask, expected, said: unmatched })
        : [];
      setJudging(false);
      if (credited.length) {
        const merged = new Map(alts);
        for (const c of credited) merged.set(c.means, [...(merged.get(c.means) || []), c.said]);
        setAlts(merged);
        saveLearnedAlts(restaurantId, credited);   // fire and forget: the verdict is already in hand
        parts = parts.map((p) => (p.key === "ings"
          ? { ...p, q: withLearnedAlts(p.q, merged), g: grade(withLearnedAlts(p.q, merged), p.answer) }
          : p));
      }
    }

    if (finishedRef.current) return;   // נגמר הזמן בזמן ההמתנה לשופט — לא רושמים תשובה למבחן שנסגר
    const avg = Math.round(parts.reduce((a, p) => a + LVL_SCORE[p.g.lvl], 0) / parts.length);
    const worst = Math.min(...parts.map((p) => p.g.lvl));
    setResult({ parts, avg });
    logGeneric(worst);
    setScores((s) => [...s, { v: avg, w: 1 }]);
    if (cur.it) onAnswer?.(cur.it.id, LVL_RATING[worst]);
  };

  // בדיקת שלב 2: מצב-משפט קודם (חינם), ורק יעדים שנשארו לא-מכוסים עם חומר זר
  // עולים לשופט — בדיוק הקסקדה של שאר הבוחן.
  const gradeStage2 = async () => {
    if (!stage2 || !stage2.text.trim()) return;
    const text = stage2.text.trim();
    let g = grade(stage2.q, [text]);
    if (g.lvl < 2 && g.escalate) {
      setStage2((s2) => ({ ...s2, judging: true }));
      const covered = new Set();
      for (const t of stage2.q.targets) if (grade({ ...stage2.q, targets: [t], minOk: 1, maxInv: 99 }, [text]).lvl === 2) covered.add(t.t);
      const expected = stage2.q.targets.map((t) => t.t).filter((t) => !covered.has(t));
      const credited = await judgeAnswer({ ask: stage2.q.ask, expected, said: [text] });
      if (credited.length) {
        const q2 = { ...stage2.q, targets: stage2.q.targets.map((t) => {
          const extra = credited.filter((c) => c.means === t.t).map((c) => c.said);
          return extra.length ? { ...t, alt: [...(t.alt || []), ...extra] } : t;
        }) };
        g = grade(q2, [text]);
        // למטמון נכנסים רק ניסוחים קצרים — משפט שלם לא יעזור לאף מלצר עתידי
        // (התאמת ההכלה דורשת את כולו), והוא רק מנפח את הטבלה.
        saveLearnedAlts(restaurantId, credited.filter((c) => toks(c.said).length <= 4));
      }
    }
    const v = LVL_SCORE[g.lvl];
    setScores((s) => [...s, { v, w: 1 }]);
    if (stage2.dish && onAnswer) onAnswer(stage2.dish.id ?? null, LVL_RATING[g.lvl]);
    setStage2((s2) => (s2 ? { ...s2, res: g, judging: false } : null));
  };

  const next = () => {
    setReviewLeft(REVIEW_S); setReporting(null); setToast(""); setElapsedQ(0); setQStartedAt(Date.now());
    setResult(null); setIngs([]); setAlls([]); setRecAns([]); setFlavs([]); setSetSel([]); setDescText(""); setSimpleAns([]); setStage2(null);
    if (i + 1 >= deck.length) setFinished(true); else setI(i + 1);
  };

  if (finished) {
    const avg = examAvg();
    if (aborted) return (
      <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] overflow-y-auto max-w-md mx-auto p-6 text-center space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="text-3xl">🛠️</p>
        <p className="text-sm font-black text-[#eef0f6]">תודה על הדיווחים</p>
        <p className="text-[12.5px] text-[#8a8aa0] leading-relaxed">אנחנו מטפלים בבעיות שדיווחת עליהן. המבחן הזה לא נספר, ותוכל להיבחן שוב מחר.</p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">סיום</button>
      </div>
    );
    // מבחן: הציון לא מוצג — «בסוף המבחן המנהל יודיע לך את התוצאה» (יותם, 6.9). בוחן — כרגיל.
    if (exam) return (
      <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] overflow-y-auto max-w-md mx-auto p-6 text-center space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <GraduationCap size={40} className="text-[#22c08c] mx-auto" />
        <p className="text-sm font-black text-[#eef0f6]">המבחן הסתיים ונשלח למנהל</p>
        <p className="text-[12.5px] text-[#8a8aa0] leading-relaxed">המנהל יעבור על התשובות ויודיע לך את התוצאה. תודה!</p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">סיום</button>
      </div>
    );
    return (
      <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] overflow-y-auto max-w-md mx-auto p-6 text-center space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <GraduationCap size={40} className={avg >= passMark ? "text-[#22c08c] mx-auto" : "text-[#f3a712] mx-auto"} />
        <p className="text-3xl font-black text-[#eef0f6]">{avg}%</p>
        <p className="text-sm font-bold text-[#8a8aa0]">
          {avg >= passMark ? "עברתם את הבוחן" : "עוד לא עברתם — כדאי לחזור על הקטגוריה"}
        </p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">סיום</button>
      </div>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const fmt = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

  if (exam && teamMemberId && blocked === null) return (
    <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] flex items-center justify-center"><p className="text-[13px] font-bold text-[#8a8aa0]">רגע…</p></div>
  );
  if (exam && blocked) return (
    <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] overflow-y-auto max-w-md mx-auto p-6 text-center space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <p className="text-3xl">🛠️</p>
      <p className="text-sm font-black text-[#eef0f6]">מבחן התפריט חסום כרגע</p>
      <p className="text-[12.5px] text-[#8a8aa0] leading-relaxed">דווחו כמה טעויות במבחן ואנחנו מטפלים בהן. אפשר להיבחן מחר.</p>
      <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">חזרה</button>
    </div>
  );
  // מסך ההסבר לפני המבחן — מילה במילה לפי יותם (6.9), עם המספרים האמיתיים של הישיבה
  if (exam && !briefed) return (
    <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] overflow-y-auto max-w-md mx-auto p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <p className="text-[11px] font-black text-[#22c08c]">מבחן תפריט</p>
      <p className="text-xl font-black text-[#eef0f6]">לפני שמתחילים</p>
      <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4 space-y-2.5 text-[13px] text-[#c4c4d4] leading-relaxed">
        <p>📍 נדרש לבצע את המבחן <b className="text-[#eef0f6]">במסעדה</b>, ולהודיע למנהל שאתה מתחיל אותו.</p>
        <p>📨 כל פעולה שתבצע במבחן נשלחת למנהל.</p>
        <p>⏱️ יש לך <b className="text-[#eef0f6]">{fmt(total)} דקות</b> ל-{deck.length} שאלות — בערך <b className="text-[#eef0f6]">{fmt(perQ)} לשאלה</b>. אם תיקח יותר על שאלה אחת, יישאר פחות לאחרות (או יותר, תלוי בעומק התשובה).</p>
        <p>📖 בין השאלות יש <b className="text-[#eef0f6]">{REVIEW_S} שניות</b> לקרוא את התשובה ובמה טעית — הזמן הזה לא נספר.</p>
        <p>🚩 מצאת טעות באפליקציה? יש כפתור דיווח עם הסבר. הדיווח לא לוקח מזמן המבחן, והשאלה לא נספרת.</p>
        <p>🪑 במבחן {deck.length} שאלות — תצטרך להיות פנוי כ-<b className="text-[#eef0f6]">{Math.ceil((total + deck.length * REVIEW_S) / 60)} דקות</b> ברצף.</p>
        <p>🏁 בסוף המבחן המנהל יודיע לך את התוצאה. בהצלחה!</p>
      </div>
      {!confirming ? (<>
        <button onClick={() => setConfirming(true)} className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">מתחילים את המבחן</button>
        <button onClick={onDone} className="w-full py-2 text-[12px] text-[#8a8aa0]">לא עכשיו</button>
      </>) : (
        <div className="rounded-2xl border border-[#f3a712]/50 bg-[#33290f]/60 p-4 space-y-3">
          <p className="text-[14px] font-black text-[#f3c14b]">אתה בטוח שאתה רוצה להתחיל?</p>
          <p className="text-[12.5px] text-[#eef0f6] leading-relaxed">אי אפשר להפסיק באמצע, והמנהל יראה באיזו שעה התחלת את המבחן.</p>
          <div className="flex gap-2">
            <button onClick={() => { const t = new Date().toISOString(); setStartedAt(t); setBriefed(true); setQStartedAt(Date.now());
              if (teamMemberId && restaurantId) db.from("exam_answers").insert({ restaurant_id: restaurantId, team_member_id: teamMemberId, sitting_id: sittingId, question: "__start__", answer: { startedAt: t }, lvl: null }).then(() => {}, () => {}); }}
              className="flex-1 py-3 min-h-[44px] rounded-xl bg-[#22c08c] text-[#06231a] font-black text-[13px]">כן, מתחיל עכשיו</button>
            <button onClick={() => setConfirming(false)} className="py-3 px-4 rounded-xl bg-[#20232b] text-[#8a8aa0] font-bold text-[13px]">חזרה</button>
          </div>
        </div>
      )}
    </div>
  );

  const overBudget = exam && !result && elapsedQ > perQ;
  return (
    <div className="h-screen pt-[calc(26px+env(safe-area-inset-top))] max-w-md mx-auto flex flex-col">
      {/* השעון: צ'יפ גדול ומודגש, ומצב «עומד» מפורש — בזמן קריאת התשובה, דיווח, ובזמן שהשופט
          בודק (יותם, 6.9: «לא רואים אותו למעלה» + «בזמן שה-AI קורא גם לא להעביר את הזמן»). */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3 flex-shrink-0">
        <p className="text-[11.5px] font-black text-[#8a8aa0] leading-snug min-w-0 flex-1 line-clamp-2">
          {shortCat(categoryLabel)}<br />{i + 1}/{deck.length}
        </p>
        {(() => {
          const paused = judging || stage2?.judging || (exam && (result || reporting));
          const tone = paused ? { bg: "#15302b", bd: "#22c08c66", fg: "#22c08c" }
            : secondsLeft < 60 ? { bg: "#3a1d22", bd: "#e0315a66", fg: "#ff8098" }
            : overBudget ? { bg: "#33290f", bd: "#f3a71266", fg: "#f3c14b" }
            : { bg: "#16181c", bd: "#22252b", fg: "#eef0f6" };
          const note = judging || stage2?.judging ? "השעון עומד — בודקים את התשובה"
            : !exam ? null
            : reporting ? "השעון עומד — דיווח"
            : result ? `השעון עומד · ${reviewLeft} שניות לקרוא`
            : overBudget ? `עברת את ${fmt(perQ)} — עברו ${fmt(elapsedQ)}` : `≈ ${fmt(perQ)} לשאלה · עברו ${fmt(elapsedQ)}`;
          return (
            <div className="rounded-2xl px-3.5 py-2 text-center min-w-[118px] flex-shrink-0" style={{ background: tone.bg, border: `1px solid ${tone.bd}` }}>
              {/* ⏸ מחוץ לרצף הספרות — אימוג'י אינו ברוחב tabular ומזיז את השעון בכל שנייה */}
              <p className={`${exam ? "text-[28px]" : "text-[15px]"} font-black leading-none flex items-center justify-center gap-1`} style={{ color: tone.fg }}>
                {paused && <span className="text-[18px] leading-none">⏸</span>}<span className="tabular-nums">{mm}:{ss}</span>
              </p>
              {note && <p className="text-[10.5px] font-bold mt-1 leading-tight" style={{ color: paused ? "#22c08c" : overBudget ? "#f3c14b" : "#9aa0ad" }}>{note}</p>}
            </div>
          );
        })()}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-4">
      {toast && <p className="text-[12px] font-bold text-[#22c08c] bg-[#15302b]/60 rounded-xl px-3 py-2">{toast}</p>}

      <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
        <p className="text-[11px] font-black text-[#22c08c]">
          {cur.set || cur.rec ? "המלצה ללקוח" : cur.simple ? "מה חשוב לדעת על המנה" : cur.it?.drink ? "כתיבה מהזיכרון" : "תמליץ ותאר"}
          {exam && cur.cat ? ` · ${shortCat(cur.cat)}` : exam && cur.it?.category ? ` · ${shortCat(cur.it.category)}` : ""}
        </p>
        <p className="text-[17px] font-black text-[#eef0f6] mt-1 leading-snug">{cur.set ? cur.set.ask : cur.rec ? cur.rec.ask : cur.dish}</p>
        {!cur.rec && !cur.set && !cur.simple && (
          <p className="text-[12px] text-[#8a8aa0] mt-1">
            {openDesc ? `תאר ללקוח את המנה ״${cur.dish}״ — מה היא, איך מכינים ואיך מגישים. אחר כך: המרכיבים${beyond} והאלרגיות, בנפרד.`
              : cur.describe && cur.flavor ? "מה יש בקוקטייל, ואיך הוא בטעם?"
              : cur.describe && qs.dressing ? `איך מטובלת המנה ״${cur.dish}״? ציין את כל מה שמתבלים ומגישים איתה${askAll ? ", ואילו אלרגיות יש בה" : ""}.`
              // צ'יפים בלבד — בלי טקסט פתוח — לא «תאר את המנה» (יותם, 6.9: «אם יש טקסט פתוח שיהיה כתוב
              // תתאר, אבל במקרים כאלו צריך רק: תאר את המרכיבים והאלרגיות של המנה»)
              : cur.describe && askAll && !cur.it?.drink ? `תאר את המרכיבים והאלרגיות של המנה ״${cur.dish}״${beyond}.`
              : cur.describe && !cur.it?.drink ? `תאר את המרכיבים של המנה ״${cur.dish}״${beyond}.`
              : cur.describe && askAll ? "מה יש במנה, ואילו אלרגיות היא נושאת?"
              : cur.describe ? (cur.it?.drink ? "איך תתארו את המשקה?" : "מה יש במנה — מלבד מה שבשם?")
              : cur.flavor ? "איך הקוקטייל בטעם?"
              : "אילו אלרגיות המנה נושאת?"}
          </p>
        )}
      </div>

      {!result ? (
        <div className="space-y-4">
          {cur.set && (
            <AnswerInput
              vocab={[]} values={setSel} onChange={setSetSel}
              suggester={(t, vals) => suggestDish(cur.pool, t).filter((n) => !vals.includes(n)).map((n) => ({ key: n, label: n }))}
              label={cur.set.need ? `${cur.set.need} מנות שתמליץ עליהן` : "המנות שתמליץ עליהן — כל מה שאתה מכיר"}
              placeholder="כתבו שם מנה ולחצו הוסף…"
            />
          )}
          {cur.rec && (
            <AnswerInput
              vocab={[]} values={recAns} onChange={setRecAns}
              label="ההמלצה שלך" placeholder="כתבו את שם המנה או המשקה ולחצו הוסף…"
            />
          )}
          {cur.simple && cur.simple.map((q, k) => (
            <div key={q.id} className="space-y-1.5">
              <p className="text-[13px] font-black text-[#eef0f6] leading-snug">{q.ask}</p>
              <input
                value={simpleAns[k] || ""}
                onChange={(e) => setSimpleAns((a) => { const n = [...a]; n[k] = e.target.value; return n; })}
                dir="rtl"
                placeholder={q.kind === "order" ? "מה שואלים או אומרים…" : q.kind === "per" ? "כמה, או אחד לכל כמה סועדים…" : "מספר…"}
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2.5 text-[16px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#22c08c]/60"
              />
            </div>
          ))}
          {openDesc && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-black text-[#8a8aa0]">תאר את המנה ללקוח — מה היא ואיך מכינים (בלי לפרט מרכיבים כאן)</p>
              <textarea
                value={descText}
                onChange={(e) => setDescText(e.target.value.slice(0, 1200))}
                maxLength={1200}
                rows={4}
                dir="rtl"
                placeholder="כמו שהיית אומר לאורח ליד השולחן…"
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2.5 text-[16px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#22c08c]/60"
              />
            </div>
          )}
          {cur.describe && (
            <AnswerInput
              vocab={vocab} values={ings} onChange={setIngs}
              label={qs.dressing ? "תיבול, רוטב ומה שמגישים איתה" : ingLabel(cur.it)}
              placeholder={cur.it?.drink ? "כתבו פרט (יבש, אדום, כשר…) ולחצו הוסף…" : "כתבו מרכיב ולחצו הוסף…"}
            />
          )}
          {cur.flavor && (
            <AnswerInput
              vocab={[]} values={flavs} onChange={setFlavs}
              label="תיאור הטעם" placeholder="מתוק, חמצמץ, מרענן… ולחצו הוסף"
            />
          )}
          {askAll && (
            <AnswerInput
              vocab={vocab} values={alls} onChange={setAlls}
              label="אלרגיות" placeholder="כתבו אלרגיה ולחצו הוסף…"
            />
          )}
          {/* «נתקע בתשובה» (יותם, 6.9): הכפתור היה מושבת בלי להגיד למה — דרש גם תיאור וגם
              צ'יפ מרכיב. עכשיו: תיאור של שתי מילים מספיק (מרכיבים חסרים = פספוס בציון, לא
              חסימה), ומה שעדיין חסר כתוב מתחת לכפתור. */}
          {(() => {
            const why = judging ? null
              : cur.set && !setSel.length ? "כתבו לפחות מנה אחת ולחצו הוסף"
              : openDesc && toks(descText).length < 2 ? "כתבו תיאור של לפחות שתי מילים"
              : cur.simple && cur.simple.some((_, k) => !(simpleAns[k] || "").trim()) ? "ענו על כל השאלות"
              : null;
            return (<>
              <button
                onClick={submit}
                disabled={judging || !!why}
                className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm disabled:opacity-60"
              >
                {judging ? "בודק את התשובה… (עד כמה שניות)" : "שליחה"}
              </button>
              {why && <p className="text-[11px] text-[#8a8aa0] text-center -mt-1">{why}</p>}
            </>);
          })()}
        </div>
      ) : reporting ? (
        /* מסך דיווח נקי: כשפותחים אותו לא רואים את התיאור והפירוט — רק מה מדווחים ועל מה. */
        <div className="space-y-3">
          <div className="bg-[#16181c] border border-[#f3a712]/40 rounded-2xl p-4 space-y-2.5">
            <p className="text-[14px] font-black text-[#f3a712]">🚩 דיווח על טעות באפליקציה</p>
            <p className="text-[12px] text-[#c4c4d4] leading-relaxed">
              על השאלה: <b className="text-[#eef0f6]">{cur.dish || cur.set?.ask || cur.rec?.ask}</b>
            </p>
            <p className="text-[11.5px] text-[#8a8aa0] leading-relaxed">מה לא נכון כאן? השאלה תישלח לבדיקה ולא תיספר — לא לטובה ולא לרעה. השעון עומד.</p>
            <textarea value={reporting.text} onChange={(e) => setReporting({ text: e.target.value.slice(0, 500) })} maxLength={500} rows={5} dir="rtl" autoFocus
              placeholder="למשל: כתבתי ״טונה״ וזה לא זיהה למרות שיש טונה במנה…"
              className="w-full bg-[#101216] border border-[#22252b] rounded-xl p-3 text-[16px] text-[#eef0f6]" />
            <div className="flex gap-2">
              <button onClick={sendReport} disabled={!reporting.text.trim()} className="flex-1 py-3 min-h-[44px] rounded-xl bg-[#f3a712] text-[#2a1d00] font-black text-[13px] disabled:opacity-60">שליחת הדיווח</button>
              <button onClick={() => setReporting(null)} className="py-3 px-4 rounded-xl bg-[#20232b] text-[#8a8aa0] font-bold text-[13px]">ביטול</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* הדיווח למעלה (יותם, 6.9) — לפני הפירוט, כדי שלא צריך לגלול כדי למצוא אותו */}
          {exam && teamMemberId && !reportedCards.includes(i) && (
            <button onClick={() => setReporting({ text: "" })}
              className="w-full py-2.5 min-h-[44px] rounded-xl border border-[#f3a712]/40 bg-[#33290f]/40 text-[12.5px] font-black text-[#f3c14b]">
              🚩 מצאת טעות באפליקציה? דווח — לא לוקח מזמן המבחן
            </button>
          )}
          {result.set && (
            <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                {result.set.r.lvl === 2 ? <Check size={15} className="text-[#22c08c]" /> : <XIcon size={15} className="text-[#f3a712]" />}
                <p className="text-[12px] font-black text-[#eef0f6]">
                  {result.set.r.lvl === 2 ? "נכון — בדיוק" : result.set.r.lvl === 1 ? "חלקי" : "לא נכון"}
                  {result.set.r.missed ? ` · פספסת ${result.set.r.missed}` : ""}{result.set.r.wrong ? ` · ${result.set.r.wrong} לא במקומן` : ""}
                </p>
              </div>
              <div className="space-y-1">
                <OkSummary items={result.set.sel.filter((_, k) => result.set.resolved[k] && result.set.q.answer.includes(result.set.resolved[k])).map((_, k, arr) => arr[k])} />
                {result.set.sel.map((typed, k) => {
                  const r = result.set.resolved[k];
                  const ok = r && result.set.q.answer.includes(r);
                  if (ok) return null;
                  return (
                    <p key={k} className="text-[11.5px] font-bold leading-snug">
                      <span className="text-[#eef0f6]">«{typed}»</span>{" "}
                      {ok ? <span className="text-[#22c08c]">✓ {r}{result.set.q.why?.[r] ? ` — ${result.set.q.why[r]}` : ""}</span>
                        : r ? <span className="text-[#e0315a]">✗ {r} — {result.set.q.why?.[r] || "לא עונה לבקשה"}</span>
                        : <span className="text-[#f3a712]">❓ לא זוהתה מנה כזו בקטגוריה</span>}
                    </p>
                  );
                })}
              </div>
              {/* התשובה תמיד — בוחן שאומר «לא נכון» בלי להגיד מה כן, לא מלמד כלום */}
              <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
                {result.set.q.need ? "מתאימות: " : "כל המתאימות: "}{result.set.q.answer.join(" · ")}
              </p>
            </div>
          )}
          {result.parts.map((p) => (
            <div key={p.key} className="bg-[#16181c] border border-[#22252b] rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                {p.g.lvl === 2 ? <Check size={15} className="text-[#22c08c]" /> : <XIcon size={15} className={p.leaf?.safety ? "text-[#e0315a]" : "text-[#f3a712]"} />}
                <p className="text-[12px] font-black text-[#eef0f6]">
                  {p.sq ? p.sq.ask : p.key === "desc" ? "התיאור" : p.key === "rec" ? "ההמלצה" : p.key === "flav" ? "תיאור הטעם" : p.key === "ings" ? ingLabel(cur.it) : "אלרגיות"} — {p.leaf?.safety ? "חסרה אזהרת בטיחות" : p.g.lvl === 2 ? "נכון" : p.g.lvl === 1 ? "חלקי" : "לא נכון"}
                </p>
              </div>
              {p.sq && (
                <div className="space-y-1">
                  {p.sq.kind === "order" && p.sq.atoms.map((a, k) => (
                    <p key={a} className="text-[11.5px] font-bold">
                      <span className={p.g.hits[k] >= 1 ? "text-[#22c08c]" : p.g.hits[k] > 0 ? "text-[#f3c14b]" : "text-[#8a8aa0]"}>{p.g.hits[k] >= 1 ? "✓" : p.g.hits[k] > 0 ? "◐" : "◌"} {a}{p.g.said?.[k]?.length ? ` — ${p.g.said[k].join(", ")}` : ""}{k === 0 && p.sq.atoms.length > 1 ? " (העיקר)" : ""}</span>
                    </p>
                  ))}
                  {p.g.note && <p className="text-[11.5px] font-bold text-[#f3c14b]">{p.g.note}</p>}
                  <p className="text-[12px] text-[#8a8aa0] leading-relaxed">התשובה: {p.sq.answerText}</p>
                </div>
              )}
              {p.leaf && (
                <div className="space-y-1">
                  <OkSummary items={p.leaf.rows.filter((r) => r.status === "ok").map((r) => r.canonical[0])} />
                  {p.leaf.rows.filter((r) => r.status !== "ok").map((r) => (
                    <p key={r.id} className="text-[11.5px] font-bold leading-snug">
                      <span className="text-[#eef0f6]">«{r.canonical[0]}»</span>{rowTag(r) && <span className="text-[#8a8aa0]"> ({rowTag(r)})</span>}{" "}
                      {r.status === "ok" ? <span className="text-[#22c08c]">✓ הוזכר{r.byJudge ? " (השופט זיהה את הניסוח)" : ""}</span>
                        : r.status === "wrong" ? <span className="text-[#e0315a]">✗ {r.crit ? "אזהרה שנשללה" : "סותר את הכרטיס"}</span>
                        : r.crit ? <span className="text-[#e0315a]">⚠️ חובה לציין — לא נאמר</span>
                        : r.kind === "warn" ? <span className="text-[#f3a712]">◌ כדאי להזהיר — לא נאמר</span>
                        : <span className="text-[#8a8aa0]">◌ לא הוזכר</span>}
                    </p>
                  ))}
                  {p.leaf.foreign.map((f, k) => (
                    <p key={k} className="text-[11.5px] font-bold text-[#f3a712]">✗ «{f.claim}» — לא במנה{f.why ? ` (${f.why})` : ""}</p>
                  ))}
                  {p.leaf.note && <p className="text-[11.5px] text-[#9b7bff] font-bold">{p.leaf.note}</p>}
                  {/* ככה מתארים אותה — התשובה תמיד, אחרת הבוחן לא מלמד */}
                  {cur.it?.desc && <p className="text-[12px] text-[#8a8aa0] leading-relaxed">ככה מתארים אותה: {cur.it.desc}</p>}
                </div>
              )}
              {!p.leaf && !p.sq && p.key === "ings" && p.g.lvl === 0 && p.g.detail?.length > 0 && p.g.detail.every((d) => d.status === "free") && (
                <p className="text-[12px] font-black text-[#f3c14b]">כתבת את שם המנה — השאלה היא מה יש בתוכה{nameIng ? ` מעבר ל${nameIng}` : ""}. הנה:</p>
              )}
              {!p.leaf && !p.sq && <GradeDetail g={p.g} unit={p.key === "rec" ? "המלצות" : "פרטים"} nameToks={p.key === "ings" ? toks(cur.dish || "") : []} />}
              {/* The answer, always — a quiz that says "wrong" without saying what the
                  right answer was teaches nothing. */}
              {!p.leaf && !p.sq && (
                <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
                  {p.q.targets.map((t) => t.t).join(" · ")}
                </p>
              )}
            </div>
          ))}
          {stage2 && (
            <div className="bg-[#15302b]/50 border border-[#22c08c]/30 rounded-xl p-3 space-y-2">
              <p className="text-[12px] font-black text-[#22c08c]">{stage2.q.ask}</p>
              {!stage2.res ? (
                <>
                  <textarea
                    value={stage2.text}
                    onChange={(e) => setStage2((s2) => ({ ...s2, text: e.target.value }))}
                    rows={2}
                    placeholder="כמו שהיית אומר לאורח ליד השולחן…"
                    className="w-full bg-[#101216] border border-[#22252b] rounded-xl p-2.5 text-[16px] text-[#eef0f6]"
                  />
                  <div className="flex gap-2">
                    <button onClick={gradeStage2} disabled={stage2.judging}
                      className="flex-1 py-2.5 min-h-[40px] rounded-xl bg-[#22c08c] text-[#06231a] font-black text-[12.5px]">
                      {stage2.judging ? "בודק…" : "בדיקת התיאור"}
                    </button>
                    <button onClick={() => setStage2(null)} disabled={stage2.judging}
                      className="py-2.5 px-3 rounded-xl bg-[#20232b] text-[#8a8aa0] font-bold text-[12.5px] disabled:opacity-50">דלג</button>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[12.5px] font-black text-[#eef0f6]">
                    {stage2.res.lvl === 2 ? "✓ תיאור מצוין" : stage2.res.lvl === 1 ? "◐ חלקי — ככה מתארים אותו:" : "✗ ככה מתארים אותו:"}
                  </p>
                  <p className="text-[12px] text-[#8a8aa0]">{stage2.q.targets.map((t) => t.t).join(" · ")}</p>
                </div>
              )}
            </div>
          )}
          <button
            ref={nextRef}
            onClick={next}
            disabled={!!stage2?.judging}
            className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm"
          >
            {i + 1 >= deck.length ? "לסיכום" : exam ? `המנה הבאה (${reviewLeft})` : "המנה הבאה"}
          </button>
        </div>
      )}

      <ExitExam onDone={onDone} />
      </div>
    </div>
  );
}
