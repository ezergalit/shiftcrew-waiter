import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Check, X as XIcon } from "lucide-react";
import ExitExam from "./ExitExam";
import AnswerInput from "../components/AnswerInput";
import { shortCat, shuffle, ingLabel } from "./shared";
import { generate, grade, setMenuVocab, norm, toks, wMatch, describeQuestionFor } from "../lib/examEngine";
import { menuFromCards } from "../lib/examMenu";
import { buildVocab } from "../lib/examSuggest";
import { loadLearnedAlts, withLearnedAlts, judgeAnswer, saveLearnedAlts } from "../lib/examJudge";

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
function GradeDetail({ g, unit = "המלצות" }) {
  if (!g?.detail?.length && !g?.missing) return null;
  const label = (d) =>
    d.status === "ok" ? `✓ נספר${d.credited?.length ? " — " + d.credited.join(", ") : ""}${d.leftover ? " · ⚠️ יש בו גם מילה שלא במקומה" : ""}`
    : d.contradicts ? "✗ סותר את התשובה (ההפך מהאמת)"
    : d.status === "free" ? "◌ תיאור/הסבר — לא נספר ולא הוריד"
    : d.status === "wrong" ? "✗ לא עונה לבקשה — מוריד את הציון"
    : "❓ לא מזוהה — נשלח לשופט";
  const cls = (d) => d.status === "ok" ? "text-[#22c08c]" : d.status === "free" ? "text-[#8a8aa0]"
    : d.status === "unknown" ? "text-[#9b7bff]" : "text-[#f3a712]";
  return (
    <div className="space-y-1 mt-1">
      {(g.detail || []).map((d, i) => (
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

export default function OpenQuiz({ items, allItems, categoryLabel, restaurantId, onAnswer, onDone, onFinish }) {
  // The engine and the autocomplete both read the WHOLE restaurant, not this category:
  // grading needs the full vocabulary to tell a foreign word from a menu word, and the
  // suggestion pool must not narrow to the dishes being asked about.
  const fullMenu = useMemo(() => menuFromCards(allItems?.length ? allItems : items), [allItems, items]);
  const vocab = useMemo(() => buildVocab(fullMenu), [fullMenu]);

  const bank = useMemo(() => {
    setMenuVocab(fullMenu);
    return generate(fullMenu);
  }, [fullMenu]);

  // One card per dish in THIS category that the engine is willing to ask about.
  const deck = useMemo(() => {
    const inCat = new Set((items || []).filter((i) => !i.knowledge).map((i) => i.name));
    const byDish = new Map();
    for (const q of bank) {
      if (!inCat.has(q.dish)) continue;
      if (q.sit !== "describe" && q.sit !== "allergens" && q.sit !== "flavor") continue;
      const e = byDish.get(q.dish) || { dish: q.dish };
      e[q.sit] = q;
      byDish.set(q.dish, e);
    }
    const withItem = [...byDish.values()].map((e) => ({
      ...e,
      it: (items || []).find((i) => i.name === e.dish),
    })).filter((e) => e.it);
    // Recommendation/situation questions (user, 31.8): drinks get trait questions,
    // food gets "אורח אלרגי ל-X / אורחת בהריון / אוהב חריף / מחפש משהו מתוק" — and the
    // quiz composition leans on them: AT LEAST HALF of every sitting where the pool
    // allows, and never fewer than one. A pool that avoids repeating itself: questions
    // already asked on this device sink to the back until the whole pool has cycled.
    const catName = (items || []).find((i) => !i.knowledge)?.category;
    // Drink categories flip the mix (user, 31.8: «לא צריך יותר מ1-2 שאלות תיאור
    // במבחן — רוב השאלות צריכות להיות פתוחות יותר, המלץ על…»): at most 2 dish
    // cards, and recommendations fill the sitting instead.
    const drinkCat = (items || []).some((i) => i.drink);
    const recPool = catName
      ? bank.filter((q) => (q.sit === "drinkrec" || q.sit === "dishrec") && q.cat === catName)
      : [];
    let recs = [];
    if (recPool.length) {
      const seenKey = `menu-app-recasked:${restaurantId || "r"}:${catName}`;
      let seen = [];
      try { seen = JSON.parse(localStorage.getItem(seenKey)) || []; } catch { /* fresh */ }
      const fresh = shuffle(recPool.filter((q) => !seen.includes(q.dish)));
      const used = shuffle(recPool.filter((q) => seen.includes(q.dish)));
      recs = [...fresh, ...used].slice(0, drinkCat ? 6 : 4).map((q) => ({ rec: q, dish: q.ask }));
      try {
        const asked = recs.map((r) => r.rec.dish);
        const nextSeen = fresh.length >= recs.length ? [...seen, ...asked] : asked;
        localStorage.setItem(seenKey, JSON.stringify(nextSeen));
      } catch { /* private mode */ }
    }
    // The few describe cards land on the best sellers first (user, 31.8: «יותר
    // שאלות על אלון לבן, שאבלי… וכל היותר נמכרים») — the manager's ⭐ is the
    // signal; unstarred menus keep the plain shuffle.
    const dishCards = shuffle(withItem).sort((a, b) => (b.it?.isSpecial ? 1 : 0) - (a.it?.isSpecial ? 1 : 0));
    return [...dishCards.slice(0, drinkCat ? 2 : Math.max(2, 8 - recs.length)), ...recs];
  }, [bank, items, restaurantId]);

  // Phrasings previous waiters have had accepted. Loaded once and folded into the
  // questions, so tier 1 matches them for free and this sitting never pays for them again.
  const [alts, setAlts] = useState(new Map());
  useEffect(() => { loadLearnedAlts(restaurantId).then(setAlts); }, [restaurantId]);
  const [judging, setJudging] = useState(false);

  const [i, setI] = useState(0);
  const [ings, setIngs] = useState([]);
  const [alls, setAlls] = useState([]);
  const [recAns, setRecAns] = useState([]);
  const [flavs, setFlavs] = useState([]);
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
  useEffect(() => { if (started) setSecondsLeft(deck.length * SECONDS_PER_DISH); }, [started, deck.length]);
  useEffect(() => {
    if (!started || finished || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [started, finished, secondsLeft]);
  useEffect(() => { if (started && secondsLeft === 0 && !finished && scores.length) setFinished(true); }, [started, secondsLeft, finished, scores.length]);

  useEffect(() => {
    if (!finished) return;
    const avg = weightedAvg(scores);
    onFinish?.({ score: avg, passed: avg >= 70, dishCount: deck.length });
  }, [finished, scores, deck.length, onFinish]);

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

  const submit = async () => {
    const build = (key, q, answer) => ({ key, q: withLearnedAlts(q, alts), answer });
    if (cur.rec) {
      const g = grade(cur.rec, recAns);
      const parts = [{ key: "rec", q: cur.rec, answer: recAns, g }];
      const avg = LVL_SCORE[g.lvl];
      setResult({ parts, avg });
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
    let parts = [
      cur.describe && build("ings", cur.describe, ings),
      cur.flavor && build("flav", cur.flavor, flavs),
      cur.allergens && build("alls", cur.allergens, alls),
    ].filter(Boolean).map((p) => ({ ...p, g: grade(p.q, p.answer) }));

    // ⚠️ Tier 2 runs for INGREDIENTS ONLY. Allergens are a closed list of eight values whose
    // synonyms are already hard-coded in the engine, so there is no unusual phrasing left
    // for a model to adjudicate — and the only thing it could add is the chance of
    // crediting a waiter for an allergen they never named. That is a safety field, and it
    // stays deterministic.
    const needsJudge = parts.find((p) => p.key === "ings" && p.g.escalate);
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

    const avg = Math.round(parts.reduce((a, p) => a + LVL_SCORE[p.g.lvl], 0) / parts.length);
    const worst = Math.min(...parts.map((p) => p.g.lvl));
    setResult({ parts, avg });
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
    setStage2((s2) => ({ ...s2, res: g, judging: false }));
  };

  const next = () => {
    setResult(null); setIngs([]); setAlls([]); setRecAns([]); setFlavs([]); setStage2(null);
    if (i + 1 >= deck.length) setFinished(true); else setI(i + 1);
  };

  if (finished) {
    const avg = weightedAvg(scores);
    return (
      <div className="p-6 text-center space-y-4">
        <GraduationCap size={40} className={avg >= 70 ? "text-[#22c08c] mx-auto" : "text-[#f3a712] mx-auto"} />
        <p className="text-3xl font-black text-[#eef0f6]">{avg}%</p>
        <p className="text-sm font-bold text-[#8a8aa0]">
          {avg >= 70 ? "עברתם את הבוחן" : "עוד לא עברתם — כדאי לחזור על הקטגוריה"}
        </p>
        <button onClick={onDone} className="px-5 py-3 rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm">סיום</button>
      </div>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black text-[#8a8aa0]">
          {shortCat(categoryLabel)} · {i + 1}/{deck.length}
        </p>
        <p className={`text-[13px] font-black tabular-nums ${secondsLeft < 60 ? "text-[#e0315a]" : "text-[#8a8aa0]"}`}>
          {mm}:{ss}
        </p>
      </div>

      <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
        <p className="text-[11px] font-black text-[#22c08c]">{cur.rec ? "המלצה ללקוח" : "כתיבה מהזיכרון"}</p>
        <p className="text-[17px] font-black text-[#eef0f6] mt-1 leading-snug">{cur.rec ? cur.rec.ask : cur.dish}</p>
        {!cur.rec && (
          <p className="text-[12px] text-[#8a8aa0] mt-1">
            {cur.describe && cur.flavor ? "מה יש בקוקטייל, ואיך הוא בטעם?"
              : cur.describe && askAll ? "מה יש במנה, ואילו אלרגיות היא נושאת?"
              : cur.describe ? (cur.it?.drink ? "איך תתארו את המשקה?" : "מה יש במנה — מלבד מה שבשם?")
              : cur.flavor ? "איך הקוקטייל בטעם?"
              : "אילו אלרגיות המנה נושאת?"}
          </p>
        )}
      </div>

      {!result ? (
        <div className="space-y-4">
          {cur.rec && (
            <AnswerInput
              vocab={[]} values={recAns} onChange={setRecAns}
              label="ההמלצה שלך" placeholder="כתבו את שם המנה או המשקה ולחצו הוסף…"
            />
          )}
          {cur.describe && (
            <AnswerInput
              vocab={vocab} values={ings} onChange={setIngs}
              label={ingLabel(cur.it)}
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
          <button
            onClick={submit}
            disabled={judging}
            className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm disabled:opacity-60"
          >
            {judging ? "בודק…" : "שליחה"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {result.parts.map((p) => (
            <div key={p.key} className="bg-[#16181c] border border-[#22252b] rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                {p.g.lvl === 2 ? <Check size={15} className="text-[#22c08c]" /> : <XIcon size={15} className="text-[#f3a712]" />}
                <p className="text-[12px] font-black text-[#eef0f6]">
                  {p.key === "rec" ? "ההמלצה" : p.key === "flav" ? "תיאור הטעם" : p.key === "ings" ? ingLabel(cur.it) : "אלרגיות"} — {p.g.lvl === 2 ? "נכון" : p.g.lvl === 1 ? "חלקי" : "לא נכון"}
                </p>
              </div>
              <GradeDetail g={p.g} unit={p.key === "rec" ? "המלצות" : "פרטים"} />
              {/* The answer, always — a quiz that says "wrong" without saying what the
                  right answer was teaches nothing. */}
              <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
                {p.q.targets.map((t) => t.t).join(" · ")}
              </p>
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
                    <button onClick={() => setStage2(null)}
                      className="py-2.5 px-3 rounded-xl bg-[#20232b] text-[#8a8aa0] font-bold text-[12.5px]">דלג</button>
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
            onClick={next}
            className="w-full py-3 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06231a] font-black text-sm"
          >
            {i + 1 >= deck.length ? "לסיכום" : "המנה הבאה"}
          </button>
        </div>
      )}

      <ExitExam onDone={onDone} />
    </div>
  );
}
