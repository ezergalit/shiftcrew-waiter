import { ClipboardList, AlertTriangle, Sparkles, Package, MessageSquare, ArrowLeft, BookOpen } from "lucide-react";

// The pre-shift briefing, as a manager would actually give it.
//
// It used to be two small conditional cards buried under the daily challenge, which meant
// that on a day with nothing to report the waiter saw *nothing* — and a briefing you only
// notice when it has content is not a briefing, it is an alert. This card is always on the
// home screen, at the top, at the same size, and says "no new updates" out loud on a quiet
// day. That is the habit being trained: check the brief every shift.

const SECTIONS = [
  { key: "missing_items", label: "חסרים במטבח", icon: AlertTriangle, color: "#e0315a", bg: "#3a1d22" },
  { key: "new_items", label: "חדש היום", icon: Sparkles, color: "#22c08c", bg: "#15302b" },
  { key: "oven_items", label: "במלאי מוגבל", icon: Package, color: "#6d5efc", bg: "#241f4d" },
];

export default function ShiftBrief({ brief, newDishes = [], onStudyNew }) {
  const filled = SECTIONS.filter((s) => (brief?.[s.key] || []).length > 0);
  const hasNotes = !!brief?.notes;
  const isEmpty = filled.length === 0 && !hasNotes;

  // Group unlearned new dishes by category so the prompt reads like a manager's question
  // ("have you learned the new cocktail menu?") rather than a list of 12 dish names.
  const byCategory = newDishes.reduce((acc, d) => {
    const c = (d.category || "").split(/\s*[—–]\s*/)[0].trim() || "התפריט";
    (acc[c] = acc[c] || []).push(d);
    return acc;
  }, {});
  const categories = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-3">
      {/* New-menu prompt sits ABOVE the brief: it is the one thing that changes what the
          waiter has to go learn right now. */}
      {categories.length > 0 && (
        <div className="bg-gradient-to-l from-[#241f4d] to-[#16181c] border border-[#6d5efc] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={14} className="text-[#a79bff]" />
            <p className="text-xs font-black text-[#a79bff]">חדש בתפריט</p>
          </div>
          {categories.map(([cat, dishes]) => (
            <p key={cat} className="text-sm font-black text-[#eef0f6] mb-1 leading-snug">
              {dishes.length >= 3
                ? `כבר למדת את תפריט ${cat} החדש?`
                : dishes.length === 1
                  ? `נוספה מנה חדשה ב${cat} — כבר למדת אותה?`
                  : `נוספו ${dishes.length} מנות חדשות ב${cat} — כבר למדת אותן?`}
            </p>
          ))}
          <p className="text-[10px] text-[#8a8aa0] font-bold mb-3">
            {newDishes.length} מנות שעוד לא למדת
          </p>
          <button
            onClick={onStudyNew}
            className="w-full py-2.5 rounded-lg bg-[#6d5efc] text-white text-xs font-black flex items-center justify-center gap-1.5"
          >
            <BookOpen size={13} /> ללמוד עכשיו <ArrowLeft size={13} />
          </button>
        </div>
      )}

      <div className={`rounded-xl p-4 border ${isEmpty ? "bg-[#16181c] border-[#22252b]" : "bg-[#16181c] border-[#f3c14b]/50"}`}>
        <div className="flex items-center gap-1.5 mb-3">
          <ClipboardList size={15} className="text-[#f3c14b]" />
          <p className="text-sm font-black text-[#eef0f6]">הבריף של היום</p>
          <span className="flex-1" />
          <span className="text-[10px] font-bold text-[#8a8aa0]">
            {new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" })}
          </span>
        </div>

        {isEmpty ? (
          // Said out loud on purpose. Silence is ambiguous — it could mean "nothing to
          // report" or "the manager hasn't written it yet".
          <div className="text-center py-4">
            <p className="text-sm font-black text-[#8a8aa0] mb-1">אין עדכונים חדשים</p>
            <p className="text-[11px] text-[#5a5a6e]">הכל כרגיל — משמרת טובה!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filled.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="rounded-lg p-2.5" style={{ background: s.bg }}>
                  <div className="flex items-center gap-1 mb-1">
                    <Icon size={11} style={{ color: s.color }} />
                    <p className="text-[10px] font-black" style={{ color: s.color }}>{s.label}</p>
                  </div>
                  <p className="text-xs font-bold leading-relaxed" style={{ color: s.color }}>
                    {(brief[s.key] || []).join(" · ")}
                  </p>
                </div>
              );
            })}
            {hasNotes && (
              <div className="rounded-lg p-2.5 bg-[#191b1f] border border-[#22252b]">
                <div className="flex items-center gap-1 mb-1">
                  <MessageSquare size={11} className="text-[#8a8aa0]" />
                  <p className="text-[10px] font-black text-[#8a8aa0]">הודעה מהמנהל</p>
                </div>
                <p className="text-xs text-[#c4c4d4] leading-relaxed">{brief.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
