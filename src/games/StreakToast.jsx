// "🔥 N ברצף" — a one-shot toast that pops when an in-round streak hits a milestone.
//
// Fires at 3 and every correct answer after it, keyed by the streak value so each
// milestone replays the pop animation once and fades on its own (no timers to clean up —
// the CSS animation ends with opacity 0 and `forwards` keeps it there).
//
// In-round only, on purpose: it resets with the round and never touches the persistent
// leaderboard streak, which counts days.
export default function StreakToast({ streak }) {
  if (streak < 3) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 flex justify-center z-40" dir="rtl">
      <span
        key={streak}
        className="animate-streak bg-[#33290f] border border-[#f3a712] text-[#f3c14b] font-black text-sm px-4 py-2 rounded-full shadow-lg"
      >
        🔥 {streak} ברצף!
      </span>
    </div>
  );
}
