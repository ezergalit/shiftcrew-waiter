import { useEffect, useState } from "react";
import { Utensils, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import TeamLogin from "./auth/TeamLogin";
import MainApp from "./screens/MainApp";
import WelcomeTutorial from "./screens/WelcomeTutorial";
import BaselineIntake from "./screens/BaselineIntake";
import { setSessionToken } from "./lib/appSession";

const SESSION_KEY = "menu-app-team-session";
const db = supabase.schema("menu_app");

// "I'll do it later" has to stick, or a waiter who skips gets the same wall on every
// single load. Device-scoped rather than a DB column: the owner should still see that
// this person has no starting score, and a fresh device is a fair place to re-offer it.
const skipKey = (id) => `menu-app-baseline-skipped-${id}`;
const baselineSkipped = (id) => !!id && localStorage.getItem(skipKey(id)) === "1";
const rememberBaselineSkip = (id) => id && localStorage.setItem(skipKey(id), "1");

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | app
  const [session, setSession] = useState(null);
  // Whether this member still owes us a baseline. Unlike showTutorial (a local flag that
  // reappears on a new device), this is derived from the DB column, so the intake happens
  // exactly once per person no matter where they log in.
  const [needsBaseline, setNeedsBaseline] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = localStorage.getItem(SESSION_KEY);
      if (!cached) { if (alive) setPhase("login"); return; }
      let sess;
      try { sess = JSON.parse(cached); } catch { sess = null; }
      if (!sess?.teamMemberId || !sess?.restaurantId) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }

      // TEMP DEV FALLBACK — offline sessions (see auth/TeamLogin.jsx) aren't in the DB,
      // so skip the verification round-trip and trust the cached session as-is.
      if (sess.offline) { if (alive) { setSession(sess); setPhase("app"); } return; }

      try {
        // Verify team member still exists
        const { data, error } = await db.from("team_members")
          .select("id, name, restaurant_id, baseline_taken_at").eq("id", sess.teamMemberId).single();
        if (error || !data) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }
        if (!data.baseline_taken_at && !baselineSkipped(sess.teamMemberId)) {
          const { data: cfg } = await db.from("exam_config")
            .select("baseline_enabled").eq("restaurant_id", sess.restaurantId).maybeSingle();
          // Enabled unless the owner explicitly turned it off — a restaurant that never
          // opened the settings screen still gets the recommended flow.
          if (alive && cfg?.baseline_enabled !== false) setNeedsBaseline(true);
        }
        if (alive) { setSession(sess); setPhase("app"); }
      } catch {
        localStorage.removeItem(SESSION_KEY);
        if (alive) setPhase("login");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (phase === "loading") return <Splash />;
  if (phase === "login") return (
    <TeamLogin onGranted={(sess) => {
      setSession(sess);
      // A brand-new profile has no baseline by definition; a restored one was checked above.
      if (sess.isNew && !sess.offline) setNeedsBaseline(true);
      setPhase("app");
    }} />
  );

  if (session?.showTutorial) {
    const dismissTutorial = () => {
      const next = { ...session, showTutorial: false };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
    };
    return <WelcomeTutorial session={session} onDone={dismissTutorial} />;
  }

  // After the tutorial, before the app: locate the waiter so improvement has a baseline
  // to be measured against. Skippable — a waiter mid-shift shouldn't be trapped here.
  if (needsBaseline) {
    return (
      <BaselineIntake
        session={session}
        onDone={(pct) => {
          // A null pct means they skipped rather than finished; remember that.
          if (pct == null) rememberBaselineSkip(session.teamMemberId);
          setNeedsBaseline(false);
        }}
      />
    );
  }

  return <MainApp session={session} onSignOut={() => { localStorage.removeItem(SESSION_KEY); setSessionToken(null); setPhase("login"); }} />;
}

function Splash() {
  return (
    <div className="h-full max-w-md mx-auto flex flex-col items-center justify-center gap-4 bg-[#0c0d10]" dir="rtl">
      <div className="w-16 h-16 rounded-3xl text-white flex items-center justify-center shadow-[0_10px_30px_rgba(109,94,252,0.35)]"
        style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
        <Utensils size={32} />
      </div>
      <Loader2 size={22} className="animate-spin text-[#b4b4c4]" />
    </div>
  );
}
