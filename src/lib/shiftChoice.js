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
const GENDER_KEY = "menu-app-gender";
const DAILY_ROLE_KEY = "menu-app-role-today";

export const SHIFTS = [
  { id: "opening", label: "משמרת פתיחה", short: "פתיחה", hint: "פותחים את המסעדה" },
  { id: "closing", label: "משמרת ערב", short: "ערב", hint: "סוגרים את המסעדה" },
  // Not a "not working" answer any more (user, 2026-08-22): someone without an opening
  // or closing shift still gets the daily update — they just see no phase checklists.
  { id: "none", label: "בלי משמרת", short: "בלי משמרת", hint: "רק לימוד ועדכון יומי" },
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

// The waiter's role — waiter, bartender, or both (user, 2026-08-22). The role is part
// of the one-time PROFILE (asked at first entry, never again): asking it every day was
// noise for the 90% whose role never changes. The exception is "both" — someone who
// works both positions genuinely has a different answer each day, so only for them the
// daily gate asks which hat today.
export const ROLES = [
  { id: "waiter", label: "מלצר/ית", hint: "משימות הרצפה" },
  { id: "bar", label: "ברמן/ית", hint: "משימות הבר" },
];
export const PROFILE_ROLES = [
  ...ROLES,
  { id: "both", label: "גם וגם", hint: "נשאל בכל יום" },
];

export const GENDERS = [
  { id: "m", label: "זכר" },
  { id: "f", label: "נקבה" },
];

export function loadGender(memberId) {
  if (!memberId) return null;
  try { return localStorage.getItem(`${GENDER_KEY}-${memberId}`) || null; } catch { return null; }
}
export function saveGender(memberId, g) {
  if (!memberId) return;
  try { localStorage.setItem(`${GENDER_KEY}-${memberId}`, g); } catch { /* full or blocked */ }
  setCurrentGender(g);
}

// Today's resolved role for a "both" profile — date-stamped like the shift, so the
// question comes back tomorrow instead of silently carrying yesterday's answer.
export function loadDailyRole(memberId) {
  if (!memberId) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(`${DAILY_ROLE_KEY}-${memberId}`) || "null");
    return raw && raw.date === today() ? raw.role : null;
  } catch { return null; }
}
export function saveDailyRole(memberId, role) {
  if (!memberId) return;
  try { localStorage.setItem(`${DAILY_ROLE_KEY}-${memberId}`, JSON.stringify({ role, date: today() })); } catch { /* full or blocked */ }
}

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

// ── Gendered copy ────────────────────────────────────────────────────────────────────
// The profile knows the waiter's gender, so the slash forms ("הקש/י") can render as the
// real word. Token map only — a generic ".../י" regex would also mangle "המנהל/ת",
// which is the MANAGER's gender, not the waiter's, and must stay as written.
let currentGender = null;
export const setCurrentGender = (g) => { currentGender = g === "m" || g === "f" ? g : null; };

const GENDER_TOKENS = {
  "הקש/י": ["הקש", "הקשי"],
  "בחר/י": ["בחר", "בחרי"],
  "נסה/י": ["נסה", "נסי"],
  "כתוב/כתבי": ["כתוב", "כתבי"],
  "כשתכיר/י": ["כשתכיר", "כשתכירי"],
  "מוכנ/ה": ["מוכן", "מוכנה"],
  "מכיר/ה": ["מכיר", "מכירה"],
  "בוא/י": ["בוא", "בואי"],
  "עומד/ת": ["עומד", "עומדת"],
  "עובד/ת": ["עובד", "עובדת"],
  "את/ה": ["אתה", "את"],
  "מלצר/ית": ["מלצר", "מלצרית"],
  "ברמן/ית": ["ברמן", "ברמנית"],
  "שולט/ת": ["שולט", "שולטת"],
  "בטוח/ה": ["בטוח", "בטוחה"],
};

export function gz(text) {
  if (!currentGender || !text || typeof text !== "string") return text;
  const idx = currentGender === "m" ? 0 : 1;
  let out = text;
  for (const [token, forms] of Object.entries(GENDER_TOKENS)) out = out.split(token).join(forms[idx]);
  return out;
}
