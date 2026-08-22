import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Sunrise, Moon, Coffee, UtensilsCrossed, Martini, Pencil } from "lucide-react";
import { SHIFTS, ROLES, shiftLabel, roleLabel } from "../lib/shiftChoice";

const SHIFT_ICONS = { opening: Sunrise, closing: Moon, none: Coffee };
const ROLE_ICONS = { waiter: UtensilsCrossed, bar: Martini };

// "Which shift are you on today?" — asked once per day, at the top of the tasks screen
// (user, 2026-08-20). The answer filters the manager's checklists: openers see the
// opening list, closers the closing list, and someone who isn't working today sees only
// the learning tasks. The role (waiter/bar) rides along in the same card and filters
// role-tagged tasks the same way.
//
// This is a QUESTION, not a settings screen: until it's answered the card blocks the
// task list (there is no meaningful list to show — we don't know which one). After
// answering it collapses to a one-line chip, and tapping the chip reopens the question —
// "he can change his answer anytime he wants".
export function ShiftQuestion({ role, onPick, workingOnly = false }) {
  // The role is asked inline the first time only — a stable fact, unlike the shift.
  const [pickedRole, setPickedRole] = useState(role);

  const shifts = workingOnly ? SHIFTS.filter((x) => x.id !== "none") : SHIFTS;

  return (
    <div className={workingOnly ? "space-y-3" : "bg-[#16181c] border border-[#22c08c]/40 rounded-2xl p-4 space-y-3"}>
      {!workingOnly && (
        <div>
          <p className="text-[15px] font-black text-[#eef0f6]">איזו משמרת היום?</p>
          <p className="text-[11px] text-[#8a8aa0] mt-0.5">התשובה קובעת אילו משימות יוצגו — ואפשר לשנות אותה בכל רגע.</p>
        </div>
      )}

      {!pickedRole && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-black text-[#8a8aa0]">קודם — מה התפקיד שלך?</p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => {
              const Icon = ROLE_ICONS[r.id];
              return (
                <button
                  key={r.id}
                  onClick={() => setPickedRole(r.id)}
                  className="py-3 min-h-[52px] rounded-xl bg-[#20232b] border border-[#22252b] flex flex-col items-center gap-1 active:scale-[0.98] transition-transform"
                >
                  <Icon size={17} className="text-[#a79bff]" />
                  <span className="text-xs font-black text-[#eef0f6]">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pickedRole && (
        <div className={`grid gap-2 ${shifts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {shifts.map((sh) => {
            const Icon = SHIFT_ICONS[sh.id];
            return (
              <button
                key={sh.id}
                onClick={() => onPick(sh.id, pickedRole)}
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
      <span className="text-[11px] font-bold text-[#c4c4d4]">{roleLabel(role)}</span>
      <span className="flex-1" />
      <span className="text-[10px] font-bold text-[#5a5a6e] flex items-center gap-1"><Pencil size={11} />לשינוי</span>
    </button>
  );
}

// Full-screen entry gate (user, 2026-08-20): every day, before anything else — "are you
// on shift today?" Yes ⇒ the opening/closing questionnaire. No ⇒ shift is "none": no
// daily tasks, no brief gate, straight to studying. Same storage as the in-tab card, so
// the answer is still changeable later from the chip.
export function ShiftGate({ role, onPick }) {
  const [working, setWorking] = useState(null);   // null = the yes/no question

  return (
    <div className="h-full max-w-md mx-auto flex flex-col justify-center px-6 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center mb-5"
        style={{ background: "linear-gradient(135deg,#22c08c,#0F5C46)" }}>
        <CalendarCheck size={26} />
      </div>

      {working === null ? (
        <>
          <p className="text-xl font-black mb-1.5">במשמרת היום?</p>
          <p className="text-sm text-[#8a8aa0] mb-5 leading-relaxed">
            אם כן — נציג את משימות המשמרת והעדכון היומי. אם לא — ניגש ישר ללימוד התפריט.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => setWorking(true)}
              className="w-full py-3.5 min-h-[52px] rounded-2xl font-black text-sm bg-[#22c08c] text-[#06231a]"
            >
              כן, אני במשמרת היום
            </button>
            <button
              onClick={() => onPick("none", role)}
              className="w-full py-3.5 min-h-[52px] rounded-2xl font-bold text-sm bg-[#16181c] border border-[#22252b] text-[#c4c4d4]"
            >
              לא היום — רק ללמוד
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xl font-black mb-1.5">איזו משמרת?</p>
          <p className="text-sm text-[#8a8aa0] mb-5">התשובה קובעת אילו משימות יוצגו — ואפשר לשנות אותה בכל רגע מהמסך הראשי.</p>
          <ShiftQuestion role={role} onPick={onPick} workingOnly />
        </>
      )}
    </div>
  );
}
