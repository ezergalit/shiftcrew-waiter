import { Store, ChevronLeft, X, AlertTriangle } from "lucide-react";

// "אודות המסעדה" — the restaurant's own story and hosting guide, as a place you can
// always come back to (user, 2026-08-24: the hosting guide used to be dumped on the
// welcome screen — "this shouldn't be the start page"). The welcome tutorial now only
// teases it; the full content lives here, one tap from the menu tab, for trainees and
// veterans alike.

export function AboutCard({ session, onOpen }) {
  const has = session?.restaurantDescription || session?.restaurantServiceNotes;
  if (!has) return null;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-2.5 bg-[#16181c] border border-[#22252b] rounded-2xl px-3.5 py-3 mb-3 text-right"
    >
      <span className="w-8 h-8 rounded-lg bg-[#6d5efc]/15 flex items-center justify-center flex-shrink-0">
        <Store size={15} className="text-[#a79bff]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-black text-[#eef0f6]">אודות המסעדה</span>
        <span className="block text-[11px] text-[#8a8aa0]">מי אנחנו ואיך אנחנו מארחים</span>
      </span>
      <ChevronLeft size={16} className="text-[#5a5a6e] flex-shrink-0" />
    </button>
  );
}

// The hosting guide is one free-text field the manager types, and it arrived here as a
// single grey wall — the exact thing the waiter needs mid-shift is the hardest to find in
// it (user, 2026-08-26: "a long paragraph that is not connected"). Managers already write
// it in sections ("🍜 ווק ומרקים" and then bullet lines), so read that structure back out
// instead of asking them to write it differently.
//
// ⚠️ Deliberately forgiving: a guide with no headings at all still renders, as one intro
// block. Parsing must never be able to hide text the manager wrote.
const EMOJI_HEAD = /^\s*(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.+?)\s*$/u;
const BULLET = /^\s*[•\-–*]\s*/;

export function parseGuide(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  const intro = [];
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const bullet = BULLET.test(t);
    const head = !bullet && t.length <= 48 && EMOJI_HEAD.exec(t);
    if (head) {
      cur = { emoji: head[1], title: head[2], lines: [] };
      sections.push(cur);
      continue;
    }
    let text = bullet ? t.replace(BULLET, "") : t;
    // The intro block is titled "לפני הכול" already — a manager who opened with those
    // same words shouldn't have them printed twice in a row.
    if (!cur && !bullet) text = text.replace(/^לפני\s+הכ[וו]?ל[:,]\s*/u, "");
    (cur ? cur.lines : intro).push({ text, bullet });
  }
  return { intro, sections };
}

function GuideLine({ line }) {
  if (!line.bullet) return <p className="text-[14px] text-[#c4c4d4] leading-relaxed">{line.text}</p>;
  return (
    <div className="flex gap-2">
      <span className="text-[#22c08c] font-black flex-shrink-0 leading-relaxed">•</span>
      <p className="text-[14px] text-[#eef0f6] leading-relaxed flex-1">{line.text}</p>
    </div>
  );
}

export function AboutScreen({ session, onClose }) {
  const guide = parseGuide(session?.restaurantServiceNotes);
  const hasGuide = guide.intro.length > 0 || guide.sections.length > 0;

  return (
    <div className="fixed inset-0 z-[55] bg-[#0c0d10] flex flex-col max-w-md mx-auto" dir="rtl">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-[#22252b] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-[#eef0f6] truncate">{session?.restaurantName || "אודות המסעדה"}</p>
          {session?.restaurantCuisineTypes?.length > 0 && (
            <p className="text-[11px] text-[#8a8aa0] truncate">{session.restaurantCuisineTypes.join(" · ")}</p>
          )}
        </div>
        <button onClick={onClose} aria-label="סגירה"
          className="w-9 h-9 rounded-lg bg-[#191b1f] border border-[#22252b] flex items-center justify-center text-[#8a8aa0] flex-shrink-0">
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        {session?.restaurantDescription && (
          <div className="rounded-2xl p-4 text-[#EEF0F6]" style={{ background: "linear-gradient(135deg,#0F5C46,#0a3d2f)" }}>
            <p className="text-[11px] font-black text-[#EEF0F6]/60 mb-1.5">מי אנחנו</p>
            <p className="text-[15px] leading-relaxed">{session.restaurantDescription}</p>
          </div>
        )}

        {hasGuide && (
          <p className="text-[11px] font-black text-[#5a5a6e] px-1 pt-1">כללי הבית — איך מארחים כאן</p>
        )}

        {/* Whatever the manager wrote before the first section heading is house-wide, and
            in practice it is the safety line ("always ask about allergies"). It gets the
            warning treatment rather than being the first grey paragraph of many. */}
        {guide.intro.length > 0 && (
          <div className="bg-[#2a1416] border border-[#5b2027] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-[#ff6b7f] flex-shrink-0" />
              <p className="text-[12px] font-black text-[#ff6b7f]">לפני הכול</p>
            </div>
            {guide.intro.map((l, i) => <GuideLine key={i} line={l} />)}
          </div>
        )}

        {guide.sections.map((s, i) => (
          <div key={i} className="bg-[#16181c] border border-[#22252b] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1c1f24] border-b border-[#22252b]">
              <span className="text-[15px]" aria-hidden>{s.emoji}</span>
              <p className="text-[13px] font-black text-[#eef0f6]">{s.title}</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {s.lines.map((l, j) => <GuideLine key={j} line={l} />)}
            </div>
          </div>
        ))}

        {!session?.restaurantDescription && !hasGuide && (
          <p className="text-sm text-[#8a8aa0] text-center py-8">אין עדיין פרטים — המנהל/ת יכול/ה להוסיף אותם באפליקציית הניהול.</p>
        )}
      </div>
    </div>
  );
}
