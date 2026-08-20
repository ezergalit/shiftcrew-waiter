import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "../lib/supabase";
import { dishLabel } from "../lib/questionEngine";

const db = supabase.schema("menu_app");

// "עדכון יומי של המסעדה" — the daily-brief gate (approved demo, 2026-08-19).
//
// On the first entry of the day the brief takes over the screen: read it, then answer up
// to three questions built from its own content. A wrong answer sends the waiter back to
// the brief text and locks the questions for COOLDOWN_S seconds — reading again is the
// point, not punishment. Passing writes the daily_brief_reads row (same row BriefAck used
// to write), so the owner's read-board keeps working unchanged.
//
// Question rules follow BriefAck: the correct option is a real item the manager wrote,
// distractors are real dishes that appear NOWHERE in today's brief (so no option is
// accidentally also true), and a notes-only brief gets a plain acknowledgement instead of
// an invented question.
//
// Three fixed orderings ("versions") of both the questions and the answers, assigned by
// hash(member+date) % 3 — stable for the waiter all day, different between waiters, so
// answers can't just be passed along the bar.

const COOLDOWN_S = 15;

const POOLS = [
  { key: "missing_items", q: "מה חסר היום במטבח?" },
  { key: "new_items", q: "על מה כדאי להמליץ היום?" },
  { key: "oven_items", q: "מה במלאי מוגבל היום?" },
];

const VARIANTS = [
  { name: "א", order: [0, 1, 2], optShift: 0 },
  { name: "ב", order: [1, 2, 0], optShift: 1 },
  { name: "ג", order: [2, 0, 1], optShift: 2 },
];

const hashStr = (s) => {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

export const briefHasContent = (brief) =>
  !!((brief?.missing_items || []).length || (brief?.new_items || []).length ||
     (brief?.oven_items || []).length || brief?.notes);

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

function buildQuestions(brief, cards, variant) {
  // Every dish name mentioned anywhere in today's brief — none of these may be a distractor.
  const allListed = new Set(
    POOLS.flatMap((p) => brief?.[p.key] || []).map((x) => String(x).trim())
  );
  const distractorPool = (cards || [])
    .map((c) => dishLabel(c))
    .filter((n) => n && !allListed.has(n.trim()));

  const qs = [];
  for (const idx of variant.order) {
    const pool = POOLS[idx];
    const listed = (brief?.[pool.key] || []).map((x) => String(x).trim()).filter(Boolean);
    if (!listed.length) continue;
    const correct = shuffle(listed)[0];
    const others = shuffle(distractorPool).slice(0, 2);
    if (others.length < 2) continue;
    // Deterministic option order per variant (not a shuffle): rotate so each version
    // places the correct answer somewhere else.
    const base = [correct, ...others];
    const opts = base.map((_, k) => base[(k + variant.optShift) % base.length]);
    qs.push({ question: pool.q, correct, options: opts });
  }
  return qs;
}

export default function BriefGate({ brief, cards, session, practice = false, onPassed, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const variant = useMemo(
    () => VARIANTS[hashStr(`${session?.teamMemberId}${today}`) % VARIANTS.length],
    [session?.teamMemberId, today]
  );
  const questions = useMemo(() => buildQuestions(brief, cards, variant), [brief, cards, variant]);

  const [stage, setStage] = useState("read"); // read | quiz
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const startCooldown = () => {
    setCooldown(COOLDOWN_S);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const finish = async () => {
    if (practice) { onClose?.(); return; }
    if (saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const row = {
      team_member_id: session.teamMemberId,
      restaurant_id: session.restaurantId,
      date: today,
      read_at: now,
      question: questions.length ? `עדכון יומי של המסעדה — ${questions.length} שאלות (גרסה ${variant.name})` : null,
      answer: questions.length ? "ענו נכון על כל השאלות" : null,
      correct: questions.length ? true : null,
      answered_at: now,
    };
    const { error } = await db.from("daily_brief_reads").upsert(row, { onConflict: "team_member_id,date" });
    setSaving(false);
    // Even on a write error, let the waiter in — the gate must never brick the app; the
    // owner just won't see the ✓ until the next successful day.
    if (error) console.error("brief gate ack failed", error);
    onPassed?.({ read_at: row.read_at, correct: row.correct });
  };

  const answer = (opt) => {
    if (picked) return;
    setPicked(opt);
    const right = opt === questions[qIdx].correct;
    setTimeout(() => {
      setPicked(null);
      if (right) {
        if (qIdx + 1 < questions.length) setQIdx(qIdx + 1);
        else finish();
      } else {
        setStage("read");
        setQIdx(0);
        startCooldown();
      }
    }, right ? 550 : 900);
  };

  const rows = [
    { label: "חסר היום", color: "#f3c14b", items: brief?.missing_items },
    { label: "ממליצים על", color: "#22c08c", items: brief?.new_items },
    { label: "מלאי מוגבל", color: "#6d5efc", items: brief?.oven_items },
  ].filter((r) => (r.items || []).length > 0);

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6] px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]" dir="rtl">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-bold tracking-widest text-[#8a8aa0]">עדכון יומי של המסעדה</p>
        {practice && (
          <button onClick={onClose} className="text-xs text-[#8a8aa0] min-h-[44px] px-1">✕ סגירה</button>
        )}
      </div>

      {stage === "read" && (
        <>
          <p className="text-lg font-black flex items-center gap-2 mb-2">
            <ClipboardList size={18} className="text-[#6d5efc]" /> לפני שמתחילים — מה קורה היום
          </p>
          <div className="flex-1 overflow-y-auto">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-3 items-baseline py-2.5 border-b border-[#22252b] text-sm">
                <span className="flex-shrink-0 w-[76px] text-[11px] font-bold" style={{ color: r.color }}>{r.label}</span>
                <span className="text-[#eef0f6]">{(r.items || []).join(", ")}</span>
              </div>
            ))}
            {brief?.notes && (
              <div className="flex gap-3 items-baseline py-2.5 border-b border-[#22252b] text-sm">
                <span className="flex-shrink-0 w-[76px] text-[11px] font-bold text-[#8a8aa0]">הערה</span>
                <span className="text-[#c4c4d4]">{brief.notes}</span>
              </div>
            )}
          </div>
          {cooldown > 0 && (
            <p className="text-center text-xs font-black text-[#f3a712] mb-2">
              טעיתם — קראו שוב את העדכון · אפשר לנסות בעוד {cooldown} שניות
            </p>
          )}
          {questions.length ? (
            <button
              disabled={cooldown > 0}
              onClick={() => { setQIdx(0); setStage("quiz"); }}
              className="w-full py-3.5 min-h-[48px] rounded-xl bg-[#6d5efc] text-white text-sm font-black disabled:opacity-40"
            >
              קראתי — לשאלות
            </button>
          ) : (
            // Notes-only brief: nothing to build a fair question from, so just confirm.
            <button
              disabled={saving}
              onClick={finish}
              className="w-full py-3.5 min-h-[48px] rounded-xl bg-[#6d5efc] text-white text-sm font-black disabled:opacity-50"
            >
              {saving ? "שומר…" : "קראתי את העדכון"}
            </button>
          )}
        </>
      )}

      {stage === "quiz" && questions[qIdx] && (
        <>
          <p className="text-[11px] text-[#8a8aa0] mb-1">
            אישור הבנה · גרסה {variant.name} · שאלה {qIdx + 1} מתוך {questions.length}
          </p>
          <p className="text-lg font-black mb-3">{questions[qIdx].question}</p>
          <div className="flex flex-col gap-2">
            {questions[qIdx].options.map((opt) => {
              const isPicked = picked === opt;
              const right = picked && opt === questions[qIdx].correct;
              const wrong = isPicked && opt !== questions[qIdx].correct;
              return (
                <button
                  key={opt}
                  disabled={!!picked}
                  onClick={() => answer(opt)}
                  className={`w-full py-3 px-4 min-h-[48px] rounded-xl text-sm font-bold text-right border transition-colors ${
                    right ? "border-[#22c08c] text-[#22c08c] bg-[#15302b]"
                      : wrong ? "border-[#e0315a] text-[#e0315a] bg-[#3a1d22]"
                      : "bg-[#16181c] text-[#eef0f6] border-[#22252b]"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <p className="text-center text-[11px] text-[#5a5a6e]">
            טעות מחזירה לעדכון ונועלת ל-{COOLDOWN_S} שניות
          </p>
        </>
      )}
    </div>
  );
}
