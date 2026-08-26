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

  // Two lists, not one (user, 2026-08-20). "לקרוא את העדכון" and "לספור את הבר" are
  // things this shift needs; "ללמוד ראשונות" is not tied to a day at all. Mixing them
  // made one numbered list whose numbers meant nothing.
  const GROUPS = [
    { key: "daily", title: "משימות היום", hint: "העדכון היומי ומשימות המשמרת" },
    { key: "general", title: "משימות כלליות", hint: "למידת התפריט ותרגול" },
  ];

  // Display order, flattened: daily first, then general — the same order the rows are
  // rendered in, so "the next task" means the next one the waiter can see.
  const openInOrder = ["daily", "general"].flatMap((g) =>
    tasks.filter((t) => (t.group || "daily") === g && !t.done)
  );

  // Finishing a task opens the next one (user, 2026-08-20). A checklist that dumps you
  // back to the list after every item makes you re-find your place; here the shift just
  // keeps moving. A task with its own screen (the brief, the cards) opens that screen;
  // a manager instruction opens its sheet.
  const openTask = (t) => {
    if (!t) { setSheet(null); return; }
    if (t.body) setSheet(t);
    else { setSheet(null); t.onOpen?.(); }
  };

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
        {t.done ? "✓" : t.rank}
      </span>
      <span className="flex-1 min-w-0">
        {/* A weekly task shown as "done" alongside daily ones is confusing unless it says
            so — the tick means "done this week", not "done today". */}
        {(isNext || t.periodLabel || t.todayOnly) && (
          <span className="flex items-center gap-1.5 mb-0.5">
            {isNext && <span className="text-[9.5px] font-black text-[#22c08c] tracking-wide">הבא בתור</span>}
            {t.periodLabel && (
              <span className="text-[9.5px] font-black text-[#8a8aa0] bg-[#20232b] rounded px-1.5 py-0.5">{t.periodLabel}</span>
            )}
            {t.todayOnly && (
              <span className="text-[9.5px] font-black text-[#f3a712] bg-[#33290f] rounded px-1.5 py-0.5">להיום בלבד</span>
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
        {t.done ? "בוצע ✓" : t.cta || "לפרטים ←"}
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
          {GROUPS.map((g, gi) => {
            const mine = tasks.filter((t) => (t.group || "daily") === g.key);
            if (!mine.length) return null;
            const open = mine.filter((t) => !t.done);
            const shut = mine.filter((t) => t.done);
            // ⚠️ The number is the CURRENT place in the queue, not a fixed id (user,
            // 2026-08-20): finish #3 and the old #4 becomes the new #3. Recomputed from
            // `open` on every render, so it can never drift from what is on screen.
            const ranked = open.map((t, i) => ({ ...t, rank: i + 1 }));
            // "הבא בתור" marks one task in the whole screen — the first open daily one,
            // or the first general one on a day with no daily work left.
            const firstOpenGroup = GROUPS.find((x) => tasks.some((t) => (t.group || "daily") === x.key && !t.done));
            return (
              <div key={g.key} className={`space-y-2 ${gi ? "pt-1" : ""}`}>
                <div className="flex items-baseline justify-between px-1">
                  <p className="text-[15px] font-black text-[#eef0f6]">{g.title}</p>
                  <p className="text-xs font-black text-[#22c08c] tabular-nums">{shut.length}/{mine.length}</p>
                </div>
                <p className="text-[10.5px] text-[#5a5a6e] px-1 -mt-1">{g.hint}</p>
                <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mx-1">
                  <div className="h-full bg-[#22c08c] transition-all" style={{ width: `${(shut.length / mine.length) * 100}%` }} />
                </div>
                {open.length === 0 ? (
                  <p className="text-[11px] text-[#22c08c] font-bold px-1">הכל בוצע כאן ✓</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {ranked.map((t, i) => Row(t, i === 0 && firstOpenGroup?.key === g.key))}
                  </div>
                )}
              </div>
            );
          })}
          {/* ONE done pile, at the very bottom of the whole screen (user, 2026-08-20) —
              finished rows must not sit between the shift tasks and the learning tasks.
              The list above is only what's left to do; this is the receipt. */}
          {tasks.some((t) => t.done) && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2 text-[10px] font-black text-[#5a5a6e] tracking-wide">
                <span className="flex-1 h-px bg-[#22252b]" />
                בוצע היום · {tasks.filter((t) => t.done).length}
                <span className="flex-1 h-px bg-[#22252b]" />
              </div>
              {tasks.filter((t) => t.done).map((t) => Row(t, false))}
            </div>
          )}
        </>
      )}

      {/* A manager instruction has no screen to jump to, so tapping it opens the
          instruction itself — the full text, and only then the button that closes it. */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" dir="rtl">
          <div className="w-full max-w-md bg-[#16181c] border-t border-[#22252b] rounded-t-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#20232b] text-[#eef0f6] flex items-center justify-center font-black text-sm flex-shrink-0 tabular-nums">
                {sheet.done ? "✓" : sheet.rank}
              </span>
              <p className="flex-1 text-base font-black text-[#eef0f6] leading-snug">{sheet.title}</p>
              <button onClick={() => setSheet(null)} className="text-[#8a8aa0] flex-shrink-0" aria-label="סגירה">
                <X size={18} />
              </button>
            </div>
            {sheet.body?.trim() !== sheet.title?.trim() && (
              <p className="text-[13px] text-[#c4c4d4] leading-relaxed whitespace-pre-line">{sheet.body}</p>
            )}
            <p className="text-[10.5px] text-[#5a5a6e]">המשימה נשלחה על ידי המנהל/ת</p>
            {!sheet.done ? (
              <button
                onClick={() => {
                  onDone(sheet.id, true);
                  setBump((n) => n + 1);
                  // The just-finished task is still `open` in this render's props, so
                  // skip it explicitly rather than trusting the list to have updated.
                  openTask(openInOrder.find((t) => t.id !== sheet.id));
                }}
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
        // expires_on (owner side, 2026-08-20): a task the manager added "for today
        // only". Expired rows stay in the table as history — filtered here, not deleted.
        db.from("shift_tasks").select("id, title, subtitle, position, kind, role, expires_on")
          .eq("restaurant_id", session.restaurantId).eq("active", true)
          .or(`expires_on.is.null,expires_on.gte.${todayStr()}`)
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
