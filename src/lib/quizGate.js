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

// כמה תרגול הבוחן של הקטגוריה דורש — נגזר מהתוכן, לא קבוע (יותם, 31.8:
// "בהתאם לכמות המנות והתיאור בכרטיסיות… 3 מנות דקה וחצי, עשר 3 דקות, עשרים
// 5 דקות, והמקסימום 5"). מנה עם תיאור ארוך שווה יותר מקולה בבקבוק, אז כל מנה
// נספרת 1–1.5 לפי אורך התיאור, והדקות: 1 + 0.2·יחידות, בין 1.5 ל-5.
// אותו ערך משמש גם לשער הראשון וגם להמתנה אחרי כישלון — קטגוריה של 3 מנות
// שדרשה 5 דקות לפני ו-15 אחרי הענישה על גודל שאין בה.
export function requiredStudyS(items) {
  if (!items?.length) return PRE_STUDY_S;
  const units = items.reduce((a, it) => a + 1 + Math.min((it.desc || "").length / 400, 0.5), 0);
  const min = Math.min(5, Math.max(1.5, 1 + 0.2 * units));
  return Math.round(min * 60);
}

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
export function gateFor(memberId, category, { passed, items } = {}) {
  if (passed || !memberId || !category) return { open: true };
  const rec = load(memberId)[category] || { s: 0, fs: 0 };
  const need = requiredStudyS(items);
  // The cooldown outranks the pre-study gate: after a fail the question is not
  // "have you ever studied this" but "have you studied since".
  if (rec.f && rec.fs < need) {
    const needS = need - rec.fs;
    return { open: false, reason: "cooldown", needS, needMin: Math.ceil(needS / 60) };
  }
  if (rec.s < need) {
    const needS = need - rec.s;
    return { open: false, reason: "pre", needS, needMin: Math.ceil(needS / 60) };
  }
  return { open: true };
}
