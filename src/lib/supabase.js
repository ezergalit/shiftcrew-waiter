import { createClient } from "@supabase/supabase-js";

// ONE Supabase client for the whole Menu Trainer team app. No auth — the team
// app uses code-based join (team_code + name) against the isolated `menu_app`
// schema. Session is a plain localStorage record, not a Supabase auth session.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
