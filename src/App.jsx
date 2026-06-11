import { useEffect, useState } from "react";
import { Utensils, Loader2 } from "lucide-react";
import { checkWaiterAccess, setMe, ACCESS_KEY } from "./lib/shiftcrew";
import WaiterLogin from "./auth/WaiterLogin";
import MainApp from "./screens/MainApp";

// ─────────────────────────────────────────────────────────────────────────────
// App — the waiter shell. There is NO password auth. Access is "is this phone on
// the owner's roster", so we treat the cached phone as the session and RE-VERIFY
// it against the roster on every launch. That way, if the owner removes/suspends a
// waiter, the next time they open the app they're locked out. Flow:
//   loading → re-verify cached phone → app (if still on roster) / login (if not)
//           → no cache → WaiterLogin (phone entry)
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | login | app
  const [waiter, setWaiter] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = localStorage.getItem(ACCESS_KEY);
      if (!raw) { if (alive) setPhase("login"); return; }
      let cached;
      try { cached = JSON.parse(raw); } catch { cached = null; }
      if (!cached?.phone) { localStorage.removeItem(ACCESS_KEY); if (alive) setPhase("login"); return; }
      try {
        // Re-check the roster — enforces owner revocation / name changes.
        const row = await checkWaiterAccess(cached.phone);
        if (!alive) return;
        if (!row) { localStorage.removeItem(ACCESS_KEY); setPhase("login"); return; }
        const session = {
          phone: cached.phone,
          staffId: row.staff_id,
          restaurantId: row.restaurant_id,
          restaurantName: row.restaurant_name,
          name: row.waiter_name,
          role: row.role,
        };
        localStorage.setItem(ACCESS_KEY, JSON.stringify(session));
        setMe(session.name);
        setWaiter(session);
        setPhase("app");
      } catch (err) {
        // Network hiccup — fall back to the cached identity rather than locking out.
        console.error("[shiftcrew] access re-check failed, using cache:", err);
        if (!alive) return;
        setMe(cached.name);
        setWaiter(cached);
        setPhase("app");
      }
    })();
    return () => { alive = false; };
  }, []);

  const onGranted = (session) => { setWaiter(session); setPhase("app"); };

  const onSignOut = () => {
    localStorage.removeItem(ACCESS_KEY);
    setWaiter(null);
    setPhase("login");
  };

  if (phase === "loading") return <Splash />;
  if (phase === "login") return <WaiterLogin onGranted={onGranted} />;
  return <MainApp waiter={waiter} onSignOut={onSignOut} />;
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
