import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// The shift as one numbered checklist (user request, 2026-08-20). This replaced the old
// home screen: a waiter opening the app should see "what's left" as a number, not a wall
// of cards. Three rules make it readable:
//
//   1. The number is the restaurant's PRIORITY rank, not the row position — it never
//      renumbers under the waiter's feet when something is ticked.
//   2. Finished tasks turn green and sink below a divider instead of vanishing, so the
//      list reads "what's left" from the top and "what I did" from the bottom.
//   3. The first open task is marked "הבא בתור" and scrolled into view after each tick.
//
// The learning tasks (kind = 'learning') are ticked by the app itself from real progress —
// reading the brief, hitting the daily goal — so they can't be closed by tapping. The
// floor tasks (kind = 'shift') are the owner's own list and are tapped closed.
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TasksTab({ session, tasks, doneIds, onToggle, auto, onOpenBrief, onOpenLearning, children }) {
  const [scrollTo, setScrollTo] = useState(0);

  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector("[data-next-task]");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollTo]);

  // A learning task is done when the app says so; a shift task when the waiter ticked it.
  const isDone = (t) => (t.kind === "learning" ? !!auto[t.id] : doneIds.has(t.id));
  const open = tasks.filter((t) => !isDone(t));
  const shut = tasks.filter((t) => isDone(t));

  const act = (t) => {
    if (t.kind === "learning") {
      if (auto[t.id]) return;               // already satisfied — nothing to do
      (t.action === "brief" ? onOpenBrief : onOpenLearning)?.();
      return;
    }
    onToggle(t.id, !doneIds.has(t.id));
    setScrollTo((n) => n + 1);
  };

  const Row = (t, isNext) => {
    const done = isDone(t);
    return (
      <button
        key={t.id}
        onClick={() => act(t)}
        {...(isNext ? { "data-next-task": "1" } : {})}
        className={`w-full text-right rounded-2xl flex items-center gap-3 transition-all active:scale-[0.99] ${
          done
            ? "bg-[#22c08c]/[0.07] border border-[#22c08c]/30 px-3 py-2"
            : isNext
              ? "bg-[#16181c] border border-[#22c08c] p-3 shadow-[0_0_0_1px_rgba(34,192,140,0.3)]"
              : "bg-[#16181c] border border-[#22252b] p-3"
        }`}
      >
        <span
          className={`flex-shrink-0 rounded-[9px] flex items-center justify-center font-black tabular-nums ${
            done
              ? "w-[22px] h-[22px] text-[12px] bg-[#22c08c] text-[#06231a]"
              : isNext
                ? "w-[30px] h-[30px] text-[15px] bg-[#22c08c] text-[#06231a]"
                : "w-[30px] h-[30px] text-[15px] bg-[#20232b] text-[#eef0f6]"
          }`}
        >
          {done ? "✓" : t.position}
        </span>
        <span className="flex-1 min-w-0">
          {isNext && <span className="block text-[9.5px] font-black text-[#22c08c] tracking-wide mb-0.5">הבא בתור</span>}
          <span
            className={`block font-black leading-snug ${
              done ? "text-[12px] text-[#22c08c] line-through truncate" : "text-sm text-[#eef0f6]"
            }`}
          >
            {t.title}
          </span>
          {!done && t.subtitle && (
            <span className="block text-[11px] text-[#8a8aa0] mt-0.5 leading-snug">{t.subtitle}</span>
          )}
        </span>
        <span className={`flex-shrink-0 font-black ${done ? "text-[10px] text-[#22c08c]" : "text-[11px] text-[#22c08c]"}`}>
          {done ? "בוצע ✓" : t.kind === "learning" ? "לביצוע ←" : "סימון ✓"}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {children}

      {tasks.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-1">
            <p className="text-[15px] font-black text-[#eef0f6]">המשימות שלי היום</p>
            <p className="text-xs font-black text-[#22c08c] tabular-nums">{shut.length}/{tasks.length}</p>
          </div>
          <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mx-1">
            <div
              className="h-full bg-[#22c08c] transition-all"
              style={{ width: `${tasks.length ? (shut.length / tasks.length) * 100 : 0}%` }}
            />
          </div>

          <div className="flex flex-col gap-2">
            {open.map((t, i) => Row(t, i === 0))}
            {shut.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] font-black text-[#5a5a6e] tracking-wide mt-1 mb-0.5">
                <span className="flex-1 h-px bg-[#22252b]" />
                בוצע היום · {shut.length}
                <span className="flex-1 h-px bg-[#22252b]" />
              </div>
            )}
            {shut.map((t) => Row(t, false))}
          </div>
        </>
      )}
    </div>
  );
}

// Today's completions for this member, plus the writers. Kept beside the component
// because the shape of `shift_task_done` is this screen's business and nobody else's.
export function useShiftTasks(session) {
  const [tasks, setTasks] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      if (session?.offline || !session?.restaurantId) return;
      const [t, d] = await Promise.all([
        db.from("shift_tasks").select("id, title, subtitle, position, kind")
          .eq("restaurant_id", session.restaurantId).eq("active", true)
          .order("position", { ascending: true }),
        session.teamMemberId
          ? db.from("shift_task_done").select("task_id")
              .eq("team_member_id", session.teamMemberId).eq("done_date", todayStr())
          : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      // The first three seeded tasks are the learning ones; `action` tells the row which
      // screen to open when tapped.
      setTasks((t.data || []).map((x) => ({
        ...x,
        action: /עדכון/.test(x.title) ? "brief" : "learn",
      })));
      setDoneIds(new Set((d.data || []).map((r) => r.task_id)));
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
    if (error) console.error("shift_task_done", error);
  };

  return { tasks, doneIds, toggle };
}
