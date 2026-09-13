import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import AnswerInput from "../components/AnswerInput";
import { buildVocab } from "../lib/examSuggest";
import { menuFromCards } from "../lib/examMenu";
import { isKeyOf } from "../lib/ingredientKeys";
import { ingLabel, nLabel } from "../games/shared";
import { warningGroups, GROUP_NOTES, ITEM_NOTES } from "../games/WarningBoxes";
import { isKnowledgeCard } from "../lib/examFixed";

// ══ המדריך האינטראקטיבי — עותק של המסעדה, לצורך הלימוד בלבד (יותם, 13.9) ══
//
// «אולי הבעיה עם הטוטוריאל היא שאתה מנסה לכפות אותו על האפליקציה וזה לא מתאים לקצב.
//  תתאים מדריך אינטראקטיבי לכל מסעדה — שכשנכנסים בפעם הראשונה נכנסים לעותק מדויק של
//  המסעדה, רק לצורך המדריך. שיהיה אינטראקטיבי, עם המידע המדויק של המסעדה, ופשוט.»
//
// 🔴 ההבדל מהסיור הקודם: הסיור הישן היה **שכבה מעל האפליקציה החיה** — הוא חיפש אלמנטים
// אמיתיים, מדד אותם, החשיך את השאר, והמתין להקשה שתגיע למקום הנכון. כל דיליי, כל קפיצה
// וכל צעד שנתקע נבעו מזה: הוא היה תלוי במסך של מישהו אחר. כאן אין מדידה, אין החשכה ואין
// עוגנים — המסך **הוא** המדריך, והוא מרנדר את המסעדה מהנתונים האמיתיים:
//   · שם המסעדה, התפריטים, הקטגוריות, המנות, התמונות, התיאורים וקבוצות האזהרה — הכול
//     מ-`cards` (published_menu) של אותה מסעדה בדיוק. שתי מסעדות ⇒ שני מדריכים שונים,
//     בלי שורת קוד אחת שמכירה מסעדה.
//   · שום דבר לא נשמר: אין learnItem, אין exam_results, אין מונים. זה ארגז חול.
//   · כל צעד מתקדם מהקשה אמיתית על הדבר עצמו — לא מכפתור «הבא» שמדלג מעל התוכן.
//
// ⚠️ אין כאן `position: fixed` ואין portal: זה מסך מלא רגיל (early return ב-MainApp),
// ולכן הוא חסין למחלקת «הכלא של backdrop-filter» שהפילה כל שכבה קודמת.

const STEPS = ["ברוכים הבאים", "התפריט", "הקטגוריה", "המנה", "האזהרות", "כרטיסייה", "בוחן", "מוכנים"];

/** בוחר את מסלול ההדגמה מהתפריט האמיתי: תפריט ⇒ קטגוריה ⇒ מנה שיש בה מה ללמד. */
function pickPath(cards) {
  const real = (cards || []).filter((c) => !isKnowledgeCard(c));
  const score = (c) =>
    (c.ingredients?.length ? 2 : 0) +
    (c.desc ? 2 : 0) +
    (warningGroups(c, false).length ? 3 : 0) +
    (c.imageUrl ? 1 : 0);
  const best = real.slice().sort((a, b) => score(b) - score(a))[0] || null;
  return best;
}

export default function Tutorial({ session, cards, onDone }) {
  const [step, setStep] = useState(0);
  const [openGroup, setOpenGroup] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(null);
  const [answer, setAnswer] = useState([]);
  const [sent, setSent] = useState(false);

  const merged = session?.features?.warnings === "merged";
  const dish = useMemo(() => pickPath(cards), [cards]);
  const menuName = dish?.menuGroup || "התפריט";
  const catName = dish?.category || "";

  // התפריטים והקטגוריות האמיתיים של המסעדה — בדיוק מה שיופיע בשער התפריט אחרי המדריך.
  const menus = useMemo(() => {
    const seen = new Map();
    for (const c of cards || []) {
      const g = c.menuGroup || "התפריט";
      if (!seen.has(g)) seen.set(g, { name: g, count: 0, img: null });
      const e = seen.get(g);
      e.count += 1;
      if (!e.img && c.imageUrl) e.img = c.imageUrl;
    }
    return [...seen.values()];
  }, [cards]);

  const cats = useMemo(() => {
    const seen = new Map();
    for (const c of cards || []) {
      if ((c.menuGroup || "התפריט") !== menuName) continue;
      const k = c.category || "";
      if (!seen.has(k)) seen.set(k, { name: k, count: 0, img: null });
      const e = seen.get(k);
      e.count += 1;
      if (!e.img && c.imageUrl) e.img = c.imageUrl;
    }
    return [...seen.values()];
  }, [cards, menuName]);

  const dishes = useMemo(
    () => (cards || []).filter((c) => (c.menuGroup || "התפריט") === menuName && (c.category || "") === catName),
    [cards, menuName, catName],
  );

  const vocab = useMemo(() => buildVocab(menuFromCards(cards || [])), [cards]);
  const groups = dish ? warningGroups(dish, merged) : [];

  // מסעדה בלי תפריט טעון — אין מה להדגים, ולא נועלים את המלצר מאחורי מדריך ריק.
  if (!dish) {
    onDone?.();
    return null;
  }

  const go = (n) => { setStep(n); setOpenGroup(null); };

  const Coach = ({ children, hint }) => (
    <div className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-[#0c0d10]">
      <div className="flex items-center gap-1.5 mb-2.5">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1 rounded-full flex-1 ${i <= step ? "bg-[#22c08c]" : "bg-[#22252b]"}`} />
        ))}
      </div>
      <p className="text-[15px] font-black text-[#eef0f6] leading-snug">{children}</p>
      {hint && <p className="text-[12px] font-bold text-[#22c08c] mt-1">{hint}</p>}
    </div>
  );

  const Tile = ({ name, count, img, onClick }) => (
    <button
      onClick={onClick}
      className="w-full text-right flex items-center gap-3 bg-[#16181c] border border-[#22252b] rounded-2xl p-3 active:scale-[0.99] transition-transform"
    >
      <span className="w-14 h-14 rounded-xl bg-[#0f2a22] overflow-hidden flex-shrink-0 flex items-center justify-center text-xl">
        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🍽️"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-black text-[#eef0f6] truncate">{name}</span>
        <span className="block text-[12px] text-[#8a8aa0]">{count} מנות</span>
      </span>
      <ChevronLeft size={18} className="text-[#5a5a6e] flex-shrink-0" />
    </button>
  );

  const Frame = ({ children }) => (
    <div className="h-screen flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="flex-1 overflow-y-auto">{children}</div>
      <div className="px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-[#16181c] flex justify-between items-center">
        <button onClick={onDone} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">דילוג על המדריך</button>
        {step > 0 && (
          <button onClick={() => go(step - 1)} className="text-[11px] font-bold text-[#5a5a6e] min-h-[44px] px-1">→ אחורה</button>
        )}
      </div>
    </div>
  );

  const Next = ({ children, onClick }) => (
    <button
      onClick={onClick}
      className="w-full py-3.5 min-h-[48px] rounded-xl font-black text-[15px] bg-[#22c08c] text-[#06231a] active:scale-[0.99] transition-transform"
    >
      {children}
    </button>
  );

  // ── 0 · ברוכים הבאים ─────────────────────────────────────────────────────────
  if (step === 0)
    return (
      <Frame>
        <Coach>המדריך הזה רץ על התפריט האמיתי של {session?.restaurantName || "המסעדה"}.</Coach>
        <div className="px-4 pb-6 space-y-4">
          <div className="rounded-3xl p-5 border border-[rgba(34,192,140,0.25)]"
            style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.12),rgba(15,92,70,0.16))" }}>
            <p className="text-[22px] font-black text-[#eef0f6] leading-tight">{session?.restaurantName || "המסעדה"}</p>
            {session?.restaurantCuisineTypes?.length > 0 && (
              <p className="text-[13px] font-bold text-[#9fe8cd] mt-1">{session.restaurantCuisineTypes.join(" · ")}</p>
            )}
            <div className="flex gap-2 mt-4">
              <span className="flex-1 bg-[#0c0d10]/50 rounded-xl p-3 text-center">
                <span className="block text-[20px] font-black text-[#22c08c]">{cards.length}</span>
                <span className="block text-[11px] text-[#8a8aa0]">פריטים</span>
              </span>
              <span className="flex-1 bg-[#0c0d10]/50 rounded-xl p-3 text-center">
                <span className="block text-[20px] font-black text-[#22c08c]">{menus.length}</span>
                <span className="block text-[11px] text-[#8a8aa0]">{menus.length === 1 ? "תפריט" : "תפריטים"}</span>
              </span>
            </div>
          </div>
          <p className="text-[14px] text-[#c4c4d4] leading-relaxed">
            נעבור יחד על מנה אחת אמיתית — נפתח אותה, נקרא את האזהרות, נתרגל אותה בכרטיסייה
            וניגש לבוחן קצר. <span className="font-black text-[#eef0f6]">שום דבר כאן לא נשמר.</span>
          </p>
          <Next onClick={() => go(1)}>יאללה, מתחילים</Next>
        </div>
      </Frame>
    );

  // ── 1 · התפריט ───────────────────────────────────────────────────────────────
  if (step === 1)
    return (
      <Frame>
        <Coach hint={`הקש/י על ״${menuName}״`}>אלה התפריטים של המסעדה. כל אחד פותח את הקטגוריות שבו.</Coach>
        <div className="px-4 pb-6 space-y-2">
          {menus.map((m) => (
            <Tile key={m.name} {...m} onClick={() => m.name === menuName ? go(2) : null} />
          ))}
        </div>
      </Frame>
    );

  // ── 2 · הקטגוריה ─────────────────────────────────────────────────────────────
  if (step === 2)
    return (
      <Frame>
        <Coach hint={`הקש/י על ״${catName}״`}>בתוך כל תפריט יש קטגוריות. הן מסודרות בסדר של התפריט המודפס.</Coach>
        <div className="px-4 pb-6 space-y-2">
          <p className="text-[12px] font-bold text-[#5a5a6e] px-1">{menuName}</p>
          {cats.map((c) => (
            <Tile key={c.name} {...c} onClick={() => c.name === catName ? go(3) : null} />
          ))}
        </div>
      </Frame>
    );

  // ── 3 · רשימת המנות ──────────────────────────────────────────────────────────
  if (step === 3)
    return (
      <Frame>
        <Coach hint={`הקש/י על ״${dish.name}״`}>אלה המנות. הקשה על מנה פותחת אותה על כל המסך.</Coach>
        <div className="px-4 pb-6 space-y-2">
          <p className="text-[12px] font-bold text-[#5a5a6e] px-1">{catName}</p>
          {dishes.map((d) => (
            <button
              key={d.id}
              onClick={() => d.id === dish.id ? go(4) : null}
              className="w-full text-right flex items-center gap-3 bg-[#16181c] border border-[#22252b] rounded-2xl p-3"
            >
              <span className="w-12 h-12 rounded-lg bg-[#0f2a22] overflow-hidden flex-shrink-0 flex items-center justify-center">
                {d.imageUrl ? <img src={d.imageUrl} alt="" className="w-full h-full object-cover" /> : "🍽️"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-black text-[#eef0f6] truncate">{d.name}</span>
                {d.desc && <span className="block text-[11px] text-[#8a8aa0] truncate">{d.desc}</span>}
              </span>
            </button>
          ))}
        </div>
      </Frame>
    );

  // ── 4 · מסך המנה + האזהרות ───────────────────────────────────────────────────
  if (step === 4)
    return (
      <Frame>
        <Coach hint={groups.length ? "הקש/י על קבוצת אזהרה כדי לראות מה זה אומר" : undefined}>
          ככה נראית מנה: תמונה, תיאור, {ingLabel(dish)} — ולמטה האזהרות בצבע.
        </Coach>
        <div className="px-4 pb-6 space-y-3">
          {dish.imageUrl && (
            <img src={dish.imageUrl} alt="" className="w-full h-44 object-cover rounded-2xl" />
          )}
          <p className="text-[19px] font-black text-[#eef0f6] leading-tight">{dish.name}</p>
          {dish.desc && <p className="text-[14px] text-[#c4c4d4] leading-relaxed">{dish.desc}</p>}
          {dish.ingredients?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#5a5a6e] mb-1.5">{ingLabel(dish)}</p>
              <div className="flex flex-wrap gap-1.5">
                {dish.ingredients.map((g) => (
                  <span key={g} className="text-[12px] bg-[#16181c] border border-[#22252b] text-[#c4c4d4] rounded-lg px-2 py-1">{g}</span>
                ))}
              </div>
            </div>
          )}
          {groups.map((g) => {
            const tone = g.key === "allergens" ? { bg: "bg-[#3a1d22]", fg: "text-[#e0315a]", ring: "border-[#e0315a]" }
              : g.key === "pregnancy" ? { bg: "bg-[#2a1d3a]", fg: "text-[#b48cff]", ring: "border-[#b48cff]" }
              : { bg: "bg-[#3a2f1d]", fg: "text-[#f3c14b]", ring: "border-[#f3c14b]" };
            const open = openGroup === g.key;
            return (
              <button
                key={g.key}
                onClick={() => setOpenGroup(open ? null : g.key)}
                className={`w-full text-right ${tone.bg} ${open ? `border ${tone.ring}` : "border border-transparent"} rounded-xl p-3 transition-colors`}
              >
                <p className={`text-[13px] font-black ${tone.fg}`}>{g.title}: {g.items.join(", ")}</p>
                {open && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[12px] text-[#eef0f6] leading-relaxed">{GROUP_NOTES[g.key]}</p>
                    {g.items.filter((i) => ITEM_NOTES[i]).map((i) => (
                      <p key={i} className="text-[12px] text-[#c4c4d4]">
                        <span className="font-black">{i}</span> — {ITEM_NOTES[i]}
                      </p>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          <Next onClick={() => go(5)}>הבנתי — לתרגול</Next>
        </div>
      </Frame>
    );

  // ── 5 · כרטיסייה ─────────────────────────────────────────────────────────────
  if (step === 5)
    return (
      <Frame>
        <Coach hint={flipped ? "עכשיו דרג/י כמה ידעת" : "נסה/י להיזכר, ואז הפוך/י את הכרטיס"}>
          בתרגול רואים את שם המנה בלבד — ובודקים את עצמכם.
        </Coach>
        <div className="px-4 pb-6 space-y-3">
          <div className="bg-[#16181c] border border-[#22252b] rounded-3xl p-5 min-h-[210px] flex flex-col justify-center">
            <p className="text-[11px] font-bold text-[#5a5a6e] mb-2">{catName}</p>
            <p className="text-[21px] font-black text-[#eef0f6] leading-tight">{dish.name}</p>
            {!flipped ? (
              <p className="text-[13px] text-[#8a8aa0] mt-3">
                {dish.ingredients?.length > 0 ? `${dish.ingredients.length} ${ingLabel(dish)}` : "מה יש במנה?"}
                {groups.length > 0 && ` · ${nLabel(groups.length, "קבוצת אזהרה", "קבוצות אזהרה")}`}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {dish.ingredients?.length > 0 && (
                  <p className="text-[13px] text-[#c4c4d4] leading-relaxed">
                    <span className="font-black text-[#eef0f6]">{ingLabel(dish)}: </span>
                    {dish.ingredients.join(", ")}
                  </p>
                )}
                {groups.map((g) => (
                  <p key={g.key} className="text-[12px] text-[#c4c4d4]">
                    <span className="font-black text-[#eef0f6]">{g.title}: </span>{g.items.join(", ")}
                  </p>
                ))}
              </div>
            )}
          </div>
          {!flipped ? (
            <Next onClick={() => setFlipped(true)}>בדוק/י את עצמך</Next>
          ) : (
            <>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRated(n)}
                    className={`flex-1 py-3 min-h-[48px] rounded-xl font-black text-[15px] border ${
                      rated === n ? "bg-[#22c08c] text-[#06231a] border-[#22c08c]" : "bg-[#16181c] text-[#c4c4d4] border-[#22252b]"
                    }`}
                  >{n}</button>
                ))}
              </div>
              <p className="text-[11px] text-[#5a5a6e] text-center">5 = ידעת הכול · 1 = בכלל לא. מנה שקיבלה 5 פעמיים ברצף יוצאת מהסבב.</p>
              {rated && <Next onClick={() => go(6)}>לבוחן</Next>}
            </>
          )}
        </div>
      </Frame>
    );

  // ── 6 · בוחן ─────────────────────────────────────────────────────────────────
  if (step === 6) {
    const got = (dish.ingredients || []).filter((ing) => answer.some((a) => isKeyOf(a, ing) || isKeyOf(ing, a)));
    return (
      <Frame>
        <Coach hint={sent ? undefined : "כתבו מה שאתם זוכרים — ההשלמה עוזרת באיות"}>
          בבוחן עונים בכתיבה חופשית, כמו לאורח.
        </Coach>
        <div className="px-4 pb-6 space-y-3">
          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4">
            <p className="text-[15px] font-black text-[#eef0f6] leading-snug">
              מה יש ב<span className="text-[#22c08c]">{dish.name}</span>?
            </p>
          </div>
          <AnswerInput vocab={vocab} values={answer} onChange={setAnswer} label={ingLabel(dish)} disabled={sent} />
          {!sent ? (
            <Next onClick={() => setSent(true)}>שליחה</Next>
          ) : (
            <>
              <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-4 space-y-2">
                <p className="text-[13px] font-black text-[#22c08c]">
                  {got.length} מתוך {dish.ingredients?.length || 0} — ככה זה נראה
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(dish.ingredients || []).map((g) => (
                    <span key={g} className={`text-[12px] rounded-lg px-2 py-1 border ${
                      got.includes(g) ? "bg-[#0f2a22] text-[#22c08c] border-[#22c08c]" : "bg-[#16181c] text-[#8a8aa0] border-[#22252b]"
                    }`}>{g}</span>
                  ))}
                </div>
                <p className="text-[11px] text-[#5a5a6e] leading-relaxed">
                  במבחן האמיתי אין ציון על המסך — המנהל/ת עובר/ת על התשובות ומודיע/ה לך.
                </p>
              </div>
              <Next onClick={() => go(7)}>סיימנו</Next>
            </>
          )}
        </div>
      </Frame>
    );
  }

  // ── 7 · מוכנים ───────────────────────────────────────────────────────────────
  return (
    <Frame>
      <Coach>זהו — זה כל המסלול.</Coach>
      <div className="px-4 pb-6 space-y-4">
        <div className="rounded-3xl p-5 border border-[rgba(34,192,140,0.25)] space-y-2.5"
          style={{ background: "linear-gradient(150deg,rgba(34,192,140,0.12),rgba(15,92,70,0.16))" }}>
          {[
            ["📖", "קוראים את התפריט", "מנה, תיאור, אזהרות בצבע."],
            ["🎴", "מתרגלים בכרטיסיות", "נזכרים, הופכים, מדרגים."],
            ["🎓", "נבחנים", "בוחן קצר לכל קטגוריה, בכתיבה."],
          ].map(([e, t, d]) => (
            <div key={t} className="flex gap-3 items-start">
              <span className="text-[18px]">{e}</span>
              <span className="flex-1">
                <span className="block text-[14px] font-black text-[#eef0f6]">{t}</span>
                <span className="block text-[12px] text-[#c4c4d4]">{d}</span>
              </span>
            </div>
          ))}
        </div>
        {session?.features?.metrics !== false && (
          <p className="text-[12px] text-[#5a5a6e] text-center">אפשר להריץ את המדריך שוב בכל רגע ממסך המדדים.</p>
        )}
        <Next onClick={onDone}>להתחיל ללמוד</Next>
      </div>
    </Frame>
  );
}
