import { createClient } from "@supabase/supabase-js";

// ONE Supabase client for the whole Menu Trainer team app. No auth — the team
// app uses code-based join (team_code + name) against the isolated `menu_app`
// schema. Session is a plain localStorage record, not a Supabase auth session.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
