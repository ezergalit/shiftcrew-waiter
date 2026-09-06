// ══ מנות פשוטות — שואלים רק מה שרלוונטי (יותם, 6.9) ══   node tests/simpleDish.test.mjs
import { isSimple, orderStep, orderAtoms, simpleQuestions, gradeSimple } from "../src/lib/simpleDish.js";
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("🔴", m); } };
// תיאורים אמיתיים מסטודיו (6.9)
const burger = { name: "המבורגר ילדים", category: "ילדים", ingredients: ["בשר בקר", "חסה", "עגבנייה", "לחמנייה"], desc: "120 גרם בשר בקר, חסה ועגבנייה על לחמנייה רכה, מוגש עם תוספת לבחירה. בלקיחת ההזמנה: מידת עשייה, ירקות ורטבים. עריכה: עריכה לצד ההורים או לצד הילד? לשאול את ההורים." };
const pasta = { name: "פסטה ילדים", category: "ילדים", ingredients: ["פסטה", "פרמז'ן"], desc: "פסטה שמנת / רוזה / עגבניות / ללא רוטב, עם פרמז'ן. ניתן לעשות ללא גלוטן. בלקיחת ההזמנה: לשאול — איזה רוטב? רוטב בצד? פרמז'ן?. עריכה: עריכה לצד ההורים או לצד הילד? לשאול את ההורים." };
const fish = { name: "פיש קידס", category: "ילדים", ingredients: ["פילה דניס", "טמפורה", "צ'יפס", "רוטב טרטר"], desc: "אצבעות פילה דניס בטמפורה, מוגשות עם צ'יפס. בלקיחת ההזמנה: מנה מטוגנת · לשאול על רטבים. עריכה: עריכה לצד ההורים או לצד הילד? לשאול את ההורים. בהגשה: הצגת רוטב הטרטר." };
const nems = { name: "נאמס פרגית", category: "ראשונות", ingredients: ["דפי אורז", "פרגית", "אטריות זכוכית", "ירקות", "ליים"], desc: "2 יח' ספרינג רול ויאטנמי במילוי אטריות זכוכית. בלקיחת ההזמנה: מנה מטוגנת." };
ok(isSimple(burger) && isSimple(pasta) && !isSimple(nems), "ילדים = פשוטה; נאמס עם 5 מרכיבים לא");
ok(orderStep(burger.desc) === "מידת עשייה, ירקות ורטבים", `קטע ההזמנה של ההמבורגר (${orderStep(burger.desc)})`);
ok(orderAtoms(orderStep(burger.desc)).join("|") === "מידת עשייה|ירקות|רטבים", `נקודות: ${orderAtoms(orderStep(burger.desc)).join("|")}`);
ok(orderAtoms(orderStep(pasta.desc)).join("|") === "איזה רוטב|רוטב בצד|פרמז'ן", `פסטה: ${orderAtoms(orderStep(pasta.desc)).join("|")}`);
ok(orderAtoms(orderStep(fish.desc)).join("|") === "מנה מטוגנת|רטבים", `פיש קידס: ${orderAtoms(orderStep(fish.desc)).join("|")}`);
const bq = simpleQuestions(burger);
ok(bq.length === 2 && bq[0].kind === "order" && bq[1].kind === "number" && bq[1].n === 120 && /כמה גרם בשר בקר/.test(bq[1].ask), `המבורגר: 2 שאלות — הזמנה + 120 גרם (${bq.map((q) => q.ask).join(" | ")})`);
const g = gradeSimple(bq[0], "מידת עשייה, ירקות ואיזה רוטב");
ok(g.lvl === 2, `תשובה מלאה בניסוח אחר ⇒ מלא (${g.hits.join(",")})`);
ok(gradeSimple(bq[0], "מידת העשייה ותוספת לבחירה").lvl === 2, "הנקודה הראשונה (80%) ⇒ מלא גם בלי השאר");
ok(gradeSimple(bq[0], "ירקות ורטבים").lvl === 1, "רק המשניות ⇒ חלקי");
ok(gradeSimple(bq[0], "אם הוא רוצה קולה").lvl === 0, "לא קשור ⇒ 0");
ok(gradeSimple(bq[0], "מדיום או וול דאן, חסה ועגבנייה, קטשופ").lvl === 2 && gradeSimple(bq[0], "מדיום או וול דאן, חסה ועגבנייה, קטשופ").hits.join() === "1,1,1", "מופעים: מדיום ⇒ מידת עשייה · חסה ⇒ ירקות · קטשופ ⇒ רטבים");
// שניצל ילדים (יותם): «קטשופ ומיונז» הם הרטבים — לא לשלול
const schn = { name: "שניצל ילדים", category: "ילדים", ingredients: ["חזה עוף", "פנקו"], desc: "חזה עוף בציפוי פנקו, מוגש עם תוספת לבחירה. בלקיחת ההזמנה: לשאול על רטבים · לשאול על תוספת לבחירה. עריכה: סכין משוננת." };
const sq = simpleQuestions(schn)[0];
const sg = gradeSimple(sq, "קטשופ ומיונז");
ok(sg.lvl === 2 && sg.hits[0] === 1 && sg.said[0].join() === "קטשופ,מיונז", `שניצל: «קטשופ ומיונז» ⇒ רטבים ✓ (80%) (${sg.hits.join(",")}; ${sg.said[0]})`);
ok(gradeSimple(sq, "צ'יפס או סלט").lvl === 1, "רק התוספת (המשנית) ⇒ חלקי");
ok(gradeSimple(bq[1], "120 גרם").lvl === 2 && gradeSimple(bq[1], "מאה גרם").lvl === 1 && gradeSimple(bq[1], "250").lvl === 0, "120 מדויק · 100 קרוב (חלקי+תיקון) · 250 רחוק");
const pq = simpleQuestions(pasta);
ok(pq.length === 1 && gradeSimple(pq[0], "איזה רוטב הוא רוצה, אם הרוטב בצד ואם עם פרמזן").lvl === 2, `פסטה: שאלת הזמנה אחת, פרמזן בלי גרש מזוכה (${pq[0] && gradeSimple(pq[0], "איזה רוטב הוא רוצה, אם הרוטב בצד ואם עם פרמזן").hits})`);
// פסטה ילדים (יותם): «שמנת או רוזה או עגבניות» = האופציות מהכרטיס ⇒ עונה על «איזה רוטב» = 80% = מלא
const pg = gradeSimple(pq[0], "שמנת או רוזה או עגבניות");
ok(pg.lvl === 2 && pg.hits[0] === 1 && pg.said[0].length >= 3, `פסטה: האופציות מהכרטיס עונות על «איזה רוטב» (${pg.hits.join(",")}; ${pg.said[0]})`);
ok(pq[0].inst[0].includes("רוזה") && /שמנת, רוזה, עגבניות/.test(pq[0].answerText), `האופציות נלקחות מהכרטיס עצמו (${pq[0].answerText})`);
const nq = simpleQuestions(nems);
ok(nq.some((q) => q.kind === "number" && q.n === 2 && /יחידות/.test(q.ask)), "«2 יח'» ⇒ שאלת יחידות");
// לכל N סועדים — ההצעה של יותם לבייגל בסלון (הנתון ייכנס לתיאור כשיאושר)
const bagel = { name: "בייגל קולורי", category: "Greek Oven Breads", ingredients: ["קציפת פטה"], desc: "מוגש עם קציפת פטה. בלקיחת ההזמנה: להציע בתחילת ההזמנה — בייגל אחד לכל 2 סועדים." };
const bg = simpleQuestions(bagel);
const per = bg.find((q) => q.kind === "per");
ok(per && per.n === 4 && /שולחן של 8/.test(per.ask), `בייגל: כמה לשולחן של 8 ⇒ 4 (${per?.ask})`);
ok(gradeSimple(per, "4").lvl === 2 && gradeSimple(per, "אחד לכל 2 סועדים").lvl === 2, "4 / «אחד לכל 2» ⇒ מלא");
ok(gradeSimple(per, "אחד לכל 3").lvl === 1 && gradeSimple(per, "אחד לכל אחד").lvl === 1 && /ההמלצה/.test(gradeSimple(per, "אחד לכל 3").note), "«לכל 3» / «לכל אחד» ⇒ חלקי עם תיקון, לא אפס");
ok(gradeSimple(per, "אחד לשולחן").lvl === 0, "אחד לשולחן ⇒ 0");
console.log(fail ? `\n🔴 ${fail} כשלים` : "simpleDish.test: כל הבדיקות עברו");
process.exit(fail ? 1 : 0);
