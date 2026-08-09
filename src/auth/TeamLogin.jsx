import { useState } from "react";
import { Utensils, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";

const SESSION_KEY = "menu-app-team-session";
const db = supabase.schema("menu_app");

export default function TeamLogin({ onGranted }) {
  const [teamCode, setTeamCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");

    try {
      // Find restaurant by team code
      const { data: rest, error: e1 } = await db.from("restaurants")
        .select("id").eq("team_code", teamCode.trim()).single();
      if (e1 || !rest) {
        setErr("קוד צוות לא נמצא.");
        setBusy(false);
        return;
      }

      // Create or find team member
      let member;
      if (name.trim()) {
        // Create new team member
        const { data, error } = await db.from("team_members")
          .insert({ restaurant_id: rest.id, name: name.trim() })
          .select("id, name").single();
        if (error) throw error;
        member = data;
      } else {
        setErr("הכנס/י את שמך.");
        setBusy(false);
        return;
      }

      const session = {
        teamMemberId: member.id,
        name: member.name,
        restaurantId: rest.id,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onGranted(session);
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. נסה/י שוב.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = teamCode.trim() && name.trim() && !busy;

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="px-7 pt-[max(3.5rem,env(safe-area-inset-top))] pb-2 text-center">
        <div className="w-16 h-16 rounded-3xl text-white flex items-center justify-center mx-auto mb-4 shadow-[0_10px_30px_rgba(109,94,252,0.35)]"
          style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
          <Utensils size={32} />
        </div>
        <h1 className="text-3xl font-black leading-tight">Menu Trainer</h1>
        <p className="text-sm text-[#8a8aa0] font-semibold mt-2 leading-relaxed">
          תלמיד · מאמן לימוד
        </p>
      </div>

      <form onSubmit={submit} className="flex-1 px-6 pt-4 flex flex-col">
        <div className="bg-[#16181c] border border-[#22252b] rounded-3xl shadow-[0_2px_14px_rgba(30,25,70,0.05)] p-5 space-y-4">
          <p className="text-[12px] font-bold text-[#8a8aa0] px-1">הצטרפות לצוות</p>

          <div>
            <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">קוד הצוות</p>
            <input value={teamCode} onChange={(e) => setTeamCode(e.target.value)}
              placeholder="לדוגמה: ABC123" dir="ltr" autoComplete="off"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
          </div>

          <div>
            <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">שמך</p>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: דנה כהן" dir="rtl"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
          </div>

          {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</p>}

          <button type="submit" disabled={!canSubmit}
            className={`w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-colors ${
              canSubmit ? "bg-[#6d5efc] text-white active:bg-[#5b4ef0] shadow-[0_6px_18px_rgba(109,94,252,0.35)]" : "bg-[#22252b] text-[#b4b4c4] cursor-not-allowed"
            }`}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> בודק…</> : "הצטרפות"}
          </button>
        </div>

        <p className="text-center text-[12px] text-[#8a8aa0] font-semibold mt-auto pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] leading-relaxed">
          Menu Trainer · מאמן תפריט לצוות
        </p>
      </form>
    </div>
  );
}
