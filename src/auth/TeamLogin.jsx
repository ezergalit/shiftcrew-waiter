import { useState } from "react";
import { Loader2, AlertTriangle, UserCheck, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { setSessionToken } from "../lib/appSession";
import "../aurora.css";

const SESSION_KEY = "menu-app-team-session";
const db = supabase.schema("menu_app");

// The join screen is the first thing a waiter ever sees, and it was the one screen left
// outside the aurora look — flat panels that, once theme.css mapped every hex class onto
// restaurant tokens, lost their backgrounds entirely (user, 16.9: "looking bad"). It now
// uses the same backdrop as the menu right behind it, with the form in one lit card.
// ⚠️ Colours below are rgba()/gradients/non-mapped hex on purpose: a new `bg-[#22c08c]/NN`-style
// class would need tools/gen-theme-css.mjs re-run, and `npm run check` fails until it is.
// 16px+ text in every input: below that iOS Safari zooms the page on focus.
const FIELD_BASE = "w-full rounded-2xl px-4 text-[#eef0f6] bg-[rgba(12,13,16,0.55)] border border-[rgba(238,240,246,0.10)] placeholder:text-[rgba(238,240,246,0.28)] placeholder:font-normal outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-[rgba(34,192,140,0.65)] focus:bg-[rgba(34,192,140,0.06)] focus:shadow-[0_0_0_4px_rgba(34,192,140,0.14)]";
const FIELD = `${FIELD_BASE} h-[52px] text-[16px] font-semibold`;
const CODE_FIELD = `${FIELD_BASE} h-[60px] text-[21px] font-bold text-center tracking-[0.32em] placeholder:text-[15px] placeholder:tracking-normal`;
const LABEL = "block text-[13px] font-medium text-[#8a919e] mb-2 px-1";
const primaryButton = (ready) => `w-full h-[56px] rounded-2xl text-[17px] font-bold flex items-center justify-center gap-2 transition-[transform,box-shadow,opacity] duration-200 active:scale-[0.98] ${
  ready
    ? "bg-[linear-gradient(180deg,#35d8a2,#1faf80)] text-[#06231a] shadow-[0_14px_32px_rgba(34,192,140,0.34),inset_0_1px_0_rgba(255,255,255,0.28)]"
    : "bg-[rgba(238,240,246,0.07)] text-[rgba(238,240,246,0.35)] cursor-not-allowed"
}`;

function AuroraScreen({ children }) {
  return (
    <div className="aurora-skin h-full flex flex-col text-[#eef0f6]" dir="rtl">
      <div className="aurora" aria-hidden><i></i><i></i><i></i><i></i></div>
      <div className="grain" aria-hidden></div>
      {children}
    </div>
  );
}

// The card the form sits in: frosted glass, an emerald hairline along the top edge and a faint
// emerald glow under it, so the one thing to fill in reads as the lit object on a dark page.
function FormCard({ icon, title, subtitle, children }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] p-[22px] bg-[linear-gradient(160deg,rgba(40,46,54,0.80),rgba(19,22,27,0.66))] border border-[rgba(238,240,246,0.09)] backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(238,240,246,0.07)]">
      <div aria-hidden className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(34,192,140,0.75),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full bg-[radial-gradient(closest-side,rgba(34,192,140,0.16),transparent)]" />
      <div className="relative space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center text-[#22c08c] bg-[rgba(34,192,140,0.12)] border border-[rgba(34,192,140,0.28)]">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold leading-tight">{title}</h2>
            {subtitle && <p className="text-[13px] text-[#8a919e] mt-0.5 leading-snug">{subtitle}</p>}
          </div>
        </div>
        <div aria-hidden className="h-px bg-[rgba(238,240,246,0.07)]" />
        {children}
      </div>
    </div>
  );
}


// The whole join flow — restaurant lookup, roster fuzzy-match (the "יותם עזר" vs
// "יותם אזר" case), member creation — now runs server-side in menu_app.team_join,
// which is also what mints the session token RLS checks on every later request.
// The client only renders the three outcomes: ok / confirm / bad_code.

export default function TeamLogin({ onGranted }) {
  const [teamCode, setTeamCode] = useState("");
  // הקוד שהמנהל בוחר הוא תמיד אותיות גדולות וספרות (`^[A-Z0-9]{4,12}$` בשרת), ומלצר
  // שמקליד בטלפון מקבל אות קטנה או מקלדת עברית — ואז «הקוד לא נמצא» על קוד נכון
  // לגמרי (יותם, 14.9). השדה מתקן בעצמו: אנגלית עולה לאותיות גדולות, וכל תו שאינו
  // A-Z/0-9 פשוט לא נכנס. ⚠️ תו שנזרק בשקט נראה כמו מקלדת תקועה, ולכן עברית מציגה
  // שורת הסבר במקום להיעלם בלי אומר.
  const [hebrewTyped, setHebrewTyped] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // When a near-duplicate name is found, pause here for a yes/no before committing.
  const [pendingMatch, setPendingMatch] = useState(null); // { rest, match, typedFirst, typedLast }

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

  const join = (extra = {}) => db.rpc("team_join", {
    p_team_code: teamCode.trim(),
    p_first: firstName.trim(),
    p_last: lastName.trim(),
    ...extra,
  });

  const submit = async (e) => {
    e?.preventDefault();
    const first = firstName.trim(), last = lastName.trim();
    if (!first || !last) { setErr("צריך שם פרטי ושם משפחה כדי להתחבר."); return; }
    setBusy(true);
    setErr("");

    try {
      const { data, error } = await join();

      if (error || !data) {
        // 🔴 No offline fallback (5.9). Until now any failure here — network, RLS, a dead
        // database — minted an `offline:true` session that was persisted, restored on every
        // launch without a check, and showed the hard-coded demo menu of the old Salon to
        // every restaurant, forever, until a manual sign-out. A failed join is a failed join:
        // say so, and let the waiter try again.
        console.warn("[TeamLogin] team_join failed:", error);
        setErr("אין חיבור לשרת כרגע. בדקו את האינטרנט ונסו שוב.");
        return;
      }

      if (data.status === "bad_code") { setErr("קוד הצוות לא נמצא. אפשר לבדוק אותו מול המנהל/ת."); return; }
      if (data.status === "bad_name") { setErr("צריך שם פרטי ושם משפחה כדי להתחבר."); return; }

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
      if (error || data?.status !== "ok") throw error || new Error(data?.status);
      finishLogin(data);
    } catch (e2) {
      console.error(e2);
      setErr("משהו השתבש. אפשר לנסות שוב.");
      setBusy(false);
    }
  };

  if (pendingMatch) {
    return (
      <AuroraScreen>
        <div className="flex-1 flex flex-col justify-center px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <FormCard icon={<UserCheck size={20} />} title="מצאנו שם דומה בצוות" subtitle="רק לוודא שזה את/ה">
            <p className="text-[21px] font-bold leading-snug text-center">זה השם שלך — {pendingMatch.match.name}?</p>
            <p className="text-[13px] text-[#8a919e] leading-relaxed text-center">אם כן, נמשיך עם ההתקדמות הקיימת שלך. אם זה מישהו אחר, ניצור פרופיל חדש.</p>
            <div className="flex flex-col gap-2 pt-1">
              <button disabled={busy} onClick={() => confirmMatch(true)} className={primaryButton(true)}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : "כן, זה אני"}
              </button>
              <button disabled={busy} onClick={() => confirmMatch(false)}
                className="w-full h-[52px] rounded-2xl text-[15px] font-semibold text-[#eef0f6] bg-[rgba(238,240,246,0.06)] border border-[rgba(238,240,246,0.10)] transition-transform active:scale-[0.98]">
                לא, זה שם אחר
              </button>
            </div>
          </FormCard>
        </div>
      </AuroraScreen>
    );
  }

  const canSubmit = teamCode.trim() && firstName.trim() && lastName.trim() && !busy;

  return (
    <AuroraScreen>
      <form onSubmit={submit} className="flex-1 overflow-y-auto flex flex-col px-6 pt-[calc(env(safe-area-inset-top,0px)+4rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <div className="text-center mb-8">
          <div className="relative w-[76px] h-[76px] mx-auto mb-5">
            <div className="absolute -inset-5 rounded-full bg-[radial-gradient(circle,rgba(34,192,140,0.28),transparent_68%)]" aria-hidden />
            <img src="/icon-512.png" alt="CrewMenu" width="76" height="76"
              className="relative w-full h-full rounded-[24px] border border-[rgba(238,240,246,0.12)] shadow-[0_18px_40px_rgba(0,0,0,0.45)]" />
          </div>
          <h1 className="text-[32px] font-extrabold leading-none tracking-tight">CrewMenu</h1>
          <p className="text-[14px] text-[#8a919e] mt-3">צוות · לומדים את התפריט</p>
        </div>

        <FormCard icon={<Users size={20} />} title="הצטרפות לצוות" subtitle="קוד מהמנהל/ת ושם מלא — וזהו">
          <div>
            <label htmlFor="team-code" className={LABEL}>קוד הצוות</label>
            <input id="team-code" value={teamCode}
              onChange={(e) => {
                const raw = e.target.value;
                setHebrewTyped(/[\u0590-\u05FF]/.test(raw));
                setTeamCode(raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
              }}
              placeholder="הקוד שקיבלת מהמנהל/ת" dir="ltr" autoComplete="off"
              inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              className={CODE_FIELD} />
            {hebrewTyped && (
              <p className="text-[12px] text-[#e8b93e] mt-2 px-1 leading-relaxed">
                הקוד באותיות אנגליות ובספרות בלבד — אפשר להחליף שפה במקלדת.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="team-first" className={LABEL}>שם פרטי</label>
              <input id="team-first" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                placeholder="דנה" dir="rtl" autoComplete="given-name"
                className={`${FIELD} text-right`} />
            </div>
            <div>
              <label htmlFor="team-last" className={LABEL}>שם משפחה</label>
              <input id="team-last" value={lastName} onChange={(e) => setLastName(e.target.value)}
                placeholder="כהן" dir="rtl" autoComplete="family-name"
                className={`${FIELD} text-right`} />
            </div>
          </div>

          {err && (
            <div role="alert" className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[rgba(229,72,77,0.10)] border border-[rgba(229,72,77,0.30)] text-[13px] leading-relaxed text-[#f27d8d]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className={primaryButton(canSubmit)}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> בודק…</> : "הצטרפות"}
          </button>
        </FormCard>

        <p className="mt-auto pt-10 text-center text-[12px] leading-relaxed text-[#6b7280]">
          אין קוד? מבקשים אותו מהמנהל/ת במסעדה.
        </p>
      </form>
    </AuroraScreen>
  );
}
