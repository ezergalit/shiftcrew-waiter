// ══ בודק התשובות — סורק את שני התפריטים החיים ומדמה איך מלצר באמת כותב (יותם, 6.9) ══
//
// «אני כותב טונה וזה לא מוצא כי כתוב טונה אדומה… תריץ בודקים ותעבור על שתי המסעדות, ותתקן
// את האלגוריתם עצמו כדי שלא נחזור על זה.» לכל מרכיב של כל מנת אוכל בשני התפריטים הבודק
// מייצר את מה שמלצר יכתוב — מילת המפתח לבדה («טונה»), עם ו' החיבור, ביחיד/רבים, בתוך משפט —
// ומריץ את שני המנועים: צ'יפים (`grade`) והתיאור החופשי (`markRows`). כל מפתח חייב לזכות;
// תואר/חלק לבדו («אדום», «פילה», «קרם») אסור שיזכה — וגם אסור שייספר כטעות.
// שאלות-סט: כל שם מנה בקטגוריה חייב להתפענח גם בלי המילה הכללית שלו וגם עם טעות אות.
//   node tools/answer-probe.mjs            # שני התפריטים מהפיקסצ'רים (tests/fixtures)
//   node tools/answer-probe.mjs S26TLV -v  # מסעדה אחת, עם פירוט כל כשל
// רענון הפיקסצ'רים מהתפריט החי: node tools/menu-snapshot.mjs S26TLV 95F245
import { readFileSync } from "node:fs";
import { generate, grade, setMenuVocab, norm, wExact } from "../src/lib/examEngine.js";
import { menuFromCards } from "../src/lib/examMenu.js";
import { buildRows, markRows } from "../src/lib/describeLeaf.js";
import { ingredientKeys, isNonKey, words } from "../src/lib/ingredientKeys.js";
import { resolveDish } from "../src/lib/quizBank.js";
import { isSimple } from "../src/lib/simpleDish.js";

const args = process.argv.slice(2);
const verbose = args.includes("-v");
const codes = args.filter((a) => !a.startsWith("-"));
const CODES = codes.length ? codes : ["S26TLV", "95F245"];

export function probeMenu(cards, { code = "" } = {}) {
  const menu = menuFromCards(cards);
  setMenuVocab(menu);
  const bank = generate(menu);
  const byDish = new Map(cards.map((c) => [c.name, c]));
  const fails = [], leaks = [], ambiguous = [];
  let targets = 0, variants = 0, negChecks = 0, names = 0, nameVariants = 0;

  const describeQs = bank.filter((q) => q.sit === "describe" && !byDish.get(q.dish)?.drink && !byDish.get(q.dish)?.event && !byDish.get(q.dish)?.knowledge);
  for (const q of describeQs) {
    const dish = byDish.get(q.dish);
    if (!dish || isSimple(dish)) continue;
    const rowsAll = buildRows(dish, q.targets, { mode: "all" });
    const ownersOf = (k) => q.targets.filter((t2) => ingredientKeys(t2.t).some((k2) => wExact(k2, k))).map((t2) => t2.t);
    for (const t of q.targets) {
      targets++;
      const keys = ingredientKeys(t.t);
      const forms = new Map([[t.t, keys.length === 1 && words(t.t).length === 1 ? keys[0] : null]]);   // ניסוח ⇒ המפתח שממנו נגזר
      for (const k of keys) {
        forms.set(k, k);
        forms.set("ו" + k, k);
        if (/(ימ|ות)$/.test(k) && k.length >= 5) forms.set(k.replace(/(ימ|ות)$/, ""), k);   // רבים ⇒ יחיד
      }
      for (const [v, k] of forms) {
        variants++;
        const owners = k ? ownersOf(k) : [t.t];
        const shared = owners.length > 1;
        // ── צ'יפים ──
        const g = grade(q, [v]);
        const d = g.detail?.[0];
        const chipOk = d?.status === "ok" && (d.credited.includes(t.t) || (shared && d.credited.some((c) => owners.includes(c))));
        if (!chipOk) (shared ? ambiguous : fails).push({ code, path: "chip", dish: dish.name, target: t.t, answer: v, got: d?.status, credited: d?.credited });
        // ── תיאור חופשי (שורות מרכיבים) ──
        const sentence = `המנה מגיעה עם ${v} ועוד דברים`;
        const rows = markRows(rowsAll, sentence);
        const row = rows.find((r) => r.id === `ing:${t.t}`);
        const descOk = row?.status === "ok" || (shared && rows.some((r) => r.kind === "ing" && owners.includes(r.canonical[0]) && r.status === "ok"));
        if (!descOk) (shared ? ambiguous : fails).push({ code, path: "desc", dish: dish.name, target: t.t, answer: sentence, got: row?.status });
      }
      // ── תואר/חלק לבדו אינו ידע: לא מזכה, לא טעות ──
      for (const w of words(t.t).filter((x) => isNonKey(x) && !keys.includes(x) && x !== norm(t.t))) {
        negChecks++;
        const g = grade(q, [w]);
        const d = g.detail?.[0];
        if (d?.status === "ok" && d.credited.includes(t.t)) leaks.push({ code, path: "chip", dish: dish.name, target: t.t, answer: w, got: "credited" });
        else if (d?.status === "wrong") leaks.push({ code, path: "chip", dish: dish.name, target: t.t, answer: w, got: "wrong (should be neutral)" });
        const row = markRows(rowsAll, `המנה מגיעה עם ${w} ועוד דברים`).find((r) => r.id === `ing:${t.t}`);
        if (row?.status === "ok") leaks.push({ code, path: "desc", dish: dish.name, target: t.t, answer: w, got: "credited" });
      }
    }
  }

  // ── שאלות-סט: פענוח שמות מנות שנכתבו בקיצור ──
  const food = cards.filter((c) => !c.drink && !c.knowledge && !c.event);
  const cats = [...new Set(food.map((c) => c.category))];
  for (const cat of cats) {
    const items = food.filter((c) => c.category === cat);
    const pool = items.map((c) => c.name);
    for (const it of items) {
      names++;
      const ws = words(it.name);
      const forms = new Set([it.name]);
      if (ws.length >= 2) {
        const content = ws.filter((w) => !isNonKey(w));
        if (content.length && content.length < ws.length) forms.add(content.join(" "));       // בלי המילה הכללית/התואר
        if (ws.length >= 3) forms.add(ws.slice(0, 2).join(" "));                              // שתי המילים הראשונות
      }
      const nn = norm(it.name).replace(/ /g, "");
      if (nn.length >= 10) { const s = it.name; forms.add(s.slice(0, 3) + s.slice(4)); }       // טעות אות (השמטה) בשם ארוך
      for (const v of [...forms].filter((f) => norm(f).replace(/ /g, "").length >= 4)) {       // קיצור של פחות מ-4 אותיות אינו כתיבה
        nameVariants++;
        const r = resolveDish(pool, v, items);
        if (r === it.name) continue;
        const others = pool.filter((n) => n !== it.name && words(n).some((w) => words(v).includes(w)));
        (others.length ? ambiguous : fails).push({ code, path: "name", dish: it.name, cat, answer: v, got: r });
      }
    }
  }
  return { targets, variants, negChecks, names, nameVariants, fails, leaks, ambiguous };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const code of CODES) {
    const fx = JSON.parse(readFileSync(new URL(`../tests/fixtures/menu-${code}.json`, import.meta.url), "utf8"));
    const r = probeMenu(fx.cards, { code });
    const byPath = (list) => Object.entries(list.reduce((a, f) => ((a[f.path] = (a[f.path] || 0) + 1), a), {})).map(([k, v]) => `${k}:${v}`).join(" ") || "0";
    console.log(`\n${code} ${fx.name}: ${r.targets} מרכיבים · ${r.variants} ניסוחים · ${r.negChecks} בדיקות-תואר · ${r.names} שמות · ${r.nameVariants} קיצורים`);
    console.log(`  🔴 כשלים: ${r.fails.length} (${byPath(r.fails)}) · 🟠 דליפות: ${r.leaks.length} (${byPath(r.leaks)}) · ⚪ דו-משמעי: ${r.ambiguous.length} (${byPath(r.ambiguous)})`);
    bad += r.fails.length + r.leaks.length;
    const show = (list, label, n) => { for (const f of list.slice(0, verbose ? list.length : n)) console.log(`  ${label} [${f.path}] ${f.dish} · «${f.target || f.cat}» ⇐ «${f.answer}» ⇒ ${f.got}${f.credited?.length ? ` (${f.credited.join(", ")})` : ""}`); };
    show(r.fails, "🔴", 25); show(r.leaks, "🟠", 15); if (verbose) show(r.ambiguous, "⚪", 0);
  }
  process.exit(bad ? 1 : 0);
}
