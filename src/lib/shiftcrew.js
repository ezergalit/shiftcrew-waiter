import { createClient } from "@supabase/supabase-js";

// ShiftCrew waiter data lives in its OWN isolated Postgres schema
// (shiftcrew_waiter) inside the shared shiftmatch project — completely separate
// from ShiftMatch's production tables in `public`. ONE base client (no auth: the
// waiter app has no login at all), schema-pinned views derived from it:
//   • scWaiter      → reads the menu the owner published + the leaderboard.
//   • scOwnerPublic → calls the owner-schema RPC that grants access by phone.
// The waiter app can therefore only ever touch the two ShiftCrew schemas.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

const base = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const scWaiter = base.schema("shiftcrew_waiter");
export const scOwnerPublic = base.schema("shiftcrew_owner");

// The signed-in waiter's display name. It's a LIVE binding: setMe() updates it
// after a successful phone-access check, and every importer (e.g. the leaderboard
// "this is me" match) sees the new value. Defaults to the seeded demo waiter.
export let ME_NAME = "נועה לוי";
export function setMe(name) {
  if (name && name.trim()) ME_NAME = name.trim();
}

// localStorage key for the granted waiter session (there is no auth token — access
// is purely "is this phone on the owner's roster", re-checkable on every load).
export const ACCESS_KEY = "shiftcrew-waiter-access";

// Normalize an Israeli phone the SAME way the DB norm_phone() does, so the value
// we cache/compare client-side matches what the roster check used.
export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

// Ask the owner schema whether this phone is on a restaurant's roster. Returns the
// matched access row { staff_id, restaurant_id, restaurant_name, waiter_name, role }
// or null if the number isn't authorized.
export async function checkWaiterAccess(phone) {
  const { data, error } = await scOwnerPublic.rpc("waiter_access", { p_phone: phone });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}
