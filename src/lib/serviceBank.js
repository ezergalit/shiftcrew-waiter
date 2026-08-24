// בנק שאלות השירות — Tier A: the professional standard, identical in every restaurant.
//
// Everything that legitimately differs between houses lives in serviceStandard.js. What is
// here is what does not differ: you never argue with a complaining guest, you never carry a
// wine glass by the bowl, an allergy is never handled by scraping something off a plate.
//
// ── The one structural idea that makes these questions hard to cheat ──────────────────
//
// Every distractor is a REAL professional action that is the right answer to a DIFFERENT
// question in this same bank. That is the trick CategoryExam already uses with ingredients:
// when every option is something a good waiter genuinely does, "which of these sounds
// professional" tells you nothing, and the only way through is knowing which one belongs to
// THIS moment.
//
// The failure this prevents is the classic fake question:
//   "אורח מתלונן — (א) להקשיב (ב) להתווכח (ג) להתעלם (ד) לצחוק"
// which measures whether you are a decent person, not whether you were trained.
// tests/service.test.mjs enforces it as the ELIMINABLE gate and fails the build on it — so
// adding a question with a convenient straw man is not possible without noticing.
//
// ⚠️ ACTIONS is a FLAT namespace on purpose. Service actions cross modules constantly —
// "call the manager" belongs to a complaint and to a bar refusal alike — and the first
// version of this file namespaced them per module, which made every such question fail to
// render.
//
// ⚠️ Anything the house decides is NOT here. Which side you serve from, how long before
// the greeting, where the napkin goes — those live in serviceStandard.js, because asserting
// a universal answer to them would teach a waiter something false about their own floor.

export const MODULES = {
  S1: { title: "קבלת אורח", role: "floor" },
  S2: { title: "רצף השירות", role: "floor" },
  S3: { title: "הגשה וטכניקה", role: "floor" },
  S4: { title: "אלרגיות ובטיחות", role: "any", critical: true },
  S5: { title: "אורחים ומצבים", role: "any" },
  S6: { title: "היגיינה ומראה", role: "any" },
  S7: { title: "בר", role: "bar" },
};

// ── The action pool ──────────────────────────────────────────────────────────────────
// Real things a trained waiter or bartender does. Every one of them is the correct answer
// to at least one question below — that invariant is what the ELIMINABLE gate checks.
export const ACTIONS = {
  // קבלת אורח
  greet_eye: "ליצור קשר עין ולברך, גם בלי להגיע לשולחן",
  seat_offer: "להושיב את האורחים ולמשוך כיסא",
  take_coats: "להציע לקחת מעילים",
  give_menus: "לחלק תפריטים פתוחים",
  check_reservation: "לאתר את ההזמנה ביומן",
  offer_wait: "לתת זמן המתנה מדויק ומקום להמתין בו",
  call_host: "לקרוא למי שאחראי/ת על ההושבה",
  highchair: "להביא כיסא הגבהה בלי שביקשו",
  announce_specials: "לספר על המנות המיוחדות של היום",
  // רצף השירות
  take_order: "לקחת את ההזמנה",
  repeat_order: "לחזור על ההזמנה בקול לפני שידור",
  fire_kitchen: "לשדר את ההזמנה למטבח",
  mark_table: "להתאים את הסכו״ם למנות שהוזמנו",
  check_back: "לחזור לבדוק שביעות רצון",
  clear_course: "לפנות את צלחות המנה שהסתיימה",
  crumb_down: "לנקות פירורים מהשולחן",
  offer_dessert: "להציע קינוח ותפריט חם",
  bring_bill: "להביא את החשבון",
  farewell: "ללוות לדלת ולהיפרד בשם",
  hold_course: "לעכב את המנה הבאה עד שהשולחן מוכן",
  refill_water: "למלא מחדש בלי שביקשו",
  // הגשה וטכניקה
  stem_hold: "לאחוז את הכוס ברגל בלבד",
  plate_rim: "לאחוז צלחת בשוליים בלבד",
  announce_dish: "להכריז את שם המנה בזמן ההנחה",
  serve_together: "להגיש לכל השולחן יחד",
  tray_shoulder: "לשאת על כף היד בגובה הכתף",
  open_wine_label: "להציג את הבקבוק עם התווית לפני הפתיחה",
  pour_taste: "למזוג טעימה למי שהזמין",
  pour_rest: "למלא את כוסות שאר השולחן",
  decant: "לדקנט את היין לקנקן",
  napkin_refold: "לקפל מחדש את המפית",
  clear_quiet: "לפנות בלי לערום מול האורחים",
  cutlery_replace: "להחליף סכו״ם בין מנות",
  // אלרגיות ובטיחות
  tell_kitchen: "ליידע את המטבח ואת מנהל המשמרת",
  read_back: "לחזור בקול על מה שנאמר",
  check_ingredients: "לבדוק את המרכיבים מול המטבח ולחזור",
  say_dont_know: "לומר בכנות שצריך לבדוק",
  separate_prep: "לוודא שההכנה נעשית בנפרד",
  refuse_guess: "לא לאשר מנה שאין לגביה ודאות",
  new_plate: "להכין את המנה מחדש מאפס",
  log_temp: "לרשום טמפרטורה ביומן",
  flag_allergy_pass: "לסמן את הצלחת שלא תתחלף",
  // אורחים ומצבים
  listen_full: "להקשיב עד הסוף בלי להפריע",
  apologize_house: "להתנצל בשם המסעדה",
  own_it: "לקחת אחריות בלי להאשים את המטבח",
  call_manager: "לערב את מנהל המשמרת",
  offer_fix: "להציע פתרון קונקרטי לבחירת האורח",
  remove_item: "להוריד את הפריט מהחשבון",
  replace_dish: "להביא את המנה שהוזמנה",
  stop_service: "להפסיק להגיש אלכוהול",
  offer_food_water: "להציע מים ומשהו לאכול",
  arrange_ride: "לסדר הסעה לאורח",
  note_regular: "לרשום את ההעדפה בכרטיס",
  quiet_move: "להציע העברה לפינה רגועה",
  // היגיינה ומראה
  wash_hands: "לשטוף ידיים במים וסבון",
  tie_hair: "לאסוף את השיער ולכסות",
  no_jewelry: "להסיר טבעות ושעון",
  change_gloves: "להחליף כפפות בין שלבים",
  clean_apron: "להחליף לסינר נקי",
  no_taste_service: "לא לטעום מכלי ההגשה",
  cover_cut: "לכסות פצע בפלסטר ובכפפה",
  stay_home: "להישאר בבית ולעדכן מנהל",
  separate_boards: "להפריד כלים לפי חומר גלם",
  // בר
  jigger: "למדוד כל רכיב עם ג׳יגר",
  shake_citrus: "לנער בשייקר (shake)",
  stir_spirits: "לערבב בכוס ערבוב (stir)",
  fresh_ice: "להשתמש בקרח טרי לכל משקה",
  chill_glass: "לצנן את הכוס לפני המזיגה",
  express_peel: "לסחוט שמני קליפה מעל",
  strain_double: "לסנן סינון כפול לכוס",
  build_glass: "לבנות את המשקה בכוס עצמה",
  check_id: "לבקש תעודה מזהה מהאורח",
  rinse_between: "לשטוף שייקר בין משקאות",
};

const Q = (module, kind, prompt, a, d, why, extra = {}) => ({ module, kind, prompt, a, d, why, ...extra });

// ⚠️ SEMANTIC PAIRS — actions a waiter would read as the same answer.
//
// This exists because a real ambiguity slipped past every automated gate: "להביא מנה חדשה
// במקום זו שיצאה" and "להביא מנה חדשה במקום להוריד רכיב" appeared in ONE allergy question,
// and Jaccard put them under the near-duplicate threshold because the words differ. Word
// similarity cannot see that two options mean the same thing — the same lesson as rule 16 in
// QUESTION-QUALITY.md, where the engine could not see that a second option was simply also
// correct. So the pairs are declared by hand and enforced by the build.
// A third element "sequence" means the two are consecutive steps rather than synonyms: a
// prompt that asks what comes FIRST, or asks for the order, genuinely distinguishes them.
export const CONFLICTS = [
  ["new_plate", "replace_dish"],       // both "bring another plate"
  ["say_dont_know", "refuse_guess"],   // both "do not commit without certainty"
  ["say_dont_know", "check_ingredients"], // "I'll check" and "go and check" are one act
  ["wash_hands", "change_gloves"],     // at a changeover you do both, so neither is THE answer
  ["listen_full", "apologize_house", "sequence"], // adjacent steps — a "first"/order prompt does separate them
];

// Where each action "lives" — the module of the question that has it as its answer. Used to
// check that a distractor belongs to a module this role actually studies: a bartender shown
// "לקפל מחדש מפית" has been handed a free elimination.
export function homeModule(key) {
  for (const e of BANK) {
    if (e.a === key) return e.module;
    if ((e.multiAnswers || []).includes(key)) return e.module;
    if ((e.sequence || []).includes(key)) return e.module;
  }
  return null;
}

export const BANK = [
  // ── S1 · קבלת אורח ──────────────────────────────────────────────────────────────
  Q("S1", "first", "אורחים נכנסים ואת/ה באמצע מזיגה לשולחן אחר. מה הדבר הראשון?",
    "greet_eye", ["seat_offer", "call_host", "give_menus"],
    "אורח שלא זכה למבט מרגיש שלא ראו אותו, וזה הרושם הראשון. קשר עין אורך שנייה ואפשר לתת אותו גם כשהידיים תפוסות."),
  Q("S1", "choice", "זוג הגיע בלי הזמנה וכל השולחנות תפוסים. מה עושים?",
    "offer_wait", ["call_host", "check_reservation", "seat_offer"],
    "״אין מקום״ מבריח; זמן המתנה מדויק ומקום לחכות בו שומר על האורח. הערכה שמרנית עדיפה — עדיף להפתיע לטובה."),
  Q("S1", "choice", "אורח מגיע ואומר שיש לו הזמנה על שם כהן. מה קודם?",
    "check_reservation", ["seat_offer", "give_menus", "take_coats"],
    "אישור ההזמנה לפני ההושבה תופס שולחן שהוקצה למישהו אחר, ומאפשר לקבל את האורח בשמו."),
  Q("S1", "choice", "אישרת את ההזמנה והשולחן מוכן. מה עכשיו?",
    "seat_offer", ["give_menus", "announce_specials", "highchair"],
    "ההושבה היא רגע פיזי: להוביל בקצב של האורח, להצביע על השולחן, ולמשוך כיסא למי שנוח לו בכך."),
  Q("S1", "choice", "האורחים התיישבו. מה הפעולה הבאה?",
    "give_menus", ["announce_specials", "take_order", "check_reservation"],
    "תפריט פתוח ביד נותן לאורח משהו לעשות ומסמן שהשירות התחיל. הזמנה נלקחת רק אחרי שהיה זמן לקרוא."),
  Q("S1", "choice", "משפחה עם תינוק בעגלה מתיישבת. מה נכון לעשות מיד?",
    "highchair", ["take_coats", "give_menus", "announce_specials"],
    "שירות טוב הוא לראות את הצורך לפני שמבקשים. גם מיקום השולחן נחשב — עגלה לא חוסמת מעבר."),
  Q("S1", "choice", "אורחת הגיעה עם מעיל ביום גשום. מה מציעים לה?",
    "take_coats", ["highchair", "give_menus", "seat_offer"],
    "מעיל רטוב על גב הכיסא מפריע לאורחת ולמלצר. הצעה לקחת אותו היא סימן מובהק למסעדה שמארחת."),
  Q("S1", "choice", "אורחים ממתינים בכניסה, אין מארח/ת בעמדה ואת/ה תקוע/ה עם שולחן פתוח. מה עושים?",
    "call_host", ["seat_offer", "offer_wait", "greet_eye"],
    "לעזוב שולחן באמצע כדי להושיב זה להחליף בעיה בבעיה. קריאה למי שאחראי על ההושבה פותרת את שתיהן."),
  Q("S1", "choice", "השולחן קיבל תפריטים ואת/ה ניגש/ת אליו. מה חלק מהפנייה הראשונה?",
    "announce_specials", ["take_order", "refill_water", "mark_table"],
    "המיוחדות של היום נאמרות כשהתפריט עוד פתוח. אחרי שההזמנה נסגרה, אותו משפט נשמע כמו ניסיון למכור."),

  // ── S2 · רצף השירות ─────────────────────────────────────────────────────────────
  Q("S2", "choice", "לקחת/ת הזמנה עם שלושה שינויים. מה עושים לפני ששולחים למטבח?",
    "repeat_order", ["fire_kitchen", "mark_table", "check_back"],
    "חזרה בקול תופסת טעות כשהיא עוד חינם. אחרי שהמנה יצאה, אותה טעות עולה מנה, זמן, ואמון."),
  Q("S2", "choice", "השולחן הזמין מנה שדורשת סכין מיוחדת. מתי מתקנים את הערכה?",
    "mark_table", ["fire_kitchen", "clear_course", "cutlery_replace"],
    "התאמת הסכו״ם נעשית לפני שהמנה מגיעה. סכין שמגיעה אחרי הצלחת אומרת לאורח שלא חשבו עליו."),
  Q("S2", "choice", "השולחן סיים עיקריות ורוצה קינוח. מה קורה לפני שמגישים אותו?",
    "crumb_down", ["bring_bill", "farewell", "offer_dessert"],
    "הקינוח מגיע לשולחן נקי. פירורים מהמנה הקודמת מתחת לצלחת הקינוח הם ההבדל בין ״אכלנו״ ל״התארחנו״."),
  Q("S2", "choice", "המטבח מוכן להוציא עיקריות, והשולחן עדיין באמצע הראשונות. מה עושים?",
    "hold_course", ["fire_kitchen", "clear_course", "serve_together"],
    "קצב הארוחה נקבע על ידי השולחן, לא על ידי המעבר. עיקריות מוקדמות מדי דוחסות את האורח ומצננות את האוכל."),
  Q("S2", "choice", "הכוסות בשולחן התרוקנו באמצע הארוחה. מה עושים?",
    "refill_water", ["bring_bill", "check_back", "clear_course"],
    "אורח שנאלץ לבקש מים מרגיש שלא שמים לב אליו. סריקת שולחן כל כמה דקות תופסת את זה לפני הבקשה."),
  Q("S2", "choice", "האורחים שילמו וקמים מהשולחן. מה השלב האחרון?",
    "farewell", ["bring_bill", "clear_course", "crumb_down"],
    "הפרידה היא מה שנזכר. פינוי השולחן בזמן שהאורחים עוד עומדים בו מסמן להם שהמקום ממהר להתפנות."),
  Q("S2", "order", "סדר/י את רצף השירות מהרגע שהאורחים התיישבו.",
    null, null,
    "הרצף הזה הוא שלד המשמרת. כל שלב שמדלגים עליו מורגש — הזמנה שלא חזרו עליה, שולחן שלא בדקו.",
    { sequence: ["give_menus", "take_order", "repeat_order", "fire_kitchen", "check_back", "clear_course", "offer_dessert", "bring_bill"] }),
  Q("S2", "order", "סדר/י את מה שקורה בין סיום העיקריות לבין היציאה.",
    null, null,
    "סוף הארוחה הוא המקום שבו הכי קל למהר, והמקום שבו האורח הכי שם לב.",
    { sequence: ["clear_course", "crumb_down", "offer_dessert", "bring_bill", "farewell"] }),

  // ── S3 · הגשה וטכניקה ───────────────────────────────────────────────────────────
  Q("S3", "choice", "את/ה מביא/ה שתי כוסות יין לשולחן. איך אוחזים אותן?",
    "stem_hold", ["plate_rim", "tray_shoulder", "clear_quiet"],
    "אחיזה בגביע מחממת את היין ומשאירה טביעות אצבע על הזכוכית. הרגל שנראה מיד למי שמבין ביין."),
  Q("S3", "choice", "את/ה נושא/ת מגש עמוס מהמטבח לחדר. מה הטכניקה?",
    "tray_shoulder", ["plate_rim", "stem_hold", "serve_together"],
    "מגש נשען על כף היד ולא נאחז מהצד — כך המשקל מעל הרגליים והיד השנייה פנויה לפתוח דלת."),
  Q("S3", "choice", "בקבוק יין הוזמן לשולחן. מה קורה לפני שפותחים אותו?",
    "open_wine_label", ["pour_taste", "decant", "stem_hold"],
    "הצגת התווית מוודאת שזה הבקבוק, השנה והיצרן שהוזמנו — לפני שהפתיחה הופכת אותו לבלתי-הפיך."),
  Q("S3", "choice", "האורח אישר את הבקבוק ופתחת אותו. מה עכשיו?",
    "pour_taste", ["open_wine_label", "decant", "serve_together"],
    "הטעימה היא בדיקת תקינות ולא בדיקת טעם. היא ניתנת למי שהזמין, לפני שממלאים כוסות שאי אפשר להחזיר."),
  Q("S3", "choice", "אדום צעיר וסגור הוזמן, והאורח מבקש שייפתח עכשיו. מה מציעים?",
    "decant", ["pour_taste", "pour_rest", "open_wine_label"],
    "דקנטציה מאווררת יין סגור ומפרידה משקע ביין ישן. זו ההצעה שמשנה את הכוס, לא רק את הטקס."),
  Q("S3", "choice", "את/ה מניח/ה מנה מול אורח. מה עושים באותו רגע?",
    "announce_dish", ["serve_together", "clear_quiet", "cutlery_replace"],
    "הכרזת שם המנה מונעת את ״של מי זה?״ מעל השולחן, ומוודאת שהמנה נחתה מול מי שהזמין אותה."),
  Q("S3", "choice", "המטבח סיים את כל מה שהוזמן. מה נכון?",
    "serve_together", ["hold_course", "announce_dish", "clear_course"],
    "אף אחד לא אוהב לאכול לבד מול שולחן שמחכה. אם צריך יותר מיד אחת — מביאים עזרה, לא מגישים בסבבים."),
  Q("S3", "choice", "השולחן סיים ראשונות והעיקריות בדרך. מה עושים בערכה?",
    "cutlery_replace", ["crumb_down", "napkin_refold", "mark_table"],
    "סכו״ם נקי לכל מנה. סכין מהראשונה שנשארת לעיקרית מעבירה את הטעם הקודם ואת המראה של שולחן שלא טופל."),
  Q("S3", "choice", "אורח קם לשירותים באמצע הארוחה. מה עושים בשולחן?",
    "napkin_refold", ["clear_course", "cutlery_replace", "crumb_down"],
    "מפית מקופלת מחדש אומרת ״שמרנו לך על המקום״. פינוי הצלחת בזמן שהוא בחוץ אומר את ההפך."),
  Q("S3", "multi", "מה נכון בפינוי צלחות משולחן שסיים? בחר/י את כל התשובות הנכונות.",
    null, null,
    "פינוי הוא רגע שקט. ערימה מול האורחים וקרקוש הם רעש שמזכיר לאורח שהוא יושב במקום עבודה.",
    { multiAnswers: ["clear_quiet", "plate_rim"], multiDistractors: ["announce_dish", "decant"] }),
  Q("S3", "order", "סדר/י את שלבי הגשת בקבוק יין.",
    null, null,
    "סדר קבוע ששומר על האורח: לוודא שזה הבקבוק, לפתוח, לתת לטעום, ורק אז למלא כוסות.",
    { sequence: ["open_wine_label", "pour_taste", "pour_rest", "serve_together"] }),

  // ── S4 · אלרגיות ובטיחות ────────────────────────────────────────────────────────
  Q("S4", "first", "אורח אומר ״יש לי אלרגיה לאגוזים״. מה הדבר הראשון?",
    "read_back", ["tell_kitchen", "check_ingredients", "separate_prep"],
    "לחזור בקול תופס את המקרה שבו שמעת ״אגוזים״ והוא אמר ״בוטנים״. כל שאר השרשרת נשענת על השמיעה הזו."),
  Q("S4", "choice", "אישרת עם האורח שהאלרגיה היא לשומשום. מה השלב הבא?",
    "tell_kitchen", ["separate_prep", "new_plate", "flag_allergy_pass"],
    "האלרגיה מפסיקה להיות בעיה שלך ברגע שהיא רשומה אצל מי שמבשל ואצל מי שאחראי על המשמרת. מלצר שמחזיק אותה לעצמו הוא נקודת כשל יחידה."),
  Q("S4", "choice", "אורח שאל אם יש חלב במנה, ואין לך ודאות. מה עונים לו?",
    "say_dont_know", ["separate_prep", "tell_kitchen", "new_plate"],
    "״אני אבדוק ואחזור אליך״ הוא תשובה מקצועית לחלוטין. ניחוש בשדה הזה הוא הדבר היחיד בתפריט שיכול לשלוח אורח לבית חולים."),
  Q("S4", "choice", "אמרת לאורח שתבדוק אם יש בוטנים ברוטב. מה עושים עכשיו?",
    "check_ingredients", ["separate_prep", "flag_allergy_pass", "new_plate"],
    "בדיקה מול מי שמכין, לא מול הזיכרון ולא מול התיאור בתפריט. רוטב הוא בדיוק המקום שבו רכיב לא מופיע בשם המנה."),
  Q("S4", "choice", "המטבח עמוס, אי אפשר לאמת רכיב, והאורח לוחץ להזמין. מה עושים?",
    "refuse_guess", ["separate_prep", "log_temp", "flag_allergy_pass"],
    "לחץ של אורח אינו סיבה לאשר. מציעים מנה שכן אומתה — זו עדיין תשובה מלאה, והיא בטוחה."),
  Q("S4", "choice", "מנה יצאה עם רכיב שהאורח אלרגי אליו. מה עושים?",
    "new_plate", ["refuse_guess", "separate_prep", "flag_allergy_pass"],
    "הורדת הרכיב מהצלחת לא מסירה את מה שכבר נגע באוכל. מנה חדשה מהתחלה היא התשובה היחידה."),
  Q("S4", "choice", "המטבח עמוס והמנה של האורח האלרגי מוכנה במעבר. מה מוודאים?",
    "flag_allergy_pass", ["log_temp", "wash_hands", "new_plate"],
    "מנה שלא מסומנת במעבר יכולה להתחלף בזמן לחץ. הסימון הוא מה שמחזיק את השרשרת עד לשולחן."),
  Q("S4", "choice", "התקבל משלוח של חומר גלם מקורר במשמרת. מה חובה לעשות?",
    "log_temp", ["separate_boards", "wash_hands", "change_gloves"],
    "טמפרטורת קליטה נרשמת בזמן אמת. זו גם דרישת חוק וגם הדבר היחיד שמאפשר לדעת בדיעבד מה השתבש."),
  Q("S4", "multi", "אורחת מדווחת על אלרגיה חמורה. מה חייב לקרות? בחר/י את כל התשובות הנכונות.",
    null, null,
    "אלרגיה חמורה היא שרשרת ולא פעולה בודדת: לאמת, ליידע, ולוודא הכנה נפרדת. חוליה חסרה מבטלת את השאר.",
    { multiAnswers: ["read_back", "tell_kitchen", "separate_prep"], multiDistractors: ["log_temp", "new_plate"] }),
  Q("S4", "order", "סדר/י את הטיפול באלרגיה מהרגע שהאורח הזכיר אותה.",
    null, null,
    "הסדר הוא ההגנה: אימות לפני דיווח, דיווח לפני הכנה, סימון לפני שהמנה יוצאת.",
    { sequence: ["read_back", "tell_kitchen", "separate_prep", "flag_allergy_pass"] }),

  // ── S5 · אורחים ומצבים ──────────────────────────────────────────────────────────
  Q("S5", "first", "אורח מתלונן בקול על המנה. מה הדבר הראשון?",
    "listen_full", ["apologize_house", "call_manager", "offer_fix"],
    "אורח שמפריעים לו באמצע התלונה מתחיל אותה מהתחלה, חזק יותר. ההקשבה עד הסוף היא מה שמוריד את עוצמת הקול."),
  Q("S5", "choice", "הקשבת לתלונה עד הסוף. מה עכשיו, לפני שמציעים פתרון?",
    "apologize_house", ["remove_item", "replace_dish", "call_manager"],
    "התנצלות לפני פתרון מפרידה בין ״אכפת לנו״ ל״קנינו אותך״. פתרון בלי התנצלות נשמע כמו עסקה."),
  Q("S5", "choice", "התנצלת והאורח נרגע. מה השלב הבא?",
    "offer_fix", ["call_manager", "listen_full", "note_regular"],
    "פתרון קונקרטי שהאורח בוחר מתוכו מחזיר לו שליטה. ״מה תרצה שנעשה?״ פותח שיחה; החלטה במקומו סוגרת אותה."),
  Q("S5", "choice", "המנה יצאה לא לפי מה שהוזמן. מה הפתרון המתאים?",
    "replace_dish", ["remove_item", "offer_fix", "own_it"],
    "טעות שלנו מתוקנת במנה הנכונה, מהר, ועם תיאום מול המטבח שלא ייצא גם השאר בינתיים."),
  Q("S5", "choice", "האורח אכל חצי מנה ואומר שפשוט לא אהב אותה. מה עושים?",
    "remove_item", ["replace_dish", "call_manager", "apologize_house"],
    "מנה חדשה לא תפתור טעם שלא התאים. הורדה מהחשבון עולה פחות מאורח שלא יחזור."),
  Q("S5", "choice", "האורח לא מרוצה גם מהפתרון שהצעת. מה עושים?",
    "call_manager", ["remove_item", "replace_dish", "own_it"],
    "העברה למנהל היא כלי, לא כישלון. ההבדל הוא בתזמון — אחרי שניסית, לא במקום לנסות."),
  Q("S5", "choice", "המנה יצאה קרה והאורח מבקש שתחליף. מה נכון להגיד?",
    "own_it", ["call_manager", "listen_full", "offer_fix"],
    "״המטבח עמוס היום״ הופך את האורח לבעיה של מישהו אחר. אחריות במשפט אחד סוגרת את זה מהר מכל הסבר."),
  Q("S5", "choice", "אורח שתה יותר מדי ומתחיל להרים את הקול. מה עושים קודם?",
    "stop_service", ["arrange_ride", "call_manager", "quiet_move"],
    "הפסקת ההגשה קודמת לכל השאר — היא מה שמונע מהמצב להחמיר בזמן שמסדרים את היתר."),
  Q("S5", "choice", "הפסקת להגיש אלכוהול לאורח שתוי. מה מציעים לו עכשיו?",
    "offer_food_water", ["arrange_ride", "quiet_move", "remove_item"],
    "מים ואוכל מורידים את רמת האלכוהול ונותנים לאורח מוצא מכובד. סירוב בלי חלופה מזמין עימות."),
  Q("S5", "choice", "האורח השתוי מבקש את המפתחות ומתכוון לנהוג. מה עושים?",
    "arrange_ride", ["stop_service", "call_manager", "offer_food_water"],
    "מכאן זה כבר לא שירות אלא בטיחות. מסיעים, מזמינים, או מערבים מנהל — אבל לא נותנים לו לצאת לנהוג."),
  Q("S5", "choice", "זוג ביקש ערב בלי רעש, ולהקה עומדת להתחיל לנגן לידם. מה עושים?",
    "quiet_move", ["offer_fix", "apologize_house", "note_regular"],
    "הצעה יזומה לפני שהרעש מתחיל נקראת כאכפתיות. אותה הצעה אחרי שהם התלוננו נקראת כפיצוי."),
  Q("S5", "choice", "אורח קבוע הגיע ואת/ה יודע/ת שהוא תמיד מבקש בלי בצל. מה עושים?",
    "note_regular", ["call_manager", "quiet_move", "offer_fix"],
    "אורח קבוע חוזר בגלל שזוכרים אותו. העדפה רשומה שורדת גם משמרת שאת/ה לא נמצא/ת בה."),
  Q("S5", "order", "סדר/י את הטיפול בתלונה של אורח.",
    null, null,
    "הסדר הוא מה שמרגיע: קודם להקשיב, אז להתנצל, ורק אז לפתור. פתרון שמגיע ראשון נשמע כמו ניסיון לסגור אותו.",
    { sequence: ["listen_full", "apologize_house", "own_it", "offer_fix"] }),

  // ── S6 · היגיינה ומראה ──────────────────────────────────────────────────────────
  Q("S6", "choice", "חזרת מהפסקה ונגעת בטלפון ובכסף. מה לפני שנוגעים בכלים?",
    "wash_hands", ["tie_hair", "clean_apron", "no_jewelry"],
    "כסף וטלפון הם המשטחים המלוכלכים במסעדה. שטיפה היא הפעולה שמפרידה בין ״מאחור״ ל״קדימה״."),
  Q("S6", "choice", "עברת מעוף נא למנה מוכנה לאכילה, והידיים מכוסות. מה חובה?",
    "change_gloves", ["separate_boards", "no_taste_service", "clean_apron"],
    "כפפה שנגעה בחומר גלם נא מזוהמת בדיוק כמו יד. החלפה בין שלבים היא מה שמונע זיהום צולב."),
  Q("S6", "choice", "מכינים סלט על אותו משטח שבו חתכו דג נא. מה נכון?",
    "separate_boards", ["change_gloves", "wash_hands", "log_temp"],
    "כלים ומשטחים נפרדים לחומר גלם נא ולמוכן לאכילה. זה הכלל שמונע את רוב מקרי ההרעלה במסעדות."),
  Q("S6", "choice", "מלצר עם שיער ארוך פתוח מגיע למשמרת. מה מתקנים?",
    "tie_hair", ["no_jewelry", "clean_apron", "cover_cut"],
    "שערה במנה היא התלונה שאי אפשר להתווכח איתה. איסוף שיער הוא תנאי כניסה למשמרת, לא העדפה."),
  Q("S6", "choice", "מה מסירים לפני תחילת משמרת?",
    "no_jewelry", ["tie_hair", "change_gloves", "cover_cut"],
    "טבעות ושעונים אוגרים לכלוך מתחתיהם ויכולים ליפול לאוכל. שעון וטבעת נישואין פשוטה — לפי נוהל המקום."),
  Q("S6", "choice", "נחתכת קלות באצבע באמצע משמרת. מה עושים לפני שחוזרים?",
    "cover_cut", ["change_gloves", "wash_hands", "clean_apron"],
    "פלסטר בצבע בולט נועד להימצא אם הוא נופל לאוכל. כפפה מעליו היא השכבה השנייה."),
  Q("S6", "choice", "התעוררת עם קלקול קיבה ויש לך משמרת. מה עושים?",
    "stay_home", ["wash_hands", "change_gloves", "cover_cut"],
    "זה כלל חוק ולא שיקול דעת. עובד עם מחלה מדבקת במטבח הוא הדרך המהירה ביותר לסגור מסעדה."),
  Q("S6", "choice", "טיפת רוטב נפלה עליך בתחילת המשמרת. מה עושים?",
    "clean_apron", ["cover_cut", "tie_hair", "no_jewelry"],
    "האורח לא יודע מתי הכתם נוצר — הוא רואה אותו כמו שהוא. סינר נקי הוא חלק מהכלים, לא רק מהמראה."),
  Q("S6", "multi", "מה חובה לפני תחילת משמרת? בחר/י את כל התשובות הנכונות.",
    null, null,
    "מראה אינו אסתטיקה בלבד — שיער, תכשיטים וידיים הם שלושת המסלולים שדרכם דברים מגיעים לצלחת.",
    { multiAnswers: ["tie_hair", "no_jewelry", "wash_hands"], multiDistractors: ["cover_cut", "log_temp"] }),
  Q("S6", "choice", "מלצר טועם מהמצקת כדי לבדוק אם המרק מתובל. מה לא בסדר?",
    "no_taste_service", ["separate_boards", "change_gloves", "tie_hair"],
    "כלי שנגע בפה לא חוזר לאוכל של אורחים. אם צריך לטעום — כף נקייה, פעם אחת."),

  // ── S7 · בר ─────────────────────────────────────────────────────────────────────
  Q("S7", "choice", "הזמינו נגרוני. איך מכינים אותו?",
    "stir_spirits", ["shake_citrus", "build_glass", "strain_double"],
    "משקה שכולו אלכוהול מעורבב ולא מנוער — ניעור מכניס בועות אוויר ומעכיר משקה שאמור להיות צלול."),
  Q("S7", "choice", "הזמינו ויסקי סאוור עם חלבון ביצה. מה נכון?",
    "shake_citrus", ["stir_spirits", "build_glass", "chill_glass"],
    "הדר, ביצה או שמנת דורשים ניעור כדי להתחבר ולהקציף. ערבוב יישאיר אותם נפרדים."),
  Q("S7", "choice", "הזמינו ג׳ין טוניק. איך מכינים?",
    "build_glass", ["shake_citrus", "stir_spirits", "strain_double"],
    "משקה מוגז נבנה בכוס עצמה. ניעור או ערבוב בשייקר מוציאים ממנו את הגז לפני שהוא מגיע לאורח."),
  Q("S7", "choice", "בר עמוס וארבעה קוקטיילים באותה הזמנה. איך שומרים על עקביות?",
    "jigger", ["fresh_ice", "chill_glass", "rinse_between"],
    "מזיגה חופשית משתנה לפי עייפות ולפי לחץ. ג׳יגר הוא מה שגורם למשקה להיות אותו משקה גם בשעה שתיים."),
  Q("S7", "choice", "משקה שנוער עומד לצאת לאורח. מה עושים לפני המזיגה?",
    "strain_double", ["express_peel", "chill_glass", "rinse_between"],
    "סינון כפול עוצר שברי קרח ועלים שנשארו מהניעור. בלעדיו המרקם משתנה תוך דקה."),
  Q("S7", "choice", "סיננת משקה לכוס. מה עושים עם הקרח שהיה בשייקר?",
    "fresh_ice", ["rinse_between", "chill_glass", "jigger"],
    "קרח שכבר עבד מומס למחצה ומדלל את המשקה הבא. קרח משומש לעולם לא חוזר לכוס."),
  Q("S7", "choice", "מרטיני מוגש בלי קרח בכוס. מה עושים כדי שיישאר קר?",
    "chill_glass", ["fresh_ice", "strain_double", "build_glass"],
    "בלי קרח בכוס, הכוס עצמה היא הבידוד. כוס בטמפרטורת חדר מחממת את המשקה תוך דקות."),
  Q("S7", "choice", "משקה מוכן בכוס ורוצים ארומת הדר מעליו. מה עושים?",
    "express_peel", ["strain_double", "chill_glass", "build_glass"],
    "סחיטת שמני הקליפה מעל פני המשקה היא הריח שפוגש את האורח לפני הטעם. הקליפה עצמה היא קישוט, לא הארומה."),
  Q("S7", "choice", "סיימת קוקטייל אחד ומתחיל להכין אחר. מה חובה?",
    "rinse_between", ["fresh_ice", "jigger", "express_peel"],
    "שאריות מהמשקה הקודם משנות את הטעם של הבא. שטיפה היא שנייה אחת שמונעת משקה שנשלח בחזרה."),
  Q("S7", "choice", "אורח שנראה צעיר מאוד מזמין אלכוהול. מה עושים?",
    "check_id", ["stop_service", "call_manager", "offer_food_water"],
    "בקשת תעודה היא נוהל ולא האשמה. באי-ודאות מבקשים, תמיד — האחריות היא על המוזג."),
  Q("S7", "order", "סדר/י את הכנת קוקטייל מנוער.",
    null, null,
    "סדר קבוע הוא מה שמאפשר לעבוד מהר בלי לחשוב: למדוד, לנער, לסנן, ורק אז הארומה מעל.",
    { sequence: ["jigger", "shake_citrus", "strain_double", "express_peel"] }),
];

// ── Deck building ─────────────────────────────────────────────────────────────────────

const shuffleWith = (arr, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Turn one bank entry into a presentable question. Returns null when the entry cannot be
// rendered — a missing action key is a bug in the bank, and it must never reach a waiter as
// an option with no text.
export function renderQuestion(entry, rnd = Math.random, idx = 0) {
  const base = { module: entry.module, kind: entry.kind, tier: "A", prompt: entry.prompt, why: entry.why, id: `A${idx}` };

  if (entry.kind === "order") {
    const steps = entry.sequence.map((k) => ({ key: k, label: ACTIONS[k] }));
    if (steps.some((s) => !s.label)) return null;
    return { ...base, shuffled: shuffleWith(steps, rnd), correctOrder: entry.sequence };
  }

  if (entry.kind === "multi") {
    const yes = entry.multiAnswers.map((k) => ({ key: k, label: ACTIONS[k], correct: true }));
    const no = entry.multiDistractors.map((k) => ({ key: k, label: ACTIONS[k], correct: false }));
    if ([...yes, ...no].some((o) => !o.label)) return null;
    return {
      ...base, multi: true, exactSet: true,
      options: shuffleWith([...yes, ...no], rnd).map((o) => ({ id: o.key, label: o.label, correct: o.correct })),
    };
  }

  const correct = ACTIONS[entry.a];
  const decoys = (entry.d || []).map((k) => ({ key: k, label: ACTIONS[k] }));
  if (!correct || decoys.some((d) => !d.label)) return null;
  return {
    ...base,
    options: shuffleWith([{ key: entry.a, label: correct, correct: true }, ...decoys.map((d) => ({ ...d, correct: false }))], rnd)
      .map((o) => ({ id: o.key, label: o.label, correct: !!o.correct })),
  };
}

// Which modules apply to this person. A bartender is not examined on napkin folding, and a
// waiter is not examined on double-straining.
// The answer SHAPE — what the waiter physically does. `kind` is the semantic label shown on
// the chip ("מה קודם?" vs a plain scenario); two different kinds can still be the same
// screen, and rhythm has to follow the screen.
export const shapeOf = (kind) => (kind === "order" ? "order" : kind === "multi" ? "multi" : "single");

export function modulesForRole(role) {
  const wants = (m) => m.role === "any" || (role === "bar" ? m.role === "bar" : role === "both" ? true : m.role === "floor");
  return Object.entries(MODULES).filter(([, m]) => wants(m)).map(([k]) => k);
}

// Build a practice or exam deck.
//   role      — "floor" | "bar" | "both"
//   size      — how many questions
//   standard  — the restaurant's house answers (serviceStandard.js)
//   confirmed — house keys the owner ticked; unconfirmed keys are practice-only
//   exam      — true on the certification exam: excludes unconfirmed house rules
export function buildServiceDeck({ role = "floor", size = 20, standard = {}, confirmed = [], exam = false, rnd = Math.random } = {}) {
  const mods = new Set(modulesForRole(role));
  const pool = BANK.filter((e) => mods.has(e.module))
    .map((e, i) => renderQuestion(e, rnd, i))
    .filter(Boolean);

  // House questions come from the config, not the bank — see serviceStandard.js for why an
  // unconfirmed rule may be practised but must never be examined.
  const house = Object.keys(HOUSE_KEYS)
    .filter((k) => !exam || confirmed.includes(k))
    .filter((k) => mods.has(HOUSE_KEYS[k].module))
    .map((k) => houseQuestion(k, standard, rnd))
    .filter(Boolean);

  return interleave(shuffleWith(pool, rnd), shuffleWith(house, rnd), rnd).slice(0, size);
}

// ── Rhythm ────────────────────────────────────────────────────────────────────────────
// The complaint that started this rewrite was that the quizzes feel like one long grey
// list. Two identical formats back to back are what produce that feeling, so neighbours are
// laid out to differ in FORMAT wherever the pool allows it. This changes no answer — and it
// is the difference between an exam someone finishes and one they click through.
function interleave(a, b, rnd) {
  const rest = shuffleWith([...a, ...b], rnd);
  const out = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    // Prefer a neighbour of a different kind; fall back to whatever is left rather than
    // dropping questions to satisfy a layout rule.
    let i = rest.findIndex((q) => !prev || shapeOf(q.kind) !== shapeOf(prev.kind));
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

import { HOUSE_KEYS, houseQuestion } from "./serviceStandard.js";
