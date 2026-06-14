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

// ─── Menu progress (real mastery, persisted per waiter) ──────────────────────
// menu_progress rows: { waiter_id, source_item_id, mastery (0-5), last_reviewed }.
// We treat mastery >= 4 as "mastered". Keyed/upserted on (waiter_id, source_item_id).
export async function loadMastered(staffId) {
  if (!staffId) return [];
  const { data, error } = await scWaiter
    .from("menu_progress")
    .select("source_item_id, mastery")
    .eq("waiter_id", staffId);
  if (error) { console.error("[shiftcrew] loadMastered:", error); return []; }
  return (data || []).filter((r) => (r.mastery ?? 0) >= 4).map((r) => r.source_item_id);
}

export async function saveMastery(staffId, sourceItemId, mastery = 5) {
  if (!staffId || !sourceItemId) return;
  const { error } = await scWaiter
    .from("menu_progress")
    .upsert(
      { waiter_id: staffId, source_item_id: sourceItemId, mastery, last_reviewed: new Date().toISOString() },
      { onConflict: "waiter_id,source_item_id" }
    );
  if (error) console.error("[shiftcrew] saveMastery:", error);
}

// ─── Leaderboard (real, restaurant-scoped, staff-keyed) ──────────────────────
export async function loadLeaderboard(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await scWaiter
    .from("leaderboard")
    .select("staff_id, waiter_name, points, mastered_count, streak, today_count, last_study_date")
    .eq("restaurant_id", restaurantId)
    .order("points", { ascending: false });
  if (error) { console.error("[shiftcrew] loadLeaderboard:", error); return []; }
  return data || [];
}

// Recompute this waiter's leaderboard row from their real mastered count.
// points = mastered_count * 100. Streak/today are best-effort by last_study_date.
export async function upsertLeaderboard(restaurantId, staffId, waiterName, masteredCount) {
  if (!restaurantId || !staffId) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data: prev } = await scWaiter
    .from("leaderboard")
    .select("streak, last_study_date, today_count, mastered_count")
    .eq("restaurant_id", restaurantId)
    .eq("staff_id", staffId)
    .maybeSingle();

  let streak = 1, todayCount = 1;
  if (prev) {
    const last = prev.last_study_date;
    if (last === today) { streak = prev.streak || 1; todayCount = (prev.today_count || 0) + 1; }
    else {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      streak = last === y ? (prev.streak || 0) + 1 : 1;
      todayCount = 1;
    }
  }
  const { error } = await scWaiter
    .from("leaderboard")
    .upsert(
      {
        restaurant_id: restaurantId, staff_id: staffId, waiter_name: waiterName || "מלצר/ית",
        points: masteredCount * 100, mastered_count: masteredCount,
        streak, today_count: todayCount, last_study_date: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,staff_id" }
    );
  if (error) console.error("[shiftcrew] upsertLeaderboard:", error);
}

// ─── Shift swaps (open request → teammate claims) ────────────────────────────
export async function loadSwaps(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await scWaiter
    .from("shift_swaps")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  if (error) { console.error("[shiftcrew] loadSwaps:", error); return []; }
  return data || [];
}

export async function createSwap(swap) {
  const { data, error } = await scWaiter
    .from("shift_swaps")
    .insert({ ...swap, status: "open" })
    .select("*")
    .single();
  if (error) { console.error("[shiftcrew] createSwap:", error); throw error; }
  return data;
}

export async function claimSwap(swapId, staffId, name) {
  const { error } = await scWaiter
    .from("shift_swaps")
    .update({ status: "claimed", claimed_by_staff_id: staffId, claimed_by_name: name, updated_at: new Date().toISOString() })
    .eq("id", swapId)
    .eq("status", "open");
  if (error) { console.error("[shiftcrew] claimSwap:", error); throw error; }
}

export async function cancelSwap(swapId) {
  const { error } = await scWaiter
    .from("shift_swaps")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", swapId);
  if (error) { console.error("[shiftcrew] cancelSwap:", error); throw error; }
}

// ─── Role-gated management (admin / scheduler / menu_manager) ─────────────────
// Role-holders open this SAME no-password team app; their staff.access_role unlocks
// management screens that write to the OWNER schema (shiftcrew_owner). This is safe
// and ShiftMatch-isolated: anon already holds full DML on the shiftcrew_owner tables
// plus EXECUTE on publish_week / publish_schedule (both SECURITY DEFINER), so no new
// auth user is created and ShiftMatch's `public` schema is never touched. The UI is
// gated by access_role; these helpers are the only write surface they use.

const ACCESS_ROLE_KEYS = ["waiter", "scheduler", "menu_manager", "admin"];

// ADMIN — staff roster CRUD (add/remove/suspend a teammate, set their access role).
export async function loadStaffRoster(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await scOwnerPublic
    .from("staff").select("*").eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });
  if (error) { console.error("[shiftcrew] loadStaffRoster:", error); return []; }
  return data || [];
}

export async function addStaff(restaurantId, { name, phone, role, accessRole }) {
  const p = normPhone(phone);
  const ar = ACCESS_ROLE_KEYS.includes(accessRole) ? accessRole : "waiter";
  const { data, error } = await scOwnerPublic
    .from("staff")
    .insert({
      restaurant_id: restaurantId, phone: p,
      name: (name || "").trim() || p, role: role || "מלצר/ית",
      access_role: ar, active: true,
    })
    .select("*").single();
  if (error) throw error;
  return data;
}

export async function setStaffActive(id, active) {
  const { error } = await scOwnerPublic.from("staff").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function setStaffAccessRole(id, accessRole) {
  const ar = ACCESS_ROLE_KEYS.includes(accessRole) ? accessRole : "waiter";
  const { error } = await scOwnerPublic.from("staff").update({ access_role: ar }).eq("id", id);
  if (error) throw error;
}

export async function removeStaff(id) {
  const { error } = await scOwnerPublic.from("staff").delete().eq("id", id);
  if (error) throw error;
}

// MENU MANAGER — edit the menu/dishes (and the questions about them, which are
// derived from each dish's ingredients/allergens/price), then publish to the team.
export async function loadMenuItems(restaurantId) {
  if (!restaurantId) return [];
  const { data, error } = await scOwnerPublic
    .from("menu_items").select("*").eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });
  if (error) { console.error("[shiftcrew] loadMenuItems:", error); return []; }
  return data || [];
}

export async function saveMenuItem(restaurantId, item) {
  const payload = {
    category: item.category || "mains",
    name: (item.name || "").trim(),
    price: Number(item.price) || 0,
    description: item.description || "",
    ingredients: Array.isArray(item.ingredients) ? item.ingredients.filter(Boolean) : [],
    allergens: Array.isArray(item.allergens) ? item.allergens.filter(Boolean) : [],
    is_special: !!item.is_special,
  };
  if (item.id) {
    const { data, error } = await scOwnerPublic
      .from("menu_items").update(payload).eq("id", item.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await scOwnerPublic
    .from("menu_items").insert({ ...payload, restaurant_id: restaurantId }).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteMenuItem(id) {
  const { error } = await scOwnerPublic.from("menu_items").delete().eq("id", id);
  if (error) throw error;
}

export async function publishMenu(restaurantId) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await scOwnerPublic
    .rpc("publish_week", { p_restaurant_id: restaurantId, p_week_start: today });
  if (error) throw error;
}

// SCHEDULER — build & publish the weekly schedule. The draft is a flat list of
// assignment rows persisted on schedule_weeks.assignments; publishing snapshots the
// expanded rows into the waiter app via the cross-schema publish_schedule RPC.
export async function loadScheduleDraft(restaurantId, weekIso) {
  if (!restaurantId || !weekIso) return { assignments: {}, status: "draft" };
  const { data, error } = await scOwnerPublic
    .from("schedule_weeks").select("assignments,status")
    .eq("restaurant_id", restaurantId).eq("week_start", weekIso).maybeSingle();
  if (error) { console.error("[shiftcrew] loadScheduleDraft:", error); return { assignments: {}, status: "draft" }; }
  return data || { assignments: {}, status: "draft" };
}

export async function saveScheduleDraft(restaurantId, weekIso, assignments) {
  if (!restaurantId) throw new Error("missing restaurant id");
  const { error } = await scOwnerPublic
    .from("schedule_weeks")
    .upsert(
      { restaurant_id: restaurantId, week_start: weekIso, assignments, status: "draft" },
      { onConflict: "restaurant_id,week_start" }
    );
  if (error) throw error;
}

// rows: [{ day, label, name, from, to, position, color }] — expanded filled shifts.
export async function publishScheduleRows(restaurantId, weekIso, rows) {
  if (!restaurantId) throw new Error("missing restaurant id");
  const { error } = await scOwnerPublic
    .rpc("publish_schedule", { p_restaurant_id: restaurantId, p_week_start: weekIso, p_rows: rows });
  if (error) throw error;
}
