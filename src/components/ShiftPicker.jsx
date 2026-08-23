import { useState } from "react";
import { CalendarCheck, UserRound, Sunrise, Moon, Coffee, UtensilsCrossed, Martini, Pencil, Layers } from "lucide-react";
import { SHIFTS, ROLES, PROFILE_ROLES, shiftLabel, roleLabel, gz } from "../lib/shiftChoice";

const SHIFT_ICONS = { opening: Sunrise, closing: Moon, none: Coffee };
const ROLE_ICONS = { waiter: UtensilsCrossed, bar: Martini, both: Layers };

// ── One-time profile ──────────────────────────────────────────────────────────────────
// Asked once, right after the first login: waiter, bartender, or both — the answer
// decides which of the manager's checklists show up. It does not change day to day, so
// it is not asked again; "both" is the one answer that pushes a daily question, because
// that person genuinely wears a different hat on different days.
// ⚠️ There is no gender question (user, 2026-08-23). It was one more screen in the door
// for something the copy can avoid saying in the first place.
export function ProfileGate({ onDone }) {
  return (
    <div className="h-full max-w-md mx-auto flex flex-col justify-center px-6 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center mb-5"
        style={{ background: "linear-gradient(135deg,#22c08c,#0F5C46)" }}>
        <UserRound size={26} />
      </div>

      <p className="text-xl font-black mb-1.5">מה התפקיד שלך?</p>
      <p className="text-sm text-[#8a8aa0] mb-5 leading-relaxed">
        שאלה אחת, פעם אחת — התשובה קובעת אילו משימות משמרת יוצגו. מי שעושה גם וגם נשאל בכל יום מחדש.
      </p>
      <div className="space-y-2">
        {PROFILE_ROLES.map((r) => {
          const Icon = ROLE_ICONS[r.id];
          return (
            <button
              key={r.id}
              onClick={() => onDone(r.id)}
              className="w-full py-3.5 min-h-[56px] rounded-2xl bg-[#16181c] border border-[#22252b] flex items-center gap-3 px-4 active:scale-[0.98] transition-transform"
            >
              <Icon size={18} className="text-[#a79bff] flex-shrink-0" />
              <span className="flex-1 text-right">
                <span className="block text-sm font-black text-[#eef0f6]">{gz(r.label)}</span>
                <span className="block text-[11px] text-[#5a5a6e]">{r.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily gate ─────────────────────────────────────────────────────────────────────────
// One screen, once a day: which shift? Three real answers — opening, closing, or no
// shift at all (learning + the daily update only; it is NOT "not working": the brief
// still reaches them). A "both" profile answers which hat today first.
export function ShiftGate({ profileRole, onPick }) {
  const [dayRole, setDayRole] = useState(profileRole !== "both" ? profileRole : null);

  return (
    <div className="h-full max-w-md mx-auto flex flex-col justify-center px-6 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center mb-5"
        style={{ background: "linear-gradient(135deg,#22c08c,#0F5C46)" }}>
        <CalendarCheck size={26} />
      </div>

      {!dayRole ? (
        <>
          <p className="text-xl font-black mb-1.5">{gz("במה את/ה היום?")}</p>
          <p className="text-sm text-[#8a8aa0] mb-5">בפרופיל מסומן "גם וגם", אז רק ליום הזה:</p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => {
              const Icon = ROLE_ICONS[r.id];
              return (
                <button
                  key={r.id}
                  onClick={() => setDayRole(r.id)}
                  className="py-4 min-h-[64px] rounded-2xl bg-[#16181c] border border-[#22252b] flex flex-col items-center gap-1 active:scale-[0.98] transition-transform"
                >
                  <Icon size={18} className="text-[#a79bff]" />
                  <span className="text-sm font-black text-[#eef0f6]">{gz(r.label)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="text-xl font-black mb-1.5">איזו משמרת היום?</p>
          <p className="text-sm text-[#8a8aa0] mb-5 leading-relaxed">
            אפשר לשנות את התשובה בכל רגע מהמסך הראשי.
          </p>
          <div className="space-y-2">
            {SHIFTS.map((sh) => {
              const Icon = SHIFT_ICONS[sh.id];
              return (
                <button
                  key={sh.id}
                  onClick={() => onPick(sh.id, dayRole)}
                  className="w-full py-3.5 min-h-[56px] rounded-2xl bg-[#16181c] border border-[#22252b] flex items-center gap-3 px-4 active:scale-[0.98] transition-transform"
                >
                  <Icon size={18} className="text-[#22c08c] flex-shrink-0" />
                  <span className="flex-1 text-right">
                    <span className="block text-sm font-black text-[#eef0f6]">{sh.label}</span>
                    <span className="block text-[11px] text-[#5a5a6e]">{sh.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// In-tab re-edit: the same daily question, compact, opened from the chip. The profile
// link at the bottom clears the stored profile — for a promotion, a typo, or a phone
// that changed hands — and the one-time questions run again.
export function ShiftQuestion({ profileRole, onPick, onResetProfile }) {
  const [dayRole, setDayRole] = useState(profileRole !== "both" ? profileRole : null);

  return (
    <div className="bg-[#16181c] border border-[#22c08c]/40 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-[15px] font-black text-[#eef0f6]">איזו משמרת היום?</p>
        <p className="text-[11px] text-[#8a8aa0] mt-0.5">התשובה קובעת אילו משימות יוצגו.</p>
      </div>

      {!dayRole && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-black text-[#8a8aa0]">{gz("קודם — במה את/ה היום?")}</p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => {
              const Icon = ROLE_ICONS[r.id];
              return (
                <button
                  key={r.id}
                  onClick={() => setDayRole(r.id)}
                  className="py-3 min-h-[52px] rounded-xl bg-[#20232b] border border-[#22252b] flex flex-col items-center gap-1 active:scale-[0.98] transition-transform"
                >
                  <Icon size={17} className="text-[#a79bff]" />
                  <span className="text-xs font-black text-[#eef0f6]">{gz(r.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {dayRole && (
        <div className="grid grid-cols-3 gap-2">
          {SHIFTS.map((sh) => {
            const Icon = SHIFT_ICONS[sh.id];
            return (
              <button
                key={sh.id}
                onClick={() => onPick(sh.id, dayRole)}
                className="py-3 min-h-[64px] rounded-xl bg-[#20232b] border border-[#22252b] flex flex-col items-center gap-1 px-1 active:scale-[0.98] transition-transform"
              >
                <Icon size={17} className="text-[#22c08c]" />
                <span className="text-[11px] font-black text-[#eef0f6] leading-tight text-center">{sh.label}</span>
                <span className="text-[9.5px] text-[#5a5a6e] leading-tight text-center">{sh.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      {onResetProfile && (
        <button onClick={onResetProfile} className="text-[10.5px] font-bold text-[#5a5a6e] min-h-[36px]">
          שינוי התפקיד הקבוע ←
        </button>
      )}
    </div>
  );
}

// The collapsed state: one line saying what was answered, tappable to change it.
export function ShiftChip({ shift, role, onChange }) {
  return (
    <button
      onClick={onChange}
      className="w-full bg-[#16181c] border border-[#22252b] rounded-xl px-3 py-2 flex items-center gap-2 active:scale-[0.99] transition-transform"
    >
      <span className="text-[11px] font-black text-[#22c08c]">{shiftLabel(shift)}</span>
      <span className="text-[10px] text-[#5a5a6e]">·</span>
      <span className="text-[11px] font-bold text-[#c4c4d4]">{gz(roleLabel(role))}</span>
      <span className="flex-1" />
      <span className="text-[10px] font-bold text-[#5a5a6e] flex items-center gap-1"><Pencil size={11} />לשינוי</span>
    </button>
  );
}
