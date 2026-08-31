// נרמול טלפון ישראלי ל-E.164 — ‎+9725XXXXXXXX, אחרת null.
// ⚠️ משוכפל בשלושה מקומות: כאן, menu_app._normalize_il_phone (המיגרציה),
// ו-normalizeIlPhone ב-Edge Function ‏phone-join. שינוי חייב לקרות בשלושתם.
export function normalizeIlPhone(raw) {
  const v = (raw || "").replace(/[^0-9+]/g, "");
  if (/^\+9725[0-9]{8}$/.test(v)) return v;
  if (/^9725[0-9]{8}$/.test(v)) return "+" + v;
  if (/^05[0-9]{8}$/.test(v)) return "+972" + v.slice(1);
  return null;
}

// תצוגה חזרה למשתמש: ‎+9725XXXXXXXX ⇒ ‎05X-XXX-XXXX
export function displayIlPhone(e164) {
  const m = /^\+972(5[0-9])([0-9]{3})([0-9]{4})$/.exec(e164 || "");
  return m ? `0${m[1]}-${m[2]}-${m[3]}` : e164 || "";
}
