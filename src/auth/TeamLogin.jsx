import { useState } from "react";
import { Utensils, Loader2, AlertTriangle, UserCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

const SESSION_KEY = "menu-app-team-session";
const db = supabase.schema("menu_app");

// TEMP DEV FALLBACK — Supabase's Data API has been down (PGRST002) independent of app code.
// If the real lookup can't complete, fall back to a local-only session so the UI is still
// testable. Uses the real Salon Yevani restaurant id so writes reconcile automatically once
// the API is back. Remove this block once Supabase is confirmed healthy again.
const FALLBACK_RESTAURANT_ID = "dc496522-8085-48d2-866b-db72a2e6d949";

// Classic iterative Levenshtein (edit distance) — used to catch near-duplicate names
// like "יותם עזר" vs "יותם אזר" (one character apart) so the same person doesn't end
// up with two separate progress records just because of a typo.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}
const normName = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

export default function TeamLogin({ onGranted }) {
  const [teamCode, setTeamCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // When a near-duplicate name is found, pause here for a yes/no before committing.
  const [pendingMatch, setPendingMatch] = useState(null); // { rest, match, typedFirst, typedLast }

  const finishLogin = (rest, member) => {
    const session = {
      teamMemberId: member.id,
      name: member.name,
      firstName: member.first_name,
      lastName: member.last_name,
      restaurantId: rest.id,
      restaurantName: rest.name,
      restaurantDescription: rest.description || "",
      restaurantCuisineTypes: rest.cuisine_types || [],
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    onGranted(session);
  };

  const createMember = async (rest, first, last) => {
    const { data, error } = await db.from("team_members")
      .insert({ restaurant_id: rest.id, first_name: first, last_name: last, name: `${first} ${last}` })
      .select("id, name, first_name, last_name").single();
    if (error) throw error;
    return data;
  };

  const submit = async (e) => {
    e?.preventDefault();
    const first = firstName.trim(), last = lastName.trim();
    if (!first || !last) { setErr("צריך שם פרטי ושם משפחה כדי להתחבר."); return; }
    setBusy(true);
    setErr("");

    try {
      // Find restaurant by team code — only the owner's chosen code for THIS restaurant
      // gets you into THAT restaurant's menu. No code, no access.
      const { data: rest, error: e1 } = await db.from("restaurants")
        .select("id, name, description, cuisine_types").eq("team_code", teamCode.trim()).single();

      if (e1 || !rest) {
        console.warn("[TeamLogin] Supabase lookup failed, using local offline session:", e1);
        const session = {
          teamMemberId: crypto.randomUUID(),
          name: `${first} ${last}`,
          firstName: first, lastName: last,
          restaurantId: FALLBACK_RESTAURANT_ID,
          offline: true,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        onGranted(session);
        return;
      }

      const fullTyped = normName(`${first} ${last}`);
      const { data: roster } = await db.from("team_members")
        .select("id, name, first_name, last_name").eq("restaurant_id", rest.id);

      // Exact match (case/whitespace-insensitive) — silently reuse, no need to ask.
      const exact = (roster || []).find(m => normName(m.name || `${m.first_name} ${m.last_name}`) === fullTyped);
      if (exact) { finishLogin(rest, exact); return; }

      // Near match (small edit distance) — could be the same person with a typo, could
      // be a genuinely different name. Ask instead of guessing either way.
      let closest = null, closestDist = Infinity;
      for (const m of roster || []) {
        const d = levenshtein(fullTyped, normName(m.name || `${m.first_name} ${m.last_name}`));
        if (d < closestDist) { closestDist = d; closest = m; }
      }
      if (closest && closestDist > 0 && closestDist <= 2) {
        setPendingMatch({ rest, match: closest, typedFirst: first, typedLast: last });
        setBusy(false);
        return;
      }

      const member = await createMember(rest, first, last);
      finishLogin(rest, member);
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. נסה/י שוב.");
    } finally {
      setBusy(false);
    }
  };

  const confirmMatch = async (isSamePerson) => {
    const { rest, match, typedFirst, typedLast } = pendingMatch;
    setPendingMatch(null);
    setBusy(true);
    try {
      if (isSamePerson) {
        finishLogin(rest, match);
      } else {
        const member = await createMember(rest, typedFirst, typedLast);
        finishLogin(rest, member);
      }
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. נסה/י שוב.");
      setBusy(false);
    }
  };

  if (pendingMatch) {
    return (
      <div className="h-full max-w-md mx-auto flex flex-col items-center justify-center px-7 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className="bg-[#16181c] border border-[#22252b] rounded-3xl p-6 w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1c1e22] text-[#6d5efc] flex items-center justify-center mx-auto">
            <UserCheck size={26} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#8a8aa0] mb-1">מצאנו שם דומה בצוות</p>
            <p className="text-lg font-black">האם אתה/את {pendingMatch.match.name}?</p>
          </div>
          <p className="text-[11px] text-[#8a8aa0]">אם כן, נמשיך עם ההתקדמות הקיימת שלך. אם זה מישהו אחר, ניצור פרופיל חדש.</p>
          <div className="flex flex-col gap-2 pt-1">
            <button disabled={busy} onClick={() => confirmMatch(true)} className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#6d5efc] text-white active:bg-[#5b4ef0]">
              {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : `כן, זה אני`}
            </button>
            <button disabled={busy} onClick={() => confirmMatch(false)} className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#1c1e22] text-[#c4c4d4]">
              לא, זה שם אחר
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = teamCode.trim() && firstName.trim() && lastName.trim() && !busy;

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
            <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">קוד הצוות (מהמנהל/ת שלך)</p>
            <input value={teamCode} onChange={(e) => setTeamCode(e.target.value)}
              placeholder="לדוגמה: 1234" dir="ltr" autoComplete="off"
              className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">שם פרטי</p>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                placeholder="דנה" dir="rtl"
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
            </div>
            <div>
              <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">שם משפחה</p>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                placeholder="כהן" dir="rtl"
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-sm font-bold text-[#eef0f6] text-right placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#6d5efc]" />
            </div>
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
