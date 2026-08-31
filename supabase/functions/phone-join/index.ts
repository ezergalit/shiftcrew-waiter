// phone-join — אימות טלפון להצטרפות עובדים (Twilio Verify).
//
// 🔴 לא לפרוס לפני שגוגל פליי מאשרת את שתי האפליקציות (יותם, 30.8).
// סדר ההרצה המלא: PHONE-JOIN-ROLLOUT.md בשורש הריפו.
//
// שני מצבים, בסגנון menu-ai-parse:
//   mode:"send"  { phone }        ⇒ בדיקות מכסה ⇒ Twilio Verifications
//   mode:"check" { phone, code }  ⇒ VerificationCheck ⇒ טוקן חד-פעמי (10 דק')
//                                    שאותו team_join_v2 דורש וצורך.
//
// סודות (Supabase ⇒ Edge Functions ⇒ Secrets, ידני מהדשבורד):
//   TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_VERIFY_SERVICE_SID
//   OTP_CHANNEL (אופציונלי: "whatsapp" | "sms", ברירת מחדל sms — מחליפים
//     לוואטסאפ בשורה אחת אם ה-sender המאושר זמין ל-Verify)
//   REVIEW_PHONE + REVIEW_CODE (אופציונלי: מספר בדיקה לבודקי חנות — לא שולח
//     כלום ומקבל קוד קבוע; מתועד ב-App Review Notes)
//
// הגנות SMS pumping (הרשמה פתוחה + SMS = יעד קלאסי):
//   ‎+972 בלבד · 3 שליחות למספר ביום · 10 ל-IP ביום · תקרה גלובלית 200 ביום.
//   כולן נבדקות מול menu_app.phone_otp_sends בצד השרת, לפני הקריאה ל-Twilio.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // ⚠️ x-app-session נשאר ברשימה למרות שההצטרפות היא לפני session — הלקח
  // מ-dish-photo: curl לא עושה preflight, ורק הדפדפן חושף כותרת חסרה.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// העתק של src/lib/phone.js ושל menu_app._normalize_il_phone — שלושה עותקים,
// שינוי חייב לקרות בשלושתם (כמו dishFlags).
function normalizeIlPhone(raw: string): string | null {
  const v = (raw || "").replace(/[^0-9+]/g, "");
  if (/^\+9725[0-9]{8}$/.test(v)) return v;
  if (/^9725[0-9]{8}$/.test(v)) return "+" + v;
  if (/^05[0-9]{8}$/.test(v)) return "+972" + v.slice(1);
  return null;
}

const DAY_PER_PHONE = 3;
const DAY_PER_IP = 10;
const DAY_GLOBAL = 200;
const TOKEN_TTL_MIN = 10;

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const auth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const verifySid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!sid || !auth || !verifySid) return json({ error: "not_configured" }, 500);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "menu_app" } },
  );

  let body: { mode?: string; phone?: string; code?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const phone = normalizeIlPhone(body.phone || "");
  if (!phone) return json({ status: "bad_phone" });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const reviewPhone = normalizeIlPhone(Deno.env.get("REVIEW_PHONE") || "");
  const isReview = reviewPhone !== null && phone === reviewPhone;

  const twilio = (path: string, form: Record<string, string>) =>
    fetch(`https://verify.twilio.com/v2/Services/${verifySid}/${path}`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${auth}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
    });

  if (body.mode === "send") {
    if (isReview) return json({ status: "sent", review: true }); // לא שולח, הקוד קבוע

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [byPhone, byIp, global] = await Promise.all([
      supa.from("phone_otp_sends").select("id", { count: "exact", head: true }).eq("phone", phone).gte("sent_at", dayAgo),
      ip ? supa.from("phone_otp_sends").select("id", { count: "exact", head: true }).eq("ip", ip).gte("sent_at", dayAgo)
         : Promise.resolve({ count: 0 }),
      supa.from("phone_otp_sends").select("id", { count: "exact", head: true }).gte("sent_at", dayAgo),
    ]);
    if ((byPhone.count ?? 0) >= DAY_PER_PHONE) return json({ status: "too_many" });
    if ((byIp.count ?? 0) >= DAY_PER_IP) return json({ status: "too_many" });
    // רשת הביטחון לארנק: מעל התקרה נופלים בשקט, בלי להסגיר שיש תקרה.
    if ((global.count ?? 0) >= DAY_GLOBAL) return json({ status: "too_many" });

    const channel = Deno.env.get("OTP_CHANNEL") === "whatsapp" ? "whatsapp" : "sms";
    const res = await twilio("Verifications", { To: phone, Channel: channel });
    if (!res.ok) {
      console.error("twilio send failed", res.status, await res.text());
      return json({ status: "send_failed" });
    }
    await supa.from("phone_otp_sends").insert({ phone, ip: ip || null });
    return json({ status: "sent" });
  }

  if (body.mode === "check") {
    const code = (body.code || "").replace(/\D/g, "");
    if (code.length < 4) return json({ status: "wrong_code" });

    let approved = false;
    if (isReview) {
      approved = code === (Deno.env.get("REVIEW_CODE") || "");
    } else {
      const res = await twilio("VerificationCheck", { To: phone, Code: code });
      if (res.ok) {
        const data = await res.json();
        approved = data.status === "approved";
      }
    }
    if (!approved) return json({ status: "wrong_code" });

    // הקוד נכון ⇒ טוקן חד-פעמי שרק team_join_v2 יודע לצרוך. הלקוח לא יכול
    // "לדווח שאומת" — האימות חי בשרת בלבד.
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supa.from("phone_verifications").insert({
      phone,
      token_hash: await sha256hex(token),
      expires_at: new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString(),
    });
    if (error) { console.error("verification insert failed", error); return json({ status: "send_failed" }); }
    return json({ status: "verified", token });
  }

  return json({ error: "bad_mode" }, 400);
});
