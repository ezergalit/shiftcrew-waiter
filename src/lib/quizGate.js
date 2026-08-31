// שני שערי הזמן של הבוחן (יותם, 30.8): לפני הבוחן הראשון של קטגוריה צריך
// לפחות 5 דקות תרגול כרטיסיות בה, ואחרי כישלון — רבע שעה תרגול נוספות לפני
// גישה חוזרת. שני השערים נמדדים בזמן לימוד בפועל (שניות שבהן קלף של הקטגוריה
// על המסך), לא בשעון קיר — המתנה בלי ללמוד לא פותחת כלום.
//
// ⚠️ הזמן נצבר ב-localStorage פר-חבר-צוות, לא ב-DB. זה שער הרגל, לא שער
// אבטחה: החלפת מכשיר מאפסת אותו והמלצר פשוט יתרגל שוב 5 דקות. הכישלון עצמו
// כן רשום ב-exam_results — רק מונה הדקות מקומי.
//
// Storage shape: { [category]: { s: totalStudySeconds, fs: secondsSinceLastFail, f: failedAtMs } }

export const PRE_STUDY_S = 5 * 60;
export const RETRY_STUDY_S = 15 * 60;

// In-memory fallback so the pure logic is testable under plain node.
const mem = new Map();
const store = {
  get(k) {
    try { if (typeof localStorage !== "undefined") return localStorage.getItem(k); } catch { /* private mode */ }
    return mem.get(k) ?? null;
  },
  set(k, v) {
    try { if (typeof localStorage !== "undefined") { localStorage.setItem(k, v); return; } } catch { /* full/blocked */ }
    mem.set(k, v);
  },
};

const key = (memberId) => `menu-app-quiz-gate:${memberId}`;

function load(memberId) {
  try { return JSON.parse(store.get(key(memberId))) || {}; } catch { return {}; }
}
function save(memberId, g) { store.set(key(memberId), JSON.stringify(g)); }

export function bumpStudy(memberId, category, secs = 1) {
  if (!memberId || !category) return;
  const g = load(memberId);
  const rec = g[category] || { s: 0, fs: 0 };
  rec.s += secs;
  rec.fs += secs;
  g[category] = rec;
  save(memberId, g);
}

export function noteFail(memberId, category) {
  if (!memberId || !category) return;
  const g = load(memberId);
  const rec = g[category] || { s: 0, fs: 0 };
  rec.fs = 0;
  rec.f = Date.now();
  g[category] = rec;
  save(memberId, g);
}

// { open: true } | { open: false, reason: "pre" | "cooldown", needS, needMin }
// A passed category is never gated: retaking a quiz you already passed is voluntary
// review, and the pass is what scope and points key off.
export function gateFor(memberId, category, { passed } = {}) {
  if (passed || !memberId || !category) return { open: true };
  const rec = load(memberId)[category] || { s: 0, fs: 0 };
  // The cooldown outranks the pre-study gate: after a fail the question is not
  // "have you ever studied this" but "have you studied since".
  if (rec.f && rec.fs < RETRY_STUDY_S) {
    const needS = RETRY_STUDY_S - rec.fs;
    return { open: false, reason: "cooldown", needS, needMin: Math.ceil(needS / 60) };
  }
  if (rec.s < PRE_STUDY_S) {
    const needS = PRE_STUDY_S - rec.s;
    return { open: false, reason: "pre", needS, needMin: Math.ceil(needS / 60) };
  }
  return { open: true };
}
