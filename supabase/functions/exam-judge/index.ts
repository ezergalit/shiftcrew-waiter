// exam-judge — tier 2 of the exam grader.
//
// The deterministic matcher in examEngine.js settles ~91% of answers for nothing. It
// escalates here only when an answer contains FOREIGN substance: words the restaurant's
// own menu has never used. That is the signature of a synonym or a transliteration
// ("לימון יפני" for יוזו), which is exactly the case a fuzzy string matcher cannot decide
// and a cheap model can.
//
// ⚠️ It can only ever ACCEPT a phrasing the waiter already produced. It is never asked
// what the answer is, so it cannot invent one, and a wrong answer it fails to recognise
// simply keeps the deterministic verdict.
//
// ⚠️ ALLERGEN QUESTIONS ARE NOT ESCALATED — see the client. Allergens are a closed list of
// eight values with their synonyms already hard-coded, so there is no legitimate "unusual
// phrasing" left for a model to adjudicate, and the only thing an LLM could add is the
// chance of crediting a waiter for an allergen they did not name. That is a safety field.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // x-app-session must be listed: the apps inject it into every supabase request, so the
  // browser preflights it here too. curl never preflights — this is only caught in-app.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function findKey(patterns: RegExp[]): string | undefined {
  for (const [name, value] of Object.entries(Deno.env.toObject())) {
    if (value && patterns.some((p) => p.test(name))) return value;
  }
  return undefined;
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `אתה בודק תשובות במבחן ידע לתפריט מסעדה. התשובות בעברית.

התפקיד שלך: להכריע אם מה שהמלצר כתב מתכוון לאותו דבר כמו פריט שהמסעדה רשמה — ותו לא.

כללים מחייבים:
1. אתה מקבל רשימת פריטים שהמסעדה רשמה ("expected") ורשימת מה שהמלצר כתב ("said").
   עבור כל דבר שהמלצר כתב ולא הותאם עדיין — החלט אם הוא מתכוון לאחד מהפריטים שברשימה.
2. זהות משמעות בלבד. "לימון יפני" ≈ "יוזו" ✓. "פטרוזיליה" ≈ "כוסברה" ✗ — עשבים שונים.
   תעתיק לועזי של אותו מרכיב ✓. שם כללי לקטגוריה שהפריט שייך אליה ✗ ("דג" עבור "סלמון").
3. פריט של המלצר יכול להיות משפט טבעי שלם ("זה יין עשיר עם טעם של פירות אדומים") —
   ומשפט אחד יכול להתכוון לכמה פריטים ברשימה. החזר זוג {"said","means"} לכל פריט
   שהמשפט מכסה במשמעותו, עם אותו said בכל זוג.
4. אסור להמציא. אם מה שנכתב לא מתכוון לאף פריט ברשימה — אל תזכה אותו.
5. אל תשפוט את מה שחסר. אתה מכריע רק על מה שנכתב.
6. החזר JSON בלבד, בלי טקסט נוסף, בצורה:
   {"credited":[{"said":"...","means":"..."}]}
   "means" חייב להיות מחרוזת מדויקת מתוך expected. רשימה ריקה היא תשובה לגיטימית.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { token?: string; expected?: string[]; said?: string[]; ask?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const token = body.token || req.headers.get("x-app-session") || "";
  const expected = (body.expected || []).filter(Boolean).slice(0, 40);
  const said = (body.said || []).filter(Boolean).slice(0, 40);
  if (!token) return json({ error: "no_session" }, 401);
  if (!expected.length || !said.length) return json({ credited: [] });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // menu_app.app_sessions has no grants; this narrow SECURITY DEFINER function is the only
  // way in, and it is granted to service_role alone.
  const { data: rows } = await admin.schema("menu_app").rpc("session_owner_for_token", { p_token: token });
  const session = Array.isArray(rows) ? rows[0] : rows;
  if (!session) return json({ error: "bad_session" }, 401);

  // ⚠️ This project has NO Anthropic key — checked, not assumed: menu-ai-parse's own
  // ?diag=1 reports `anthropic: missing` and a single `operrouter_api_key` (the name is
  // misspelled in the dashboard, which is why the pattern below accepts both spellings).
  // So the judge goes through OpenRouter, exactly like the import function does.
  const anthropicKey = findKey([/anthropic/i]);
  const openrouterKey = findKey([/open.?router/i, /oper.?router/i]);
  // No key is not an error the waiter should ever see: the deterministic verdict already
  // stands, and this tier only ever improves it.
  if (!anthropicKey && !openrouterKey) return json({ credited: [], skipped: "no_key" });

  const user = `שאלה: ${body.ask || ""}
expected (מה שהמסעדה רשמה): ${JSON.stringify(expected, null, 0)}
said (מה שהמלצר כתב, ולא הותאם): ${JSON.stringify(said, null, 0)}`;

  let text = "";
  try {
    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 400, temperature: 0,
          system: SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: user }] }],
        }),
      });
      if (!res.ok) return json({ credited: [], skipped: `api_${res.status}` });
      const data = await res.json();
      const block = (data.content || []).find((b: { type?: string }) => b?.type === "text");
      text = String(block?.text || "");
    } else {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json",
          "HTTP-Referer": "https://shiftcrew-waiter.vercel.app", "X-Title": "CrewMenu exam judge",
        },
        body: JSON.stringify({
          model: "anthropic/claude-haiku-4.5", max_tokens: 400, temperature: 0,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) return json({ credited: [], skipped: `api_${res.status}` });
      const data = await res.json();
      text = String(data.choices?.[0]?.message?.content || "");
    }
  } catch {
    return json({ credited: [], skipped: "api_error" });
  }

  // The model is told to return bare JSON; extracting the object anyway costs nothing and
  // survives a stray sentence around it.
  let parsed: { credited?: { said?: string; means?: string }[] } = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  } catch { return json({ credited: [], skipped: "bad_model_json" }); }

  // ⚠️ Every verdict is checked against the inputs before it is trusted. `means` must be a
  // string the restaurant actually wrote and `said` something the waiter actually typed —
  // otherwise a hallucinated pair would be cached and grade every future waiter.
  const credited = (parsed.credited || [])
    .filter((c) => c && expected.includes(String(c.means)) && said.includes(String(c.said)))
    .map((c) => ({ said: String(c.said), means: String(c.means) }))
    .slice(0, 20);

  return json({ credited, restaurant_id: session.restaurant_id });
});
