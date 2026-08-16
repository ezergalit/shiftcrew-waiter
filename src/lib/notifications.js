// Daily study reminder via native local notifications. Scheduled on-device —
// no server, no APNs key, works offline. No-ops on web like lib/haptics.js,
// so callers never need a platform check.
//
// Remote push (e.g. "בריף חדש מהמנהל") is a separate, server-side project that
// needs an APNs key from the Apple Developer account; this file is only the
// local layer.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const native = Capacitor.isNativePlatform();

// One fixed id so re-scheduling replaces rather than stacks.
const REMINDER_ID = 2101;

// 11:00 — after the openers' rush, early enough to study before an evening
// shift. Becomes per-restaurant configurable when exam_config grows a field.
const REMINDER_HOUR = 11;

export async function ensureDailyReminder() {
  if (!native) return;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === "prompt" || perm.display === "prompt-with-rationale") {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_ID,
        title: "כמה דקות על התפריט? 🍽️",
        body: "5 דקות לפני המשמרת — ומגיעים בטוחים לשירות.",
        schedule: { on: { hour: REMINDER_HOUR, minute: 0 }, allowWhileIdle: true },
      }],
    });
  } catch {
    // A failed reminder must never break login.
  }
}

export async function cancelDailyReminder() {
  if (!native) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {}
}
