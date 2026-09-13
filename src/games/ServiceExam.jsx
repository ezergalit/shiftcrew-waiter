import { useState, useMemo, useRef, useEffect } from "react";
import { GraduationCap, ShieldAlert } from "lucide-react";
import ServiceQuestion from "./ServiceQuestion";
import { gradeExam, examSeconds, examLength, DEFAULT_PASS } from "../lib/serviceExam";
import { gz } from "../lib/shiftChoice";

// The runner for both בוחן שירות (one section) and המבחן הסופי (menu + service, many
// sections). ONE component on purpose — the moment each had its own copy they graded the
// same question differently, and an app that scores one way in practice and another in the
// exam reads as arbitrary.
//
// The parent builds the sections (serviceExam.js) and owns the questions; this only runs
// them, keeps score per section, and reports.

export default function ServiceExam({
  sections: initial, title = "מבחן השירות", passMark = DEFAULT_PASS,
  onAnswer, onDone, onFinish,
}) {
  // Frozen for the whole sitting. The rebuild-mid-round bug has already been paid for twice
  // in this app (gameItems, studySession) — a deck that changes under the waiter's hands.
  const sections = useMemo(() => initial, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(
    () => sections.flatMap((s, si) => s.questions.map((q, qi) => ({ q, si, qi }))),
    [sections],
  );

  const [i, setI] = useState(0);
  const [scores, setScores] = useState(() => sections.map(() => 0));
  const [done, setDone] = useState(false);

  const total = flat.length;
  const current = flat[i];

  // Reported once. StrictMode runs effects twice and the result screen re-renders, so
  // without the ref the row is written more than once (QUESTION-QUALITY.md, code error B).
  const reportedRef = useRef(false);
  const result = useMemo(
    () => gradeExam(sections.map((s, si) => ({ ...s, correct: scores[si] })), passMark),
    [sections, scores, passMark],
  );
  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    onFinish?.(result);
  }, [done, result, onFinish]);

  if (!total)
    return (
      <Shell title={title} onDone={onDone}>
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <div className="space-y-3">
            <p className="text-sm font-black">אין מספיק חומר למבחן</p>
            <p className="text-[12px] text-[#8a8aa0] leading-relaxed">
              המבחן נבנה מהתפריט של המסעדה ומסטנדרט השירות. ככל שיש בהם יותר פרטים — המבחן שלם יותר.
            </p>
            <button onClick={onDone} className="px-5 py-3 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06251c] font-black text-sm">חזרה</button>
          </div>
        </div>
      </Shell>
    );

  if (done) return <Result result={result} title={title} passMark={passMark} onDone={onDone} />;

  const graded = (ok) => {
    setScores((prev) => { const n = [...prev]; if (ok) n[current.si] += 1; return n; });
    // Menu questions carry the dish they are about, so the exam feeds the same progress map
    // as everything else. Service questions have no dish and simply do not report.
    if (current.q.subjectId) onAnswer?.(current.q.subjectId, ok ? 5 : 2);
  };

  return (
    <Shell title={title} onDone={onDone}>
      <ServiceQuestion
        key={i}
        q={current.q}
        index={i}
        total={total}
        sectionTitle={sections[current.si].title}
        onGraded={graded}
        onNext={() => (i + 1 >= total ? setDone(true) : setI(i + 1))}
      />
    </Shell>
  );
}

function Shell({ title, onDone, children }) {
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">← יציאה</button>
        <p className="text-xs font-bold truncate px-2">{title}</p>
        <span className="w-12" />
      </div>
      {children}
    </div>
  );
}

// ── The result ────────────────────────────────────────────────────────────────────────
// ⚠️ The per-section breakdown IS the feature. A single "72%" cannot tell an owner whether
// this person is steady everywhere or excellent everywhere and blank on allergies, and only
// one of those can be put on the floor tonight.
function Result({ result, title, passMark, onDone }) {
  const { score, passed, correct, asked, bySection, blockedBy, weakest } = result;
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center ${passed ? "bg-[#15302b]" : "bg-[#3a1d22]"}`}>
            <GraduationCap size={38} className={passed ? "text-[#22c08c]" : "text-[#e0315a]"} />
          </div>
          <div>
            <p className="text-4xl font-black">{score}%</p>
            <p className="text-sm font-bold text-[#8a8aa0] mt-1">{title} · {correct}/{asked}</p>
          </div>
        </div>

        {/* A pass blocked by the safety floor must say so in those words. "You scored 88% and
            failed" with no reason is the kind of result that makes people distrust the app. */}
        {blockedBy.length > 0 ? (
          <div className="rounded-2xl bg-[#3a1d22] border border-[#e0315a]/50 p-3.5 flex gap-2.5">
            <ShieldAlert size={18} className="text-[#e0315a] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-black text-[#e0315a]">לא עברת — {blockedBy.join(" · ")}</p>
              <p className="text-[12px] text-[#eef0f6] mt-1 leading-relaxed">
                בקטגוריה הזו נדרשות כל התשובות. אלרגיה היא הדבר היחיד בתפריט שיכול לשלוח אורח לבית חולים,
                ולכן ציון טוב בשאר המבחן לא מכסה עליה. אפשר לגשת שוב מיד, בלי הגבלה.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#c4c4d4] text-center leading-relaxed">
            {passed
              ? gz("עברת. אפשר לסמוך עליך מול אורח — גם כשיש הגבלה או תלונה.")
              : gz(`צריך ${passMark}% כדי לעבור. עוד סבב תרגול ואפשר לגשת שוב — אין הגבלה על מספר הניסיונות.`)}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-black text-[#8a8aa0]">לפי קטגוריה</p>
          {bySection.map((s) => {
            const tone = s.belowFloor ? "#e0315a" : s.pct >= passMark ? "#22c08c" : "#f3c14b";
            return (
              <div key={s.key} className="rounded-xl bg-[#16181c] border border-[#22252b] p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold flex items-center gap-1.5">
                    {s.floor != null && <ShieldAlert size={13} className="text-[#e0315a]" />}
                    {s.title}
                  </span>
                  <span className="text-[12px] font-black tabular-nums" style={{ color: tone }}>
                    {s.correct}/{s.total} · {s.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#22252b] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: tone }} />
                </div>
                {s.floor != null && (
                  <p className="text-[10.5px] text-[#8a8aa0]">נדרשות כל התשובות בקטגוריה הזו</p>
                )}
              </div>
            );
          })}
        </div>

        {/* One actionable line. "Go over X" is something a waiter can do before the shift;
            "72%" is not. */}
        {weakest && weakest.pct < 100 && (
          <div className="rounded-xl bg-[#16181c] border border-[#22252b] p-3">
            <p className="text-[12px] text-[#c4c4d4] leading-relaxed">
              הכי כדאי לחזור על <span className="font-black text-[#eef0f6]">{weakest.title}</span> — שם היה הציון הנמוך ביותר.
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 flex-shrink-0">
        <button onClick={onDone} className="w-full py-3.5 min-h-[44px] rounded-2xl bg-[#22c08c] text-[#06251c] font-black text-sm">סיום</button>
      </div>
    </div>
  );
}

export { examSeconds, examLength };
