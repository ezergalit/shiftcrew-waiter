// Snapshot a restaurant's LIVE menu into tests/fixtures/menu-<CODE>.json — the same rows the
// waiter app sees (team_preview ⇒ published_menu ⇒ pubToCard replica). The answer probe and
// its regression test run on these fixtures, so the engine is measured on real menus, offline.
//   node tools/menu-snapshot.mjs S26TLV 95F245
// ⚠️ pubToCard replica — keep in sync with MainApp.jsx when it changes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const codes = process.argv.slice(2).map((c) => c.trim().toUpperCase()).filter(Boolean);
if (!codes.length) { console.error("usage: node tools/menu-snapshot.mjs <TEAM_CODE> [...]"); process.exit(1); }
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const URL_ = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Content-Profile": "menu_app", "Accept-Profile": "menu_app" };

// ⚠️ not `.includes("יין")` — final nun in «יין», regular inside «יינות»
const drinkKind = (cat) =>
  /יין|יינ|רוזה|מבעבע|שמפניה/.test(cat || "") ? "יין"
  : /סאקה/.test(cat || "") ? "סאקה"
  : /ביר(ה|ות)/.test(cat || "") ? "בירה"
  : /וודקה/.test(cat || "") ? "וודקה"
  : /וויסקי|ויסקי/.test(cat || "") ? "וויסקי"
  : /טקילה/.test(cat || "") ? "טקילה"
  : /ג['׳]ין/.test(cat || "") ? "ג'ין"
  : /ערק|אוזו|אניס/.test(cat || "") ? "ערק או אוזו"
  : /קוניאק|ברנדי/.test(cat || "") ? "קוניאק"
  : /ליקר/.test(cat || "") ? "ליקר"
  : /רום/.test(cat || "") ? "רום"
  : /אפריטיף|ורמוט/.test(cat || "") ? "אפריטיף"
  : /סיגר/.test(cat || "") ? "סיגר" : null;

mkdirSync(new URL("../tests/fixtures/", import.meta.url), { recursive: true });
for (const code of codes) {
  const rpc = await fetch(`${URL_}/rest/v1/rpc/team_preview`, { method: "POST", headers: H, body: JSON.stringify({ p_team_code: code }) });
  const prev = await rpc.json();
  if (!rpc.ok) { console.error(code, "team_preview failed", prev); process.exitCode = 1; continue; }
  const row = Array.isArray(prev) ? prev[0] : prev;
  const token = row.token, rest = row.restaurant || {}, rid = rest.id || row.restaurant_id;
  const res = await fetch(`${URL_}/rest/v1/published_menu?restaurant_id=eq.${rid}&select=source_item_id,name,category,price,ingredients,allergens,pregnancy,pitfalls,kashrut,description,menu_group,menu_position,starred,is_special&order=menu_position`, { headers: { ...H, "x-app-session": token } });
  const rows = await res.json();
  if (!res.ok) { console.error(code, "menu fetch failed", rows); process.exitCode = 1; continue; }
  const cards = rows.map((p) => ({
    id: p.source_item_id, name: p.name, price: Number(p.price), category: p.category,
    menuGroup: p.menu_group || null, desc: p.description || "",
    ingredients: (p.ingredients || []).filter(Boolean), allergens: (p.allergens || []).filter(Boolean),
    pregnancy: (p.pregnancy || []).filter(Boolean), pitfalls: (p.pitfalls || []).filter(Boolean),
    kashrut: (p.kashrut || []).filter(Boolean), menuPosition: p.menu_position,
    isSpecial: !!(p.starred || p.is_special), drink: drinkKind(p.category),
    event: /אירוע/.test(p.menu_group || ""),
    knowledge: (p.category || "").startsWith("הדרכת") || (p.name || "").startsWith("מה חשוב לדעת"),
  }));
  writeFileSync(new URL(`../tests/fixtures/menu-${code}.json`, import.meta.url), JSON.stringify({ code, name: rest.name || "", fetchedAt: new Date().toISOString(), cards }));
  const food = cards.filter((c) => !c.drink && !c.knowledge && !c.event);
  console.log(`${code} ${rest.name || rid}: ${cards.length} items · ${food.length} food · ${food.reduce((a, c) => a + c.ingredients.length, 0)} ingredients`);
}
