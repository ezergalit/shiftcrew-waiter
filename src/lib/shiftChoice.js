// Which shift the waiter is on today (user request, 2026-08-20).
//
// The manager writes one checklist per phase — opening, closing, general shift chores —
// and until now every waiter saw all of them. A waiter opening the restaurant has no use
// for "count the register and mop the bar", and a closer shouldn't be told to set up the
// stations. So the app asks once a day which shift this is, and the answer decides which
// of the manager's tasks appear.
//
// Stored per member and stamped with the date: the answer is about *today*, so tomorrow
// the question comes back rather than silently carrying yesterday's shift over.
const KEY = "menu-app-shift";
const ROLE_KEY = "menu-app-role";

export const SHIFTS = [
  { id: "opening", label: "משמרת פתיחה", short: "פתיחה", hint: "פותחים את המסעדה" },
  { id: "closing", label: "משמרת ערב", short: "ערב", hint: "סוגרים את המסעדה" },
  { id: "none", label: "לא עובד/ת היום", short: "לא במשמרת", hint: "רק לומדים" },
];

export const shiftLabel = (id) => SHIFTS.find((s) => s.id === id)?.short || "";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function loadShift(memberId) {
  if (!memberId) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(`${KEY}-${memberId}`) || "null");
    return raw && raw.date === today() ? raw.shift : null;
  } catch { return null; }
}

export function saveShift(memberId, shift) {
  if (!memberId) return;
  try { localStorage.setItem(`${KEY}-${memberId}`, JSON.stringify({ shift, date: today() })); } catch { /* full or blocked */ }
}

// Which of the manager's task kinds belong to which answer.
//   opening / closing — the phase checklists, one shift each.
//   shift / weekly / monthly — chores that belong to whoever is working today.
//   training and anything unknown — always shown; they are not tied to a shift at all.
// ⚠️ Unknown kinds default to VISIBLE. A new kind added on the manager side must never
// vanish from the waiter's screen because this file hasn't heard of it yet.
export function taskFitsShift(kind, shift) {
  if (kind === "opening") return shift === "opening";
  if (kind === "closing") return shift === "closing";
  if (kind === "shift" || kind === "weekly" || kind === "monthly") return shift !== "none";
  return true;
}

// The waiter's role — waiter or bartender (user, 2026-08-20). Unlike the shift, a role
// is stable, so it is stored WITHOUT a date and only asked once; it can be changed any
// time from the same chip that changes the shift.
export const ROLES = [
  { id: "waiter", label: "מלצר/ית", hint: "משימות הרצפה" },
  { id: "bar", label: "ברמן/ית", hint: "משימות הבר" },
];

export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label || "";

export function loadRole(memberId) {
  if (!memberId) return null;
  try { return localStorage.getItem(`${ROLE_KEY}-${memberId}`) || null; } catch { return null; }
}

export function saveRole(memberId, role) {
  if (!memberId) return;
  try { localStorage.setItem(`${ROLE_KEY}-${memberId}`, role); } catch { /* full or blocked */ }
}

// A task tagged for a role is shown only to that role; an untagged task (NULL — every
// task that existed before the column) is for everyone. Unknown role values on the task
// default to visible, same rule as unknown kinds.
export function taskFitsRole(taskRole, myRole) {
  if (!taskRole) return true;
  if (taskRole !== "waiter" && taskRole !== "bar") return true;
  return taskRole === myRole;
}
