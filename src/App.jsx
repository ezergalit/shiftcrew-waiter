import { useEffect, useState } from "react";
import { Utensils, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import TeamLogin from "./auth/TeamLogin";
import MainApp from "./screens/MainApp";

const SESSION_KEY = "menu-app-team-session";
const db = supabase.schema("menu_app");

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | app
  const [session, setSession] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = localStorage.getItem(SESSION_KEY);
      if (!cached) { if (alive) setPhase("login"); return; }
      let sess;
      try { sess = JSON.parse(cached); } catch { sess = null; }
      if (!sess?.teamMemberId || !sess?.restaurantId) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }

      try {
        // Verify team member still exists
        const { data, error } = await db.from("team_members")
          .select("id, name, restaurant_id").eq("id", sess.teamMemberId).single();
        if (error || !data) { localStorage.removeItem(SESSION_KEY); if (alive) setPhase("login"); return; }
        if (alive) { setSession(sess); setPhase("app"); }
      } catch {
        localStorage.removeItem(SESSION_KEY);
        if (alive) setPhase("login");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (phase === "loading") return <Splash />;
  if (phase === "login") return <TeamLogin onGranted={(sess) => { setSession(sess); setPhase("app"); }} />;

  return <MainApp session={session} onSignOut={() => { localStorage.removeItem(SESSION_KEY); setPhase("login"); }} />;
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
