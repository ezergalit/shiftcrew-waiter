import { createClient } from "@supabase/supabase-js";

// ONE Supabase client for the whole Menu Trainer team app. No auth — the team
// app uses code-based join (team_code + name) against the isolated `menu_app`
// schema. Session is a plain localStorage record, not a Supabase auth session.
// 2026-09-03: the original Supabase project (huwcyedlbcrugpbdcsdo) vanished and was
// rebuilt as a new project under our own org. Hardcoded on purpose: the Vercel
// projects still carry the OLD VITE_SUPABASE_* env vars in an org we can't edit,
// so env values must not win here. The anon key is public by design (RLS is the gate).
const url = "https://qwgbyeapzzeybmndrszw.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Z2J5ZWFwenpleWJtbmRyc3p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzE4OTAsImV4cCI6MjEwNDAwNzg5MH0.cmVR44V98ZWtbovrCB530I97sZD6kNVG7HgkadLeuM8";

// Every request carries the app-session token (see lib/appSession.js) in an
// x-app-session header. RLS policies resolve it server-side to a restaurant +
// team member — that lookup is the real access control; the .eq() filters in
// app code are just ergonomics. Read from localStorage on each call (not
// captured once) so login/logout take effect without recreating the client.
const sessionFetch = (input, init = {}) => {
  const token = (() => {
    try { return localStorage.getItem("menu-app-session-token"); } catch { return null; }
  })();
  if (token) {
    const headers = new Headers(init.headers || {});
    headers.set("x-app-session", token);
    init = { ...init, headers };
  }
  return fetch(input, init);
};

export const supabase = createClient(url, key, {
  global: { fetch: sessionFetch },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
