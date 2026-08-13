import { ClipboardList, AlertTriangle, Sparkles, Package, MessageSquare, ArrowLeft, Check } from "lucide-react";

// The pre-shift block: the briefing first, then what changed in the menu.
//
// It used to be two small conditional cards buried under the daily challenge, which meant
// that on a day with nothing to report the waiter saw *nothing* — and a briefing you only
// notice when it has content is not a briefing, it is an alert. This is always on the home
// screen, at the top, and says "no new updates" out loud on a quiet day. That is the habit
// being trained: check the brief every shift.
//
// The two cards share one visual language on purpose — same surface, same radius, same
// rail-and-icon header — so they read as two parts of one handover rather than two
// unrelated widgets. The brief leads because it is time-critical (what is 86'd tonight);
// the menu changes follow because they are homework.

const SECTIONS = [
  { key: "missing_items", label: "חסרים היום", icon: AlertTriangle, color: "#e0315a" },
  { key: "new_items", label: "מומלץ להציע", icon: Sparkles, color: "#22c08c" },
  { key: "oven_items", label: "במלאי מוגבל", icon: Package, color: "#f3c14b" },
];

// Shared shell. `accent` drives the rail and the title, which is the only thing that
// changes between the two cards.
function Panel({ accent, icon: Icon, title, meta, children }) {
  return (
    <div className="relative bg-[#16181c] border border-[#22252b] rounded-xl overflow-hidden">
      <span className="absolute top-0 right-0 h-full w-[3px]" style={{ background: accent }} />
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Icon size={14} style={{ color: accent }} />
          <p className="text-xs font-black" style={{ color: accent }}>{title}</p>
          <span className="flex-1" />
          {meta && <span className="text-[10px] font-bold text-[#5a5a6e]">{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

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

  const today = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });

  return (
    <div className="space-y-2">
      <Panel
        accent={isEmpty ? "#5a5a6e" : "#f3c14b"}
        icon={ClipboardList}
        title="הבריף של היום"
        meta={today}
      >
        {isEmpty ? (
          // Said out loud on purpose. Silence is ambiguous — it could mean "nothing to
          // report" or "the manager hasn't written it yet".
          <div className="flex items-center gap-2.5 py-1">
            <div className="w-8 h-8 rounded-full bg-[#191b1f] flex items-center justify-center flex-shrink-0">
              <Check size={15} className="text-[#22c08c]" />
            </div>
            <div>
              <p className="text-xs font-black text-[#c4c4d4]">אין עדכונים חדשים</p>
              <p className="text-[10px] text-[#5a5a6e] font-bold">הכל כרגיל — משמרת טובה!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filled.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex gap-2">
                  <Icon size={13} style={{ color: s.color }} className="flex-shrink-0 mt-[1px]" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black mb-0.5" style={{ color: s.color }}>{s.label}</p>
                    <p className="text-xs font-bold text-[#eef0f6] leading-relaxed">
                      {(brief[s.key] || []).join(" · ")}
                    </p>
                  </div>
                </div>
              );
            })}
            {hasNotes && (
              <div className="flex gap-2 pt-2.5 border-t border-[#22252b]">
                <MessageSquare size={13} className="text-[#8a8aa0] flex-shrink-0 mt-[1px]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-[#8a8aa0] mb-0.5">הודעה מהמנהל</p>
                  <p className="text-xs text-[#c4c4d4] leading-relaxed">{brief.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      {categories.length > 0 && (
        <Panel
          accent="#6d5efc"
          icon={Sparkles}
          title="חדש בתפריט"
          meta={`${newDishes.length} מנות`}
        >
          <div className="space-y-1 mb-3">
            {categories.map(([cat, dishes]) => (
              <p key={cat} className="text-xs font-bold text-[#eef0f6] leading-snug">
                {dishes.length >= 3
                  ? `כבר למדת את תפריט ${cat} החדש?`
                  : dishes.length === 1
                    ? `נוספה מנה חדשה ב${cat} — כבר למדת אותה?`
                    : `נוספו ${dishes.length} מנות חדשות ב${cat} — כבר למדת אותן?`}
              </p>
            ))}
          </div>
          <button
            onClick={onStudyNew}
            className="w-full py-2.5 rounded-lg bg-[#6d5efc] text-white text-xs font-black flex items-center justify-center gap-1.5"
          >
            ללמוד עכשיו <ArrowLeft size={13} />
          </button>
        </Panel>
      )}
    </div>
  );
}
