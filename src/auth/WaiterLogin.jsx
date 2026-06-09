import { useState } from "react";
import { Utensils, Phone, ArrowLeft, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { checkWaiterAccess, normPhone, setMe, ACCESS_KEY } from "../lib/shiftcrew";

// ─────────────────────────────────────────────────────────────────────────────
// WaiterLogin — the ENTIRE auth model for waiters: a phone number, no password,
// no account. The owner adds a waiter's number to the roster in the owner app;
// typing that same number here is what grants access. We ask the owner schema's
// waiter_access() RPC whether the number is on an active roster. If yes, we cache
// the granted identity locally (re-verified on every launch in App.jsx) and enter
// the app; if not, we explain that the manager has to add them first.
// ─────────────────────────────────────────────────────────────────────────────

export default function WaiterLogin({ onGranted }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSubmit = normPhone(phone).length >= 9 && !busy;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    try {
      const row = await checkWaiterAccess(phone.trim());
      if (!row) {
        setErr("המספר הזה לא נמצא. בקש/י מהמנהל/ת להוסיף אותך לצוות.");
        setBusy(false);
        return;
      }
      const session = {
        phone: normPhone(phone),
        staffId: row.staff_id,
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        name: row.waiter_name,
        role: row.role,
      };
      localStorage.setItem(ACCESS_KEY, JSON.stringify(session));
      setMe(session.name);
      onGranted(session);
    } catch (e2) {
      console.error("[shiftcrew] access check failed:", e2);
      setErr("משהו השתבש בבדיקת הגישה — נסה/י שוב.");
      setBusy(false);
    }
  };

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#f4f4f9] text-[#1b1b2e]" dir="rtl">
      {/* Brand hero */}
      <div className="px-7 pt-[max(3.5rem,env(safe-area-inset-top))] pb-2 text-center">
        <div className="w-16 h-16 rounded-3xl text-white flex items-center justify-center mx-auto mb-4 shadow-[0_10px_30px_rgba(109,94,252,0.35)]"
          style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          <Utensils size={32} />
        </div>
        <h1 className="text-3xl font-black leading-tight">ShiftCrew</h1>
        <p className="text-sm text-[#8a8aa0] font-semibold mt-2 leading-relaxed">
          המשמרות שלך, התפריט והתרגול היומי — במקום אחד.
        </p>
      </div>

      <form onSubmit={submit} className="flex-1 px-6 pt-4 flex flex-col">
        <div className="bg-white border border-[#ecebf3] rounded-3xl shadow-[0_2px_14px_rgba(30,25,70,0.05)] p-5 space-y-4">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#0c9b6e] bg-[#e7f7f0] rounded-2xl px-3.5 py-2.5">
            <ShieldCheck size={15} />
            כניסה עם מספר הטלפון — בלי סיסמה
          </div>

          <div>
            <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">מספר הטלפון שלך</p>
            <div className="flex items-center gap-2 bg-[#f4f4f9] border border-[#ecebf3] rounded-2xl px-3.5 focus-within:border-[#6d5efc]">
              <Phone size={17} className="text-[#8a8aa0] flex-shrink-0" />
              <input
                type="tel" inputMode="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-1234567" dir="ltr" autoComplete="tel"
                className="w-full bg-transparent py-3.5 text-base font-bold text-[#1b1b2e] text-left placeholder:text-[#b4b4c4] focus:outline-none"
              />
            </div>
          </div>

          {err && (
            <p className="text-[13px] font-bold text-[#e0315a] flex items-center gap-1.5 leading-relaxed">
              <AlertTriangle size={15} className="flex-shrink-0" /> {err}
            </p>
          )}

          <button type="submit" disabled={!canSubmit}
            className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
              canSubmit ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#ecebf3] text-[#b4b4c4] cursor-not-allowed"}`}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> בודק…</> : <>כניסה <ArrowLeft size={18} /></>}
          </button>
        </div>

        <p className="text-center text-[12px] text-[#a0a0b4] font-semibold mt-auto pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] leading-relaxed">
          הגישה ניתנת על־ידי מנהל/ת המסעדה.<br />
          אם המספר לא מזוהה — בקש/י שיוסיפו אותך לצוות ב-ShiftCrew.
        </p>
      </form>
    </div>
  );
}
