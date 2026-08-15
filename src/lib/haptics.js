// Native haptic feedback (iOS/Android via Capacitor). No-ops silently on web,
// so game code calls these unconditionally — no platform checks at call sites.
//
// Part of the "real native app" story for App Store review (Guideline 4.2):
// answers in graded games get the system success/error haptic.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const native = Capacitor.isNativePlatform();

// Success/error thud on a graded answer. Fire-and-forget: a haptic failure must
// never surface into game flow.
export const hapticAnswer = (correct) => {
  if (!native) return;
  Haptics.notification({ type: correct ? NotificationType.Success : NotificationType.Error }).catch(() => {});
};

// Light tap for small interactions (card flip, selection).
export const hapticTap = () => {
  if (!native) return;
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
};
