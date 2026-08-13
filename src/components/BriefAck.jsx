import { useMemo, useState } from "react";
import { Check, X, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { dishLabel } from "../lib/questionEngine";

const db = supabase.schema("menu_app");

// "I read it" + one question drawn from the brief's own content.
//
// Reading used to be recorded automatically when the app loaded, so the owner's board
// showed a ✓ for anyone who merely opened it. A button alone would be barely better —
// tapping "read" is free. The question is what makes the record mean something: it can
// only be answered by someone who actually looked at today's brief, and the answer goes
// back to the owner alongside the acknowledgement.
//
// The question is generated from the brief, never invented: the correct option is a real
// item the manager wrote, and the distractors are real dishes that are NOT on that list.
// A brief with no lists (notes only) gets a plain acknowledgement — better an honest
// "read" than a question with a made-up answer.

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

function buildQuestion(brief, cards) {
  const pools = [
    { key: "missing_items", q: "מה חסר היום במטבח?" },
    { key: "new_items", q: "על מה כדאי להמליץ היום?" },
    { key: "oven_items", q: "מה במלאי מוגבל היום?" },
  ].filter((p) => (brief?.[p.key] || []).length > 0);
  if (!pools.length) return null;

  const pool = shuffle(pools)[0];
  const listed = (brief[pool.key] || []).map((x) => String(x).trim()).filter(Boolean);
  const correct = shuffle(listed)[0];

  // Distractors: real menu items that appear nowhere in today's brief, so no option is
  // accidentally also true.
  const allListed = new Set(
    ["missing_items", "new_items", "oven_items"]
      .flatMap((k) => brief[k] || [])
      .map((x) => String(x).trim())
  );
  const others = shuffle(
    (cards || [])
      .map((c) => dishLabel(c))
      .filter((n) => n && !allListed.has(n.trim()))
  ).slice(0, 3);
  if (others.length < 2) return null;

  return { question: pool.q, correct, options: shuffle([correct, ...others]) };
}

export default function BriefAck({ brief, cards, session, ack, onAcked }) {
  const q = useMemo(() => buildQuestion(brief, cards), [brief, cards]);
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  const hasContent =
    (brief?.missing_items || []).length ||
    (brief?.new_items || []).length ||
    (brief?.oven_items || []).length ||
    brief?.notes;
  if (!hasContent) return null;

  if (ack?.read_at) {
    return (
      <div className="flex items-center gap-2 bg-[#15302b] border border-[#0d8066] rounded-lg p-3">
        <ShieldCheck size={15} className="text-[#22c08c] flex-shrink-0" />
        <p className="text-[11px] font-bold text-[#22c08c]">
          אישרת שקראת את הבריף של היום
          {ack.correct === false && " — כדאי לעבור עליו שוב"}
        </p>
      </div>
    );
  }

  const save = async (opt) => {
    if (saving) return;
    setSaving(true);
    setPicked(opt);
    const today = new Date().toISOString().slice(0, 10);
    const row = {
      team_member_id: session.teamMemberId,
      restaurant_id: session.restaurantId,
      date: today,
      read_at: new Date().toISOString(),
      question: q ? q.question : null,
      answer: opt ?? null,
      correct: q ? opt === q.correct : null,
      answered_at: new Date().toISOString(),
    };
    const { error } = await db.from("daily_brief_reads").upsert(row, { onConflict: "team_member_id,date" });
    setSaving(false);
    // Show the verdict briefly before collapsing to the confirmed state.
    setTimeout(() => onAcked({ read_at: row.read_at, correct: row.correct }), error ? 0 : 1600);
  };

  // Notes-only brief: nothing to build a fair question from, so just confirm.
  if (!q) {
    return (
      <button
        onClick={() => save(null)}
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-[#6d5efc] text-white text-xs font-black disabled:opacity-50"
      >
        {saving ? "שומר…" : "קראתי את הבריף"}
      </button>
    );
  }

  return (
    <div className="bg-[#191b1f] border border-[#22252b] rounded-lg p-3">
      <p className="text-[11px] font-black text-[#eef0f6] mb-0.5">{q.question}</p>
      <p className="text-[10px] text-[#8a8aa0] font-bold mb-2.5">
        ענו כדי לאשר שקראתם — התשובה נשלחת למנהל
      </p>
      <div className="flex flex-col gap-1.5">
        {q.options.map((opt) => {
          const isPicked = picked === opt;
          const right = picked && opt === q.correct;
          const wrong = isPicked && opt !== q.correct;
          return (
            <button
              key={opt}
              disabled={!!picked}
              onClick={() => save(opt)}
              className={`w-full py-2 px-3 rounded-lg text-[11px] font-bold text-right transition-colors ${
                right ? "bg-[#22c08c] text-white"
                  : wrong ? "bg-[#e0315a] text-white"
                  : "bg-[#16181c] text-[#c4c4d4] border border-[#22252b]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked && (
        <p className={`text-[10px] font-black mt-2 ${picked === q.correct ? "text-[#22c08c]" : "text-[#e0315a]"}`}>
          {picked === q.correct ? "✓ נכון — נרשם שקראת" : `✗ התשובה הנכונה: ${q.correct}`}
        </p>
      )}
    </div>
  );
}
