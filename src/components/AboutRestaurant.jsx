import { Store, ChevronLeft, X } from "lucide-react";

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

export function AboutScreen({ session, onClose }) {
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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {session?.restaurantDescription && (
          <p className="text-sm text-[#c4c4d4] leading-relaxed">{session.restaurantDescription}</p>
        )}
        {session?.restaurantServiceNotes && (
          <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-3.5">
            <p className="text-[11px] font-bold text-[#8a8aa0] mb-1.5">איך אנחנו מארחים כאן</p>
            <p className="text-sm text-[#eef0f6] leading-relaxed whitespace-pre-line text-right">
              {session.restaurantServiceNotes}
            </p>
          </div>
        )}
        {!session?.restaurantDescription && !session?.restaurantServiceNotes && (
          <p className="text-sm text-[#8a8aa0] text-center py-8">אין עדיין פרטים — המנהל/ת יכול/ה להוסיף אותם באפליקציית הניהול.</p>
        )}
      </div>
    </div>
  );
}
