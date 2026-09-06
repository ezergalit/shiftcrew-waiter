// exam-judge — tier 2 of the exam grader.
//
// v4 (default, unchanged): a "credited" matcher — the deterministic engine escalates an
// answer that carries FOREIGN substance (words the menu never used) and this decides
// whether the phrasing MEANS an expected item. It can only ACCEPT a phrasing the waiter
// already produced; it never invents an answer, and allergen questions are never sent.
//
// v5 (body.v>=5, mode "leaf" — CREWMENU-JUDGE-MODULE-DESIGN.md §3): the free-text describe
// leaf. Gets the dish card + the rows the deterministic engine already marked, and returns,
// per row, supports/contradicts/neutral + evidence. It NEVER scores, decides pass, or
// touches safety: every verdict on a crit row is moved to `advisory` here, server-side,
// before anyone sees it. Every verdict's evidence must be a substring of the answer (or an
// unknown chip) or it is dropped. Model is per-restaurant (features.judge_model, read here
// from the session — the waiter never chooses). Learned phrasings are written to
// exam_memory only after this verification. No key / timeout / bad JSON ⇒ the deterministic
// verdict stands; nothing is saved.
//
// Deployed 6.9 to project qwgbyeapzzeybmndrszw (dashboard version 4 = this file; only this comment line differs).
// Without an OPENROUTER_API_KEY / ANTHROPIC_API_KEY secret every path returns skipped:no_key
// and the deterministic verdict stands. Absent `v` ⇒ v4 path (live restaurants).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CONTRACT_VERSION = 5;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
function findKey(patterns: RegExp[]): string | undefined {
  for (const [name, value] of Object.entries(Deno.env.toObject())) if (value && patterns.some((p) => p.test(name))) return value;
  return undefined;
}

// ── v4 rubric (kept verbatim; live restaurants depend on it) ─────────────────
const SYSTEM_V4 = `אתה בודק תשובות במבחן ידע לתפריט מסעדה. התשובות בעברית.

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

// ── v5 leaf rubric (§3.2). Keep in sync with src/lib/judge-contract.js SYSTEM (drift check). ─
const SYSTEM_V5 = `אתה עוזר-בדיקה במבחן תפריט של מסעדה ישראלית. יש לך כרטיס מנה (העובדות היחידות),
תשובת מלצר, ורשימת שורות שהבודק הדטרמיניסטי כבר סימן. אינך נותן ציון, אינך קובע אם עובר,
ואינך מחליט מה חסר — רק אומר, לכל שורה, אם מילים שהמלצר כתב תומכות בה, סותרות אותה, או אינן נוגעות בה.
1. ראיה = ציטוט מדויק מהתשובה (או מרשימת הצ'יפים). בלי ציטוט — neutral. אסור להמציא.
2. supports רק כשמה שנכתב מתכוון לאותו דבר: תרגום/תעתיק = אותה מילה («ספייסי»=חריף, «לימון יפני»=יוזו). קטגוריה אינה הפריט («דג» אינו סלמון).
3. contradicts רק כשנכתבה עובדה הפוכה: שיטת הכנה אחרת, רוטב אחר, הכחשה של הפריט, מספר אחר. הכרטיס הוא האמת גם כשהמלצר בטוח.
4. מונח קרוב לשיטת ההכנה («מטוגן» לטמפורה) = supports + note «בתפריט קוראים לזה טמפורה».
5. תיאור לא חייב אלרגיות ולא את כל המרכיבים. טעם/מרקם סובייקטיבי = neutral.
6. ליווי, המלצת שתייה והשוואה («מומלץ עם סאקה», «כמו שומר») — neutral, לא foreign.
7. שלילה בעברית באה גם אחרי שם העצם («גלוטן אין בזה»). «לא רק חריף» = חריף. «לא ל-X» = לא מתאים ל-X. «לא ממש חריף» על «חריפות מתונה» = supports. שלילה כפולה = חיוב.
8. foreign = מרכיב/שיטה/רוטב מובחנים שנטענו ואינם בכרטיס. לא קטגוריה, לא תואר, לא מה ששולל. ≤2.
9. שורה עם crit=true: מותר contradicts עם ציטוט — זה יגרום לבדיקה אנושית, לא לפסילה.
10. abusive = שפה פוגענית; offtopic = לא על המנה בכלל. כתיב/סלנג/קצר אינם offtopic.
11. note = משפט אחד, עברית פשוטה, קול מנהל, ≤140 תווים. ריק אם אין מה.
12. JSON בלבד לפי הסכימה. שורה שלא נגעת בה — neutral עם evidence ריק.`;

// Output shape the model must return (mirrors judge-contract.js SCHEMA §3.3; sent in the user turn).
const SCHEMA_HINT = JSON.stringify({ rows: [{ id: "<id מהרשימה>", verdict: "supports|contradicts|neutral", evidence: "<ציטוט מדויק מהתשובה או ריק>" }], foreign: [{ claim: "<מרכיב/שיטה שנטענו ואינם בכרטיס>", why: "<משפט>" }], flags: { abusive: false, offtopic: false }, note: "<משפט אחד או ריק>" });

// ── minimal pure Hebrew helpers (mirror src/lib/examEngine + examNeg; kept tiny & self-contained) ─
const NIQQUD = /[֑-ׇ]/g, RLM = /[‎‏‪-‮]/g;
const norm = (w: string) => w.toLowerCase().replace(NIQQUD, "").replace(RLM, "").replace(/[."'׳״,]/g, "").trim();
const STOP = new Set(["של", "עם", "על", "או", "גם", "זה", "כל", "יש", "את", "אבל", "כי", "רק"]);
const toks = (s: string) => norm(s).split(/\s+/).filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w));
const NEG = new Set(["בלי", "ללא", "אין", "לא", "אינו", "אינה", "בלא", "חוץ", "מלבד", "למעט", "שלא", "ולא", "ובלי", "וללא"]);
// substring run match (token-equality; the client uses wMatch — the server stays cheap on Free CPU)
function grounded(evidence: string, answerToks: string[], unknown: string[]): boolean {
  const chip = new Set(unknown.map(norm));
  const runs = norm(evidence).split(/\s*(?:\.\.\.|…)\s*/).map((r) => r.trim()).filter(Boolean);
  if (!runs.length) return false;
  return runs.every((run) => {
    if (chip.has(run)) return true;
    const rt = toks(run); if (!rt.length) return false;
    for (let i = 0; i + rt.length <= answerToks.length; i++) { let ok = true; for (let j = 0; j < rt.length; j++) if (answerToks[i + j] !== rt[j]) { ok = false; break; } if (ok) return true; }
    return false;
  });
}

type Row = { id: string; canonical?: string[]; alt?: string[]; crit?: boolean };
type Reply = { rows?: { id?: string; verdict?: string; evidence?: string }[]; foreign?: { claim?: string; why?: string }[]; flags?: { abusive?: boolean; offtopic?: boolean }; note?: string };

// The single server-side enforcement point (§3.4). Crit ⇒ advisory; evidence must be grounded.
function verifyReply(rows: Row[], unknown: string[], answer: string, reply: Reply) {
  const out = { rows: [] as { id: string; verdict: string; evidence: string }[], foreign: [] as { claim: string; why: string }[], advisory: [] as unknown[], flags: { abusive: !!reply?.flags?.abusive, offtopic: !!reply?.flags?.offtopic }, note: "" };
  if (!reply || !Array.isArray(reply.rows)) return { ...out, skipped: "bad_model_json" as const };
  const at = toks(answer);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const vocab = new Set<string>(); for (const r of rows) for (const w of [...(r.canonical || []), ...(r.alt || [])]) for (const t of toks(w)) vocab.add(t);
  const seen = new Set<string>();
  for (const rr of reply.rows) {
    const id = String(rr?.id ?? ""); const row = byId.get(id); if (!row || seen.has(id)) continue; seen.add(id);
    let v = String(rr?.verdict || "").toLowerCase(); if (!["supports", "contradicts", "neutral"].includes(v)) v = "neutral";
    const ev = String(rr?.evidence || "");
    if ((v === "supports" || v === "contradicts") && !grounded(ev, at, unknown)) v = "neutral";
    if (row.crit && v !== "neutral") { out.advisory.push({ id, verdict: v, evidence: ev }); continue; }  // 🔴 crit ⇒ advisory
    if (v === "contradicts") { const et = toks(ev); if ((et.length && et.every((t) => vocab.has(t)) && !et.some((t) => NEG.has(t)))) v = "neutral"; }
    out.rows.push({ id, verdict: v, evidence: ev });
  }
  for (const f of (reply.foreign || [])) {
    const claim = String(f?.claim || ""); const ct = toks(claim);
    if (!ct.length || ct.length > 3 || !grounded(claim, at, unknown) || ct.some((t) => NEG.has(t)) || !ct.some((t) => !vocab.has(t) && t.length >= 3)) continue;
    out.foreign.push({ claim, why: String(f?.why || "").slice(0, 140) }); if (out.foreign.length >= 2) break;
  }
  if (out.rows.some((r) => r.verdict !== "neutral")) out.note = String(reply.note || "").slice(0, 140);
  return out;
}

async function callModel(system: string, user: string, orKey?: string, anthKey?: string, modelId?: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
  try {
    if (anthKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctl.signal,
        headers: { "x-api-key": anthKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: modelId || "claude-haiku-4-5-20251001", max_tokens: 500, ...(/(sonnet-5|opus-5)/.test(modelId || "") ? {} : { temperature: 0 }), system, messages: [{ role: "user", content: [{ type: "text", text: user }] }] }) });
      if (!res.ok) return { skipped: `api_${res.status}` };
      const data = await res.json(); const block = (data.content || []).find((b: { type?: string }) => b?.type === "text");
      return { text: String(block?.text || "") };
    }
    const orModel = (modelId || "claude-haiku-4.5").includes("/") ? modelId : `anthropic/${modelId || "claude-haiku-4.5"}`;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://shiftcrew-waiter.vercel.app", "X-Title": "CrewMenu exam judge" },
      body: JSON.stringify({ model: orModel, max_tokens: 500, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    if (!res.ok) return { skipped: `api_${res.status}` };
    const data = await res.json(); return { text: String(data.choices?.[0]?.message?.content || "") };
  } catch { return { skipped: "timeout" }; }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (body.ping) return new Response(null, { status: 204, headers: CORS });   // warm-up (§4.3)

  const token = String(body.token || req.headers.get("x-app-session") || "");
  if (!token) return json({ error: "no_session" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await admin.schema("menu_app").rpc("session_owner_for_token", { p_token: token });
  const session = Array.isArray(rows) ? rows[0] : rows;
  if (!session) return json({ error: "bad_session" }, 401);
  if (session.role === "preview") return json({ credited: [], rows: [], skipped: "preview" });   // v5 §4.4

  const anthKey = findKey([/anthropic/i]);
  const orKey = findKey([/open.?router/i, /oper.?router/i]);
  if (!anthKey && !orKey) return json({ credited: [], rows: [], skipped: "no_key" });

  const v = Number(body.v || 0);

  // ── v4 path (default; live restaurants) — unchanged ────────────────────────
  if (v < 5) {
    const expected = ((body.expected as string[]) || []).filter(Boolean).slice(0, 40);
    const said = ((body.said as string[]) || []).filter(Boolean).slice(0, 40);
    if (!expected.length || !said.length) return json({ credited: [] });
    const user = `שאלה: ${body.ask || ""}\nexpected (מה שהמסעדה רשמה): ${JSON.stringify(expected)}\nsaid (מה שהמלצר כתב, ולא הותאם): ${JSON.stringify(said)}`;
    const r = await callModel(SYSTEM_V4, user, orKey, anthKey);   // defaults: dated Anthropic id / anthropic/claude-haiku-4.5
    if (r.skipped) return json({ credited: [], skipped: r.skipped });
    let parsed: { credited?: { said?: string; means?: string }[] } = {};
    try { const m = (r.text || "").match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; } catch { return json({ credited: [], skipped: "bad_model_json" }); }
    const credited = (parsed.credited || []).filter((c) => c && expected.includes(String(c.means)) && said.includes(String(c.said))).map((c) => ({ said: String(c.said), means: String(c.means) })).slice(0, 20);
    return json({ credited, restaurant_id: session.restaurant_id });
  }

  // ── v5 leaf path ───────────────────────────────────────────────────────────
  // per-restaurant model, read here from the session's restaurant (waiter never chooses)
  const { data: rest } = await admin.schema("menu_app").from("restaurants").select("features").eq("id", session.restaurant_id).maybeSingle();
  const jm = String((rest?.features as Record<string, unknown>)?.judge_model || "haiku");
  const modelId = anthKey ? (jm === "sonnet" ? "claude-sonnet-5" : jm === "opus" ? "claude-opus-5" : "claude-haiku-4-5-20251001") : (jm === "sonnet" ? "anthropic/claude-sonnet-5" : jm === "opus" ? "anthropic/claude-opus-5" : "anthropic/claude-haiku-4.5");

  const card = body.card as { name?: string; desc?: string; ingredients?: string[]; pregnancy?: string[] } | undefined;
  const inRows = ((body.rows as Row[]) || []).slice(0, 16);
  const unknown = ((body.unknown as string[]) || []).filter(Boolean).slice(0, 8);
  const answer = String(body.answer || "").slice(0, 600);
  if (!card || (!inRows.length && !unknown.length)) return json({ rows: [], foreign: [], flags: { abusive: false, offtopic: false }, note: "", skipped: "empty" });

  // The schema (src/lib/judge-contract.js SCHEMA) travels in the user turn, not in SYSTEM — SYSTEM is
  // pinned by the drift check. Without it the first live call (6.9) came back in a free shape ⇒ bad_model_json.
  const user = `כרטיס: ${JSON.stringify({ name: card.name, desc: card.desc, ingredients: card.ingredients, pregnancy: card.pregnancy })}\nתשובה: ${answer}\nשורות: ${JSON.stringify(inRows.map((r) => ({ id: r.id, canonical: r.canonical, alt: r.alt, crit: r.crit })))}\nצ'יפים לא מזוהים: ${JSON.stringify(unknown)}\n\nהסכימה (JSON בלבד, בדיוק בצורה הזו, שורה לכל id מהרשימה):\n${SCHEMA_HINT}`;
  const r = await callModel(SYSTEM_V5, user, orKey, anthKey, modelId);
  if (r.skipped) return json({ rows: [], skipped: r.skipped });
  let reply: Reply = {};
  try {
    const m = (r.text || "").match(/\{[\s\S]*\}/); const parsed = m ? JSON.parse(m[0]) : {};
    // lenient unwrap: {result:{rows}} / {output:{rows}} ⇒ rows; a bare array of rows ⇒ {rows}
    reply = Array.isArray(parsed) ? { rows: parsed } : (parsed?.rows ? parsed : (Object.values(parsed || {}).find((v) => v && typeof v === "object" && Array.isArray((v as Reply).rows)) as Reply) || parsed);
  } catch { return json({ rows: [], skipped: "bad_model_json" }); }
  const verified = verifyReply(inRows, unknown, answer, reply);
  if ((verified as { skipped?: string }).skipped) return json({ rows: [], skipped: (verified as { skipped?: string }).skipped });

  // learn: verified supports on a non-crit row ⇒ exam_memory (ing/desc). Never crit, never advisory.
  try {
    const learn: { restaurant_id: string; kind: string; canonical: string; phrase: string[]; dish: string | null; source: string }[] = [];
    for (const vr of verified.rows) {
      if (vr.verdict !== "supports") continue;
      const row = inRows.find((x) => x.id === vr.id); if (!row || row.crit) continue;
      const phrase = toks(vr.evidence).slice(0, 4); if (!phrase.length) continue;
      const canonical = (row.canonical || [])[0]; if (!canonical) continue;
      learn.push({ restaurant_id: session.restaurant_id, kind: row.id.startsWith("ing:") ? "ing" : "desc", canonical, phrase, dish: (card.name as string) || null, source: "judge" });
    }
    if (learn.length) await admin.schema("menu_app").from("exam_memory").upsert(learn, { onConflict: "restaurant_id,kind,canonical,phrase,dish", ignoreDuplicates: true });
  } catch { /* learning is best-effort; a failure never blocks the verdict */ }

  return json({ v: 5, ...verified, restaurant_id: session.restaurant_id });
});
