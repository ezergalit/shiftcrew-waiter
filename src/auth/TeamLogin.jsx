import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, UserCheck, Smartphone } from "lucide-react";
import { supabase } from "../lib/supabase";
import { setSessionToken } from "../lib/appSession";
import { normalizeIlPhone, displayIlPhone } from "../lib/phone";

const SESSION_KEY = "menu-app-team-session";
const db = supabase.schema("menu_app");

// TEMP DEV FALLBACK — Supabase's Data API has been down (PGRST002) independent of app code.
// If the real lookup can't complete, fall back to a local-only session so the UI is still
// testable. Uses the real Salon Yevani restaurant id so writes reconcile automatically once
// the API is back. Remove this block once Supabase is confirmed healthy again.
const FALLBACK_RESTAURANT_ID = "dc496522-8085-48d2-866b-db72a2e6d949";

// The whole join flow — restaurant lookup, roster fuzzy-match (the "יותם עזר" vs
// "יותם אזר" case), member creation — now runs server-side in menu_app.team_join,
// which is also what mints the session token RLS checks on every later request.
// The client only renders the three outcomes: ok / confirm / bad_code.

export default function TeamLogin({ onGranted }) {
  const [teamCode, setTeamCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // When a near-duplicate name is found, pause here for a yes/no before committing.
  const [pendingMatch, setPendingMatch] = useState(null); // { rest, match, typedFirst, typedLast }
  // Phone-verified join (features.phone_join, per restaurant): after code+name the
  // waiter verifies their phone once — one phone = one member, so rejoining from a new
  // device brings the same profile back, and a blocked number stays out on its own.
  // null = classic flow · { sent, phone, code, cooldown } = the verification screen.
  const [phoneStep, setPhoneStep] = useState(null);
  const [verifyToken, setVerifyToken] = useState(null);

  // The resend cooldown ticks down once a second while the code screen is up.
  useEffect(() => {
    if (!phoneStep?.cooldown) return;
    const t = setTimeout(() => setPhoneStep((ps) => ps && { ...ps, cooldown: ps.cooldown - 1 }), 1000);
    return () => clearTimeout(t);
  }, [phoneStep?.cooldown]);

  const finishLogin = (result) => {
    const rest = result.restaurant, member = result.member;
    setSessionToken(result.token);
    const session = {
      teamMemberId: member.id,
      name: member.name,
      firstName: member.first_name,
      lastName: member.last_name,
      restaurantId: rest.id,
      restaurantName: rest.name,
      restaurantDescription: rest.description || "",
      restaurantCuisineTypes: rest.cuisine_types || [],
      restaurantServiceStyle: rest.service_style || "",
      restaurantServiceNotes: rest.service_notes || "",
      // A restaurant can greet new waiters with its own tour video instead of the slide
      // tutorial (user, 2026-08-24). Set per restaurant in the DB — empty for everyone
      // who hasn't got a video, and those keep the slides.
      welcomeVideoUrl: rest.welcome_video_url || "",
      // Drives the one-time welcome tutorial in MainApp — only for a brand-new profile,
      // not someone whose name we just matched back to an existing one.
      showTutorial: !!result.is_new,
      // Same signal, read by App.jsx to send a first-timer to the baseline intake without
      // a second round-trip. A restored profile is checked against the DB column instead.
      isNew: !!result.is_new,
      // Joined with the restaurant's trainee code — learning-only mode: no shift tasks,
      // no daily brief, no gates. Decided server-side by which code was typed.
      trainee: !!result.trainee,
      // Per-restaurant wallpaper flags (restaurants.features) — e.g. {"tasks": false}
      // turns the whole app into menu + learning, like a permanent trainee mode.
      features: rest.features || {},
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    onGranted(session);
  };

  const join = (extra = {}) => (verifyToken
    ? db.rpc("team_join_v2", {
        p_team_code: teamCode.trim(),
        p_first: firstName.trim(),
        p_last: lastName.trim(),
        p_phone: normalizeIlPhone(phoneStep?.phone || ""),
        p_verify_token: verifyToken,
        ...extra,
      })
    : db.rpc("team_join", {
        p_team_code: teamCode.trim(),
        p_first: firstName.trim(),
        p_last: lastName.trim(),
        ...extra,
      }));

  // Statuses only the verified path returns. A blocked number gets a door, not an
  // explanation — the person it blocks already knows why.
  const v2Status = (status) => {
    if (status === "blocked") { setErr("ההצטרפות לא זמינה כרגע. דברו עם המנהל/ת."); return true; }
    if (status === "need_verify") {
      setErr("האימות פג — נשלח קוד חדש.");
      setVerifyToken(null);
      setPhoneStep((ps) => ps && { ...ps, sent: false, code: "" });
      return true;
    }
    if (status === "bad_phone") { setErr("המספר לא נראה כמו נייד ישראלי."); return true; }
    return false;
  };

  const submit = async (e) => {
    e?.preventDefault();
    const first = firstName.trim(), last = lastName.trim();
    if (!first || !last) { setErr("צריך שם פרטי ושם משפחה כדי להתחבר."); return; }
    setBusy(true);
    setErr("");

    try {
      // Which door does this restaurant use? join_mode is a flag lookup only — unlike
      // team_preview it mints nothing. Restaurants without phone_join keep the exact
      // old path, so nothing changes for them (or for store reviewers).
      if (!verifyToken) {
        const { data: jm } = await db.rpc("join_mode", { p_team_code: teamCode.trim() });
        if (jm?.status === "bad_code") { setErr("קוד הצוות לא נמצא. אפשר לבדוק אותו מול המנהל/ת."); setBusy(false); return; }
        if (jm?.phone_join) { setPhoneStep({ phone: "", code: "", sent: false, cooldown: 0 }); setBusy(false); return; }
      }

      const { data, error } = await join();

      if (error || !data) {
        // A failed VERIFIED join must not silently become an unverified offline
        // profile — that would be a bypass of the whole gate.
        if (verifyToken) { setErr("משהו השתבש. אפשר לנסות שוב."); return; }
        console.warn("[TeamLogin] Supabase lookup failed, using local offline session:", error);
        const session = {
          teamMemberId: crypto.randomUUID(),
          name: `${first} ${last}`,
          firstName: first, lastName: last,
          restaurantId: FALLBACK_RESTAURANT_ID,
          offline: true,
          showTutorial: true,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        onGranted(session);
        return;
      }

      if (data.status === "bad_code") { setErr("קוד הצוות לא נמצא. אפשר לבדוק אותו מול המנהל/ת."); return; }
      if (data.status === "bad_name") { setErr("צריך שם פרטי ושם משפחה כדי להתחבר."); return; }
      if (v2Status(data.status)) return;

      // Near match (small edit distance, decided server-side) — could be the same
      // person with a typo, could be a genuinely different name. Ask, don't guess.
      if (data.status === "confirm") { setPendingMatch({ match: data.candidate }); return; }

      finishLogin(data);
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. אפשר לנסות שוב.");
    } finally {
      setBusy(false);
    }
  };

  const confirmMatch = async (isSamePerson) => {
    const { match } = pendingMatch;
    setPendingMatch(null);
    setBusy(true);
    try {
      const { data, error } = await join(
        isSamePerson ? { p_confirm_member: match.id } : { p_force_new: true }
      );
      if (data?.status && v2Status(data.status)) { setBusy(false); return; }
      if (error || data?.status !== "ok") throw error || new Error(data?.status);
      finishLogin(data);
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. אפשר לנסות שוב.");
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const phone = normalizeIlPhone(phoneStep.phone);
    if (!phone) { setErr("המספר לא נראה כמו נייד ישראלי (05X-XXXXXXX)."); return; }
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("phone-join", { body: { mode: "send", phone } });
      if (error) throw error;
      if (data?.status === "too_many") { setErr("נשלחו יותר מדי קודים למספר הזה היום. נסו שוב מחר."); return; }
      if (data?.status !== "sent") { setErr("שליחת הקוד נכשלה. אפשר לנסות שוב."); return; }
      setPhoneStep((ps) => ({ ...ps, sent: true, code: "", cooldown: 30 }));
    } catch (e2) {
      console.error(e2);
      setErr("שליחת הקוד נכשלה. אפשר לנסות שוב.");
    } finally { setBusy(false); }
  };

  const checkCode = async () => {
    const phone = normalizeIlPhone(phoneStep.phone);
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("phone-join", { body: { mode: "check", phone, code: phoneStep.code } });
      if (error) throw error;
      if (data?.status !== "verified" || !data.token) { setErr("הקוד לא נכון. אפשר לנסות שוב."); return; }
      setVerifyToken(data.token);
      // Straight into the join with the fresh token — same submit path, which also
      // handles the "is this you?" fuzzy-match screen if the name is close to an
      // existing one.
      const { data: jd, error: je } = await db.rpc("team_join_v2", {
        p_team_code: teamCode.trim(), p_first: firstName.trim(), p_last: lastName.trim(),
        p_phone: phone, p_verify_token: data.token,
      });
      if (je || !jd) { setErr("משהו השתבש. אפשר לנסות שוב."); return; }
      if (jd.status === "confirm") { setPendingMatch({ match: jd.candidate }); return; }
      if (v2Status(jd.status)) return;
      if (jd.status !== "ok") { setErr("משהו השתבש. אפשר לנסות שוב."); return; }
      finishLogin(jd);
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. אפשר לנסות שוב.");
    } finally { setBusy(false); }
  };

  if (phoneStep) {
    const phoneOk = normalizeIlPhone(phoneStep.phone) !== null;
    return (
      <div className="h-full max-w-md mx-auto flex flex-col items-center justify-center px-7 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className="bg-[#16181c] border border-[#22252b] rounded-3xl p-6 w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1c1e22] text-[#22c08c] flex items-center justify-center mx-auto">
            <Smartphone size={26} />
          </div>
          {!phoneStep.sent ? (
            <>
              <div>
                <p className="text-lg font-black">אימות מהיר בטלפון</p>
                <p className="text-[12px] text-[#8a8aa0] mt-1.5 leading-relaxed">
                  פעם אחת בלבד — נשלח קוד למספר שלך, וההתקדמות שלך תישמר גם אם תחליפו טלפון.
                </p>
              </div>
              <input
                value={phoneStep.phone} inputMode="tel" dir="ltr" autoComplete="tel" placeholder="050-1234567"
                onChange={(e) => setPhoneStep((ps) => ({ ...ps, phone: e.target.value }))}
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-base font-bold text-[#eef0f6] text-center placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#22c08c]"
              />
              {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5 justify-center"><AlertTriangle size={14} /> {err}</p>}
              <button disabled={!phoneOk || busy} onClick={sendCode}
                className={`w-full py-3.5 rounded-2xl font-black text-sm ${phoneOk && !busy ? "bg-[#22c08c] text-[#06231a]" : "bg-[#22252b] text-[#b4b4c4]"}`}>
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "שלחו לי קוד"}
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-lg font-black">מה הקוד שקיבלת?</p>
                <p className="text-[12px] text-[#8a8aa0] mt-1.5">נשלח אל {displayIlPhone(normalizeIlPhone(phoneStep.phone))}</p>
              </div>
              <input
                value={phoneStep.code} inputMode="numeric" dir="ltr" autoComplete="one-time-code" placeholder="••••••" maxLength={8}
                onChange={(e) => setPhoneStep((ps) => ({ ...ps, code: e.target.value.replace(/\D/g, "") }))}
                className="w-full bg-[#0c0d10] border border-[#22252b] rounded-2xl px-3.5 py-3 text-xl font-black tracking-[0.4em] text-[#eef0f6] text-center placeholder:tracking-normal placeholder:text-[#b4b4c4] focus:outline-none focus:border-[#22c08c]"
              />
              {err && <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5 justify-center"><AlertTriangle size={14} /> {err}</p>}
              <button disabled={phoneStep.code.length < 4 || busy} onClick={checkCode}
                className={`w-full py-3.5 rounded-2xl font-black text-sm ${phoneStep.code.length >= 4 && !busy ? "bg-[#22c08c] text-[#06231a]" : "bg-[#22252b] text-[#b4b4c4]"}`}>
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "אישור והצטרפות"}
              </button>
              <button disabled={busy || phoneStep.cooldown > 0} onClick={sendCode}
                className="w-full py-2 rounded-xl font-bold text-[12px] text-[#8a8aa0] disabled:opacity-50">
                {phoneStep.cooldown > 0 ? `אפשר לשלוח שוב בעוד ${phoneStep.cooldown} שניות` : "לא הגיע? שלחו שוב"}
              </button>
            </>
          )}
          <button disabled={busy} onClick={() => { setPhoneStep(null); setVerifyToken(null); setErr(""); }}
            className="w-full py-1.5 text-[12px] font-bold text-[#8a8aa0]">
            → חזרה
          </button>
        </div>
      </div>
    );
  }

  if (pendingMatch) {
    return (
      <div className="h-full max-w-md mx-auto flex flex-col items-center justify-center px-7 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <div className="bg-[#16181c] border border-[#22252b] rounded-3xl p-6 w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1c1e22] text-[#6d5efc] flex items-center justify-center mx-auto">
            <UserCheck size={26} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#8a8aa0] mb-1">מצאנו שם דומה בצוות</p>
            <p className="text-lg font-black">זה השם שלך — {pendingMatch.match.name}?</p>
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
        <img src="/icon-512.png" alt="CrewMenu" width="64" height="64"
             className="w-16 h-16 rounded-3xl mx-auto mb-4 shadow-[0_10px_30px_rgba(15,92,70,0.35)]" />
        <h1 className="text-3xl font-black leading-tight">CrewMenu</h1>
        <p className="text-sm text-[#8a8aa0] font-semibold mt-2 leading-relaxed">
          צוות · לומדים את התפריט
        </p>
      </div>

      <form onSubmit={submit} className="flex-1 px-6 pt-4 flex flex-col">
        <div className="bg-[#16181c] border border-[#22252b] rounded-3xl shadow-[0_2px_14px_rgba(30,25,70,0.05)] p-5 space-y-4">
          <p className="text-[12px] font-bold text-[#8a8aa0] px-1">הצטרפות לצוות</p>

          <div>
            <p className="text-[12px] font-bold text-[#8a8aa0] mb-1.5 px-1">קוד הצוות (מהמנהל/ת שלך)</p>
            <input value={teamCode} onChange={(e) => setTeamCode(e.target.value)}
              placeholder="הקוד שקיבלת מהמנהל/ת" dir="ltr" autoComplete="off"
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
          CrewMenu · מאמן תפריט לצוות
        </p>
      </form>
    </div>
  );
}
