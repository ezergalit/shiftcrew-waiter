import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");
const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => dateStr(new Date());

// A weekly task ticked on Monday must still read as done on Tuesday. The tick is always
// stored on the day it happened (`done_date`), so the PERIOD lives in the read: how far
// back a completion still counts is decided by the task's kind.
//   weekly  ⇒ since the last Sunday      monthly ⇒ since the 1st       else ⇒ today
// ⚠️ Week starts on SUNDAY, matching `weekly_scores` on both the SQL and JS side. Two
// different week boundaries inside one product is a bug that is very hard to see.
export const PERIOD_LABEL = { weekly: "משימה שבועית", monthly: "משימה חודשית" };
export function periodStart(kind, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "weekly") d.setDate(d.getDate() - d.getDay());   // getDay() 0 = Sunday
  else if (kind === "monthly") d.setDate(1);
  return dateStr(d);
}

// The shift as one numbered checklist (user, 2026-08-20).
//
// Two rules decide what appears here at all:
//   • Every task OPENS something. Tapping a row takes the waiter to the thing — the
//     brief, the cards, the exam, or the manager's own instruction — never just ticks a
//     box. A checkbox with nothing behind it measures tapping, not work.
//   • A task with no content does not exist. No brief today ⇒ no "read the brief" row;
//     no new dishes ⇒ no "learn the new dishes" row. The list is what the restaurant
//     actually sent, so an empty day is a short list rather than a wall of stale rows.
//
// Order is meaning: open tasks first in the restaurant's priority order, finished ones
// collected under a divider. The number is the priority rank, not the row position, so
// it never renumbers under the waiter's feet.
export default function TasksTab({ tasks, onDone, children }) {
  const [sheet, setSheet] = useState(null);   // manager instruction opened for reading
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (!bump) return;
    document.querySelector("[data-next-task]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [bump]);

  const open = tasks.filter((t) => !t.done);
  const shut = tasks.filter((t) => t.done);

  const Row = (t, isNext) => (
    <button
      key={t.id}
      onClick={() => (t.body ? setSheet(t) : t.onOpen?.())}
      {...(isNext ? { "data-next-task": "1" } : {})}
      className={`w-full text-right rounded-2xl flex items-center gap-3 transition-all active:scale-[0.99] ${
        t.done
          ? "bg-[#22c08c]/[0.07] border border-[#22c08c]/30 px-3 py-2"
          : isNext
            ? "bg-[#16181c] border border-[#22c08c] p-3 shadow-[0_0_0_1px_rgba(34,192,140,0.3)]"
            : "bg-[#16181c] border border-[#22252b] p-3"
      }`}
    >
      <span
        className={`flex-shrink-0 rounded-[9px] flex items-center justify-center font-black tabular-nums ${
          t.done
            ? "w-[22px] h-[22px] text-[12px] bg-[#22c08c] text-[#06231a]"
            : isNext
              ? "w-[30px] h-[30px] text-[15px] bg-[#22c08c] text-[#06231a]"
              : "w-[30px] h-[30px] text-[15px] bg-[#20232b] text-[#eef0f6]"
        }`}
      >
        {t.done ? "✓" : t.position}
      </span>
      <span className="flex-1 min-w-0">
        {/* A weekly task shown as "done" alongside daily ones is confusing unless it says
            so — the tick means "done this week", not "done today". */}
        {(isNext || t.periodLabel) && (
          <span className="flex items-center gap-1.5 mb-0.5">
            {isNext && <span className="text-[9.5px] font-black text-[#22c08c] tracking-wide">הבא בתור</span>}
            {t.periodLabel && (
              <span className="text-[9.5px] font-black text-[#8a8aa0] bg-[#20232b] rounded px-1.5 py-0.5">{t.periodLabel}</span>
            )}
          </span>
        )}
        <span className={`block font-black leading-snug ${t.done ? "text-[12px] text-[#22c08c] line-through truncate" : "text-sm text-[#eef0f6]"}`}>
          {t.title}
        </span>
        {!t.done && t.subtitle && (
          <span className="block text-[11px] text-[#8a8aa0] mt-0.5 leading-snug">{t.subtitle}</span>
        )}
      </span>
      <span className={`flex-shrink-0 font-black ${t.done ? "text-[10px] text-[#22c08c]" : "text-[11px] text-[#22c08c]"}`}>
        {t.done ? "בוצע ✓" : t.cta || "לפתיחה ←"}
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      {children}

      {tasks.length === 0 ? (
        <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-5 text-center space-y-1.5">
          <p className="text-sm font-black text-[#eef0f6]">אין משימות פתוחות היום ✨</p>
          <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
            כשהמנהל/ת ישלחו עדכון או משימה — הם יופיעו כאן.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between px-1">
            <p className="text-[15px] font-black text-[#eef0f6]">המשימות שלי היום</p>
            <p className="text-xs font-black text-[#22c08c] tabular-nums">{shut.length}/{tasks.length}</p>
          </div>
          <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mx-1">
            <div className="h-full bg-[#22c08c] transition-all" style={{ width: `${(shut.length / tasks.length) * 100}%` }} />
          </div>

          <div className="flex flex-col gap-2">
            {open.map((t, i) => Row(t, i === 0))}
            {shut.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] font-black text-[#5a5a6e] tracking-wide mt-1 mb-0.5">
                <span className="flex-1 h-px bg-[#22252b]" />
                בוצע · {shut.length}
                <span className="flex-1 h-px bg-[#22252b]" />
              </div>
            )}
            {shut.map((t) => Row(t, false))}
          </div>
        </>
      )}

      {/* A manager instruction has no screen to jump to, so tapping it opens the
          instruction itself — the full text, and only then the button that closes it. */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" dir="rtl">
          <div className="w-full max-w-md bg-[#16181c] border-t border-[#22252b] rounded-t-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#20232b] text-[#eef0f6] flex items-center justify-center font-black text-sm flex-shrink-0 tabular-nums">
                {sheet.position}
              </span>
              <p className="flex-1 text-base font-black text-[#eef0f6] leading-snug">{sheet.title}</p>
              <button onClick={() => setSheet(null)} className="text-[#8a8aa0] flex-shrink-0" aria-label="סגירה">
                <X size={18} />
              </button>
            </div>
            <p className="text-[13px] text-[#c4c4d4] leading-relaxed whitespace-pre-line">{sheet.body}</p>
            <p className="text-[10.5px] text-[#5a5a6e]">המשימה נשלחה על ידי ההנהלה</p>
            {!sheet.done ? (
              <button
                onClick={() => { onDone(sheet.id, true); setSheet(null); setBump((n) => n + 1); }}
                className="w-full py-3 min-h-[44px] rounded-xl font-black text-sm bg-[#22c08c] text-[#06231a]"
              >
                ביצעתי ✓
              </button>
            ) : (
              <button
                onClick={() => { onDone(sheet.id, false); setSheet(null); }}
                className="w-full py-3 min-h-[44px] rounded-xl font-bold text-xs bg-[#22252b] text-[#8a8aa0]"
              >
                ביטול הסימון
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The manager's own shift instructions plus today's completions for this member.
export function useShiftTasks(session) {
  const [rows, setRows] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      if (session?.offline || !session?.restaurantId) return;
      const [t, d] = await Promise.all([
        db.from("shift_tasks").select("id, title, subtitle, position, kind")
          .eq("restaurant_id", session.restaurantId).eq("active", true)
          .order("position", { ascending: true }),
        // Read back to the widest period any task could use (the 1st of the month), then
        // keep each completion only if it falls inside ITS OWN task's period.
        session.teamMemberId
          ? db.from("shift_task_done").select("task_id, done_date")
              .eq("team_member_id", session.teamMemberId)
              .gte("done_date", periodStart("monthly"))
          : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      const tasks = t.data || [];
      const kindOf = new Map(tasks.map((r) => [r.id, r.kind]));
      setRows(tasks);
      setDoneIds(new Set(
        (d.data || [])
          .filter((r) => r.done_date >= periodStart(kindOf.get(r.task_id)))
          .map((r) => r.task_id)
      ));
    })();
    return () => { alive = false; };
  }, [session]);

  const toggle = async (taskId, next) => {
    setDoneIds((prev) => {
      const s = new Set(prev);
      next ? s.add(taskId) : s.delete(taskId);
      return s;
    });
    if (session?.offline || !session?.teamMemberId) return;
    const row = { team_member_id: session.teamMemberId, task_id: taskId, done_date: todayStr() };
    const { error } = next
      ? await db.from("shift_task_done").upsert(row, { onConflict: "team_member_id,task_id,done_date" })
      : await db.from("shift_task_done").delete().match(row);
    if (error) console.error("shift_task_done", error.message, error.details, error.hint, error.code);
  };

  return { rows, doneIds, toggle };
}
