// ══ עלה התיאור — «תאר את המנה ללקוח» (יותם, 6.9) ══   node tests/describeLeaf.test.mjs
import { buildRows, markRows, scoreRows, gradeDescription } from "../src/lib/describeLeaf.js";
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("🔴", m); } };
const shrimp = { name: "שרימפס טמפורה טוגראשי", desc: "שרימפס בציפוי טמפורה פריך עם איולי חריף", ingredients: ["שרימפס", "טמפורה", "איולי"], pregnancy: [] };
const rows = buildRows(shrimp);
ok(rows.some((r) => r.id === "ing:טמפורה") && !rows.some((r) => r.id === "desc:טמפורה"), "מרכיב שהוא גם הכנה — שורה אחת");
ok(rows.some((r) => r.id === "desc:חריף") && rows.some((r) => r.id === "desc:קריספי" && r.w === 0.5), "«חריף» מהתיאור ⇒ שורה; «פריך» = «קריספי» (נטייה של אותו מושג, משקל 0.5)");
ok(!buildRows({ name: "x", desc: "חלומי פריכות על חסה", ingredients: ["חלומי"], pregnancy: [] }, null, { mode: "desc" }).some((r) => r.id === "form:פרוסות"), "«פריכות» אינו יוצר שורת «פרוסות» (יצירת שורה בזהות בלבד, בלי טעות-אות)");
ok(!buildRows({ name: "x", desc: "180 גרם בשר, לא מבושל לגמרי", ingredients: ["בשר בקר"], pregnancy: [] }, null, { mode: "desc" }).some((r) => r.id === "desc:מבושל"), "מילה שהכרטיס שולל («לא מבושל») אינה שורה");
const nems = buildRows({ name: "נאמס פרגית", desc: "ספרינג רול מטוגן בשמן עמוק במילוי פרגית", ingredients: ["דפי אורז", "פרגית"], pregnancy: [] });
ok(nems.some((r) => r.id === "desc:מטוגן") && !nems.some((r) => r.id === "desc:טמפורה"), "«מטוגן» בתיאור ⇒ שורת מטוגן, לא שורת טמפורה (נתפס חי)");
const good = scoreRows(markRows(rows, "שרימפס מטוגנים בציפוי פריך, מוגש עם רוטב איולי קצת חריף"));
ok(good.lvl === 2 && good.ok === good.n, `תיאור נכון בפרפרזה («מטוגנים» = טמפורה) ⇒ מלא (${good.ok}/${good.n})`);
const bad = scoreRows(markRows(rows, "שרימפס אפויים בתנור עם רוטב טחינה"));
ok(bad.lvl <= 1, `תיאור שגוי — הדטרמיניסטי לבדו: לכל היותר חלקי (השופט מוסיף סתירות ⇒ 0) (כיסוי ${bad.cover.toFixed(2)})`);
const partial = scoreRows(markRows(rows, "שרימפס עם איולי"));
ok(partial.lvl === 1, `שרימפס ואיולי בלי הטמפורה (מרכזית) ⇒ חלקי (${partial.cover.toFixed(2)})`);
ok(scoreRows(markRows(rows, "שרימפס בטמפורה עם איולי")).lvl === 2, "שרימפס + טמפורה + איולי, בלי «חריף» ⇒ מלא (התיבול/אופי לא מפיל)");
// משקל (יותם): «תיאור טוב לא ייכשל על תיבול» — מרכזי 2, תיבול 0.5
const greek = { name: "פילה דניס", desc: "פילה דניס צלוי עם שעועית ירוקה, שמן זית, לימון ושום", ingredients: ["פילה דניס", "שעועית ירוקה", "שמן זית", "לימון", "שום"], pregnancy: [] };
const gr = buildRows(greek);
ok(gr.find((r) => r.id === "ing:פילה דניס").w === 2 && gr.find((r) => r.id === "ing:שמן זית").w === 0.5 && gr.find((r) => r.id === "ing:שום").w === 0.5, "משקלים: פילה דניס=2 · שמן זית/שום=0.5");
ok(scoreRows(markRows(gr, "דניס צלוי עם שעועית ירוקה")).lvl === 2, "העיקר בלי התיבול ⇒ מלא");
ok(scoreRows(markRows(gr, "שמן זית, לימון ושום")).lvl === 1, "רק התיבול ⇒ חלקי");
ok(scoreRows(markRows(gr, "שמן זית, לימון ושום"), 0, { easy: true }).lvl === 1 && scoreRows(markRows(gr, "דניס עם לימון"), 0, { easy: true }).lvl === 2, "מצב קל (features.exam_easy): ספים נמוכים יותר");
// בטיחות: מנה נאה חייבת «נא»; שלילה = כשל; השופט לא יכול לבטל
const sashimi = { name: "סשימי ילוטייל", desc: "פרוסות ילוטייל נא עם פונזו", ingredients: ["ילוטייל", "פונזו"], pregnancy: ["דג נא"] };
const sr = buildRows(sashimi);
ok(sr.some((r) => r.crit && r.id === "crit:דג נא"), "שורת בטיחות לדג נא");
ok(scoreRows(markRows(sr, "פרוסות דקות של ילוטייל עם רוטב פונזו")).safety === true, "תיאור בלי «נא» ⇒ כשל בטיחות");
ok(scoreRows(markRows(sr, "ילוטייל נא בפרוסות דקות עם פונזו")).lvl === 2, "עם «נא» ⇒ מלא");
ok(scoreRows(markRows(sr, "ילוטייל לא נא, מבושל, עם פונזו")).safety === true, "«לא נא» ⇒ כשל בטיחות (שלילה)");
ok(scoreRows(markRows(sr, "דג לא מבושל עם פונזו")).safety === false, "«לא מבושל» מזכה את הבטיחות (שולל בתוך הניסוח עצמו)");
// דגלי הריון שאינם נא: מזכים כשנאמרים, לא מאפסים כשלא (הבוטים, 6.9)
const kashio = { name: "צ'יקן קשיו", desc: "נתחי חזה עוף בציפוי פנקו מוקפצים עם קשיו, ברוקולי ונבטים מעל", ingredients: ["חזה עוף", "פנקו", "קשיו", "ברוקולי", "נבטים"], pregnancy: ["נבטים חיים"] };
const kr = buildRows(kashio, null, { mode: "desc" });
ok(!kr.some((r) => r.crit) && kr.some((r) => r.id === "warn:נבטים חיים"), "«נבטים חיים» = שורת ידע (warn), לא בטיחות");
ok(scoreRows(markRows(kr, "עוף מוקפץ בציפוי פנקו פריך עם קשיו וברוקולי")).safety === false, "תיאור בלי נבטים ⇒ לא כשל בטיחות");
ok(!buildRows({ name: "x", desc: "טונה צרובה", ingredients: ["טונה"], pregnancy: ["דג נא", "דגים עתירי כספית"] }).some((r) => /כספית/.test(r.id)), "«דגים עתירי כספית» אינו שורה");
// השופט: supports מרים miss, contradicts מפיל, crit לא נוגעים
const fakeJudge = async ({ rows: rr }) => ({ rows: rr.map((r) => r.id === "ing:איולי" ? { id: r.id, verdict: "supports", evidence: "רוטב שום קרמי" } : r.id === "ing:טמפורה" ? { id: r.id, verdict: "contradicts", evidence: "אפויים בתנור" } : { id: r.id, verdict: "neutral", evidence: "" }), foreign: [{ claim: "טחינה", why: "לא בכרטיס" }], flags: { abusive: false, offtopic: false }, note: "בתפריט זה טמפורה, לא אפוי" });
const j = await gradeDescription({ dish: shrimp, text: "שרימפס אפויים בתנור עם רוטב שום קרמי וטחינה", judge: fakeJudge });
ok(j.judged && j.rows.find((r) => r.id === "ing:איולי").status === "ok" && j.rows.find((r) => r.id === "ing:טמפורה").status === "wrong" && j.note.includes("טמפורה"), "השופט: איולי מזוכה, טמפורה סותר, הערה");
const jc = await gradeDescription({ dish: sashimi, text: "ילוטייל מבושל עם פונזו", judge: async ({ rows: rr }) => ({ rows: rr.map((r) => ({ id: r.id, verdict: "supports", evidence: "ילוטייל מבושל" })), foreign: [], flags: { abusive: false, offtopic: false }, note: "" }) });
ok(jc.safety === true && jc.lvl === 0, "השופט «תומך» בשורת בטיחות ⇒ מתעלמים — הכשל נשאר");
const noJudge = await gradeDescription({ dish: shrimp, text: "שרימפס מטוגנים בציפוי פריך, מוגש עם רוטב איולי קצת חריף", judge: async () => { throw new Error("must not be called"); } });
ok(noJudge.lvl === 2 && !noJudge.judged, "תיאור שכל שורותיו זוהו לא קורא לשופט");
// תיאור ≠ מרכיבים (יותם, 6.9): mode "desc" בוחן «מה המנה» — צורה/הכנה/הגשה — בלי שורות מרכיבים
const nems2 = { name: "נאמס פרגית", desc: "2 יח' ספרינג רול ויאטנמי במילוי אטריות זכוכית, ירקות ופרגית. מוגש לצד ליים וחסה. ספרינג רול מהמטבח הויאטנמי, מטוגן בשמן עמוק. מנת שרינג מושלמת. אכילה עם הידיים.", ingredients: ["דפי אורז", "פרגית", "אטריות זכוכית", "ירקות", "ליים"], pregnancy: [] };
const dr = buildRows(nems2, null, { mode: "desc" });
ok(!dr.some((r) => r.kind === "ing") && dr.some((r) => r.id === "form:ספרינג רול") && dr.some((r) => r.id === "desc:מטוגן") && dr.some((r) => r.id === "form:שרינג") && dr.some((r) => r.id === "form:אכילה עם הידיים"), `desc-mode: ספרינג רול · מטוגן · שרינג · בידיים, בלי מרכיבים (${dr.map((r) => r.id).join(", ")})`);
ok(scoreRows(markRows(dr, "ספרינג רולים ויאטנמיים מטוגנים, מנה לשיתוף שאוכלים בידיים עם חסה")).lvl === 2, "תיאור מצוין בלי אף מרכיב ⇒ מלא (המרכיבים נבחנים בנפרד)");
ok(scoreRows(markRows(dr, "פרגית, אטריות זכוכית, ירקות, ליים")).lvl === 0, "רשימת מרכיבים בלבד אינה תיאור ⇒ 0 בחלק התיאור");
console.log(fail ? `\n🔴 ${fail} כשלים` : "describeLeaf.test: כל הבדיקות עברו");
process.exit(fail ? 1 : 0);
