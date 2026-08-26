import { useEffect, useState } from "react";

// The exam's "יציאה" used to leave on the first tap — one stray touch under a ticking
// clock and the attempt was gone (reviewer, 2026-08-26). Two taps, with the second one
// spelling out the price. Resets itself so an accidental first tap can't linger armed.
export default function ExitExam({ onDone }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button onClick={onDone} className="text-[11px] font-black text-[#e0315a] min-h-[44px]">
      ליציאה בלי לשמור ←
    </button>
  ) : (
    <button onClick={() => setArmed(true)} className="text-xs text-[#8a8aa0] min-h-[44px]">← יציאה</button>
  );
}
