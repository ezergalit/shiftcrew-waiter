# shiftcrew-waiter — אפליקציית לימוד לצוות

> ר' גם `/Users/homestation/Desktop/CLAUDE.md` להקשר הכללי (Supabase, deploy, סטטוס).
> קובץ זה מתמקד בפרטים הספציפיים לאפליקציה הזו — **כולל תיקייה מלאה בקוד מת/דמו,
> קרא את "שלדים מהעבר" לפני שאתה נוגע בקבצים שאינך מכיר.**

## מה זה

אפליקציית web לצוות המסעדה — כניסה בקוד צוות (`1234`) + שם (ללא סיסמה), לימוד תפריט
בסגנון Quizlet (4 מצבי משחק), Daily Brief, לידרבורד live, התקדמות לפי קטגוריה.

**Live**: https://shiftcrew-waiter.vercel.app
**Repo**: github.com/ezergalit/shiftcrew-waiter (branch `main`, Vercel auto-deploy)

## ⚠️ שלדים מהעבר — קבצים שקיימים אבל לא בשימוש

התיקייה עברה כמה פיבוטים (scheduling app מקורי → דמו יווני סטטי → Menu Trainer עם DB אמיתי).
כתוצאה יש כמה קבצים "רדומים" ש-**נראים** כמו האפליקציה החיה אבל אינם:

| קובץ | מה זה באמת | מסקנה |
|---|---|---|
| `src/RestaurantDemo.jsx` | wrapper דק סביב `RestaurantApp.jsx` | **לא בשימוש.** `main.jsx` היה מצביע עליו בטעות עד 2026-08-10 — זו הייתה הסיבה שהאפליקציה החיה מעולם לא רצה כמו שציפו (אין login אמיתי, אין DB, matching/speed מציגים "בקרוב"). תוקן: `main.jsx` מצביע עכשיו על `App.jsx` האמיתי. |
| `src/screens/RestaurantApp.jsx` | דמו סטטי עם state בזיכרון בלבד, כניסה בשם+טלפון (לא team_code), sidebar אנכי צדדי (לא bottom nav) | **לא בשימוש בפרודקשן**, אבל **שימושי כמקור** — זה המקום שבו נמצא התפריט האמיתי (`GREEK_MENU`, 19 מנות עם שמות ומחירים מאומתים) ששימש בסיס לזריעת ה-DB. אם צריך לאמת שוב פרטי מנה — תסתכל כאן קודם. |
| `src/lib/shiftcrew.js` | שכבת גישה ל-DB לפרויקט ה-scheduling המקורי (`scWaiter`/`scOwnerPublic`, סכמאות `shiftcrew_owner`/`shiftcrew_waiter`, RPC כמו `waiter_access`, `publish_week`) | **סכמות שלא קיימות יותר.** לא בשימוש. `MainApp.jsx` ניסה בעבר לייבא ממנו `supabase` (לא קיים שם בכלל) — זה היה באג נוסף שגרם לקריסה. תוקן: `MainApp.jsx` מייבא מ-`lib/supabase.js` החדש. |
| `src/auth/WaiterLogin.jsx` | login ישן מבוסס טלפון | לא בשימוש (הוחלף ב-`TeamLogin.jsx`) |
| `src/screens/Manage.jsx`, `src/screens/Tutorial.jsx` | מסכי ניהול/הדרכה מהגרסה הישנה (scheduling, product tour) | לא בשימוש, לא מיובאים מ-`App.jsx` |
| `src/Demo.jsx` | עוד דמו ישן | לא בשימוש |

**כלל אצבע**: האפליקציה החיה היא אך ורק השרשרת `main.jsx → App.jsx → auth/TeamLogin.jsx |
screens/MainApp.jsx`. כל קובץ אחר ב-`src/` הוא ארכיון/מקור-נתונים, לא קוד רץ. לפני שמתקנים
באג "באפליקציה" — ודא קודם שאתה בקובץ הנכון בשרשרת הזו.

## זרימת האפליקציה (הקוד החי)

```
main.jsx → App.jsx
              │
              ├─ טוען session מ-localStorage ("menu-app-team-session")
              │   ├─ אין session → TeamLogin
              │   └─ יש session → מוודא team_members.id קיים ב-DB → MainApp
              │
TeamLogin.jsx:
  מזין team_code (1234) + שם → מחפש restaurant לפי team_code →
  מחפש team_member קיים עם אותו שם (restaurant_id + name, ILIKE — case-insensitive
  exact match) → אם נמצא, משתמש באותו id (מחזיר את כל ה-mastery/leaderboard הקיימים
  שלו); אם לא, יוצר שורה חדשה → שומר session
  (תוקן 2026-08-10: לפני כן היה יוצר team_member חדש בכל כניסה, מאבד התקדמות)

MainApp.jsx (src/screens/MainApp.jsx):
  5 טאבים בניווט תחתון (עם label, לא רק אייקון): בית | אתגרים | יומי | דירוג | תפריט
  (הטאב האחרון עדיין נקרא "categories" בקוד/state — רק התווית שונתה ל"תפריט" ב-2026-08-10,
  התוכן עצמו נשאר פירוט התקדמות לפי קטגוריה, לא רשימת המנות המלאה)

  Home tab מתחיל בקרוסלת פרסומות (PromoCarousel) — כרטיס אחד בכל פעם, מתחלף אוטומטית
  כל 4.5 שניות (fade, לא slide), ניתן גם להחליק (touch) או ללחוץ נקודה. תוכן: אתגר יומי,
  שיא-רצף של חבר צוות אחר (leaderboard.streak), מוביל/ה בניקוד, וטיזרים למשחקי match/speed.
  לחיצה על כרטיס מנווטת ישירות למצב המתאים. ⚠️ **ר' "מלכודת RTL" למטה — קריטי לכל
  קרוסלה/swiper עתידי באפליקציה.**
  6 מצבי משחק (מ"בית" או מ"אתגרים", עם items מלא או scoped דרך modeItems):
    כרטיסיות | חידון | התאמה | מהירות | אלרגנים | השלמת שם

  ⭐ מודל הציונים (עודכן 2026-08-10, שינוי משמעותי): `mastery` הוא 1-5, `>=4` = "נלמד".
  **רק Flashcards הוא self-report** (המשתמש בוחר 1-5 בעצמו אחרי reveal — אין דרך
  אובייקטיבית לבדוק "האם ידעת להסתכל על כרטיס"). **כל שאר המצבים אובייקטיביים** —
  המשחק עצמו קובע את הציון לפי תשובה נכונה/שגויה, כדי שאי אפשר "לשקר" ולסמן שידעת
  בלי להיבדק בפועל:
  - Quiz: תשובה נכונה→5, שגויה→2
  - Speed: **שוכתב לגמרי** — היה self-report ("ידעתי"/"לא יודע", באג בפני עצמו: בדיוק
    ה"שקר" שהמשתמש ביקש למנוע!). עכשיו: multiple-choice על המחיר (3 ברירות, לא 4,
    לקצב מהיר) תחת שעון 30 שניות כללי; נכון→5, שגוי→2
  - Matching: נכון→5, אבל **כל ניחוש שגוי על אותו pairId מוריד את הציון** בהתאמה
    הסופית (0 שגיאות=5, 1=4, 2=3, 3+=2) — נספר לכל צד של הזוג דרך `wrongAttemptsRef`
    (Map פר-pairId, לא state, כדי לא לגרום re-render על כל ניחוש)
  - אלרגנים / השלמת שם (חדשים, ר' למטה): נכון→5, שגוי→2
  learnItem(id, rating) ב-MainApp מטפל בהכל: **mastery יכול לזוז גם למטה** — פריט
  שכבר "נלמד" יכול "להתבטל" אם עונים עליו לא נכון במשחק אובייקטיבי מאוחר יותר (בכוונה
  — זו בדיוק הנקודה של "המשחק מחליט, לא רק אתה"). upsert תמיד ל-menu_progress; upsert
  ל-leaderboard ועדכון האתגר-היומי/בונוס **רק כשעוברים סף (4)** לכיוון כלשהו, לא בכל
  ציון. realtime subscription (postgres_changes על leaderboard) משדר לכל הצוות.

  - Flashcards: הצג שם+מחיר → reveal → תיאור+אלרגנים → **בוחרים 1-5** ("כמה טוב ידעתם?")
  - Quiz: 8 שאלות רנדומליות, 4 ברירות מחיר, פידבק ירוק/אדום
  - Matching (בסגנון Quizlet): גריד 3 עמודות, 6 מנות עם מחירים שונים זה מזה (לא בוחר
    שתי מנות באותו מחיר — שתי מנות אמיתיות בתפריט חולקות מחיר) × 2 tiles (שם+מחיר)
    מעורבבים, טיימר עולה — ר' מודל הציונים למעלה
  - Speed: 30 שניות, עד 12 מנות, multiple-choice מחיר (3 ברירות) — מדווח ציון סופי
    ל-MainApp דרך onFinish (לאתגר "שיא מהירות", נפרד מה-mastery של כל שאלה)
  - **אלרגנים** (AllergenQuiz, חדש): שם המנה בלבד (לא מחיר/תיאור) → בוחרים chips
    מתוך 10 אלרגנים אפשריים (אותה רשימה כמו ב-owner app) → "שליחה" (שליחה בלי לבחור
    כלום = תשובת "אין אלרגנים" בעצמה) → צריך התאמה **מדויקת** של הסט (לא ניקוד חלקי)
  - **השלמת שם** (NameCompletion, חדש): מציג רק את התיאור (ולא את השם) → קלט טקסט
    חופשי → השוואה exact match (trim+lowercase, לא fuzzy — טעות הקלדה = טעות)

  אתגרים (2026-08-10, עודכן): מחושבים בקוד, לא מטבלת DB ייעודית (אין כזו). כרטיס
  תצוגה מקדימה בבית + טאב "אתגרים" מלא. **תוקן אותו יום**: כרטיסי "שליטה בקטגוריה"
  (אחד לכל קטגוריה) **הוסרו מכאן** — עברו לטאב "תפריט" עצמו (ר' למטה), כי המשתמש
  ביקש שקטגוריות יהיו חלק מהתפריט, לא "אתגר" נפרד:
  - אתגר יומי: 3 מנות חדשות/יום → בונוס חד-פעמי של 50 נקודות (מעקב מקומי,
    `menu-app-daily-<teamMemberId>`, מתאפס כל יום; bonusTotal מצטבר תחת
    `menu-app-bonus-<teamMemberId>`, נכנס לנוסחת הניקוד לצמיתות)
  - **אתגר האלרגנים** — מפעיל AllergenQuiz
  - **השלימו את השם** — מפעיל NameCompletion
  - שליטה מלאה בתפריט: mastered.size מול cards.length, ללא כפתור פעולה
  - שיא מהירות: `menu-app-best-speed-<teamMemberId>`
  - רצף למידה: `leaderboard.streak`
  ⚠️ **הכל device-scoped** (localStorage) מלבד ה-points הכוללים שמתעדכנים ב-leaderboard.

  טאב "תפריט" (categories, 2026-08-10): **כל קטגוריה עכשיו לחיצה** — לוחצים על
  "ראשונות"/"עיקריות"/"קינוחים" ומופעל Flashcards עם רק הפריטים של אותה קטגוריה
  (`setModeItems(items); setMode("flashcards")`). זה מה שהיה קודם "אתגר שליטה בקטגוריה"
  בטאב אתגרים, עכשיו native לטאב התפריט עצמו.
```

## קבצים מרכזיים (הקוד החי בלבד)

| קובץ | תפקיד |
|---|---|
| `src/main.jsx` | mount של `App.jsx` (תוקן 2026-08-10 — היה `RestaurantDemo`) |
| `src/App.jsx` | ניהול session + ניתוב |
| `src/auth/TeamLogin.jsx` | מסך הצטרפות (קוד+שם) |
| `src/screens/MainApp.jsx` | כל ה-UI: בית/יומי/דירוג/קטגוריות + 4 קומפוננטות משחק בתוך אותו קובץ |
| `src/lib/supabase.js` | לקוח Supabase (נוצר 2026-08-10 — היה חסר לגמרי!), `persistSession: false` |
| `src/lib/mockMenu.js` | ⚠️ **TEMP DEV FALLBACK** (נוצר 2026-08-10) — עותק סטטי של התפריט האמיתי (19 פריטים) לשימוש כשאין חיבור ל-DB |

## ⚠️ TEMP DEV FALLBACK — bypass התחברות (Supabase עדיין תקוע)

כל עוד ה-Supabase לא חזר לפעול (ר' CLAUDE.md הראשי, PGRST002), הוספתי מנגנון עוקף כדי
שאפשר יהיה בכלל לראות ולבדוק את האפליקציה:

- **`auth/TeamLogin.jsx`**: אם החיפוש של team_code נכשל (DB לא זמין), במקום להציג שגיאה
  נוצר session מקומי (`{teamMemberId: random uuid, restaurantId: <ה-UUID האמיתי של סלון
  יווני>, offline: true}`) ונשמר ב-localStorage. **כרגע כל קוד/סיסמה עובדים** — זו הייתה
  בקשה מפורשת של המשתמש ("לא משנה מה הסיסמא, בינתיים תכניס אותי") כדי לעקוף את תקלת
  ה-Supabase שלא קשורה לקוד. **יש להסיר את זה כשה-DB חוזר לעבוד** (או לפחות להגביל
  שוב לבדיקה אמיתית מול ה-DB).
- **`App.jsx`**: אם `session.offline === true`, מדלג על אימות מול ה-DB בטעינה מחדש
  (כי ה-team_member לא באמת קיים שם).
- **`screens/MainApp.jsx`**: אם `session.offline === true`, טוען תוכן קבוע מ-`lib/mockMenu.js`
  (אותו תפריט בדיוק שזרוע ב-DB האמיתי) במקום לנסות לשלוף מה-DB, ומדלג על כתיבות
  (menu_progress / leaderboard) — הכל מקומי, שום דבר לא נשמר. יש **באנר צהוב גלוי** בראש
  המסך ("מצב לוקאלי — Supabase לא זמין, כלום לא נשמר באמת") כדי שלא יהיה בלבול עם נתונים
  אמיתיים.
- כל שלושת המקומות מסומנים בקוד עם הערת `TEMP DEV FALLBACK` — חפש את זה כדי למצוא ולהסיר
  בקלות כשה-DB יחזור לפעול.

## ⚠️ מלכודת RTL — קרוסלות/swipers (חשוב לכל דבר עתידי מהסוג הזה)

כל האפליקציה רצה תחת `dir="rtl"`. בניית `PromoCarousel` (2026-08-10) גילתה כמה
התנהגויות RTL לא-אינטואיטיביות ב-Chromium. **תיעוד כדי לא לבזבז שוב שעה על דיבוג**:

1. **`scrollLeft` ב-RTL**: קונטיינר עם `overflow-x: auto` בתוך `dir="rtl"` משתמש ב-
   **ערכים שליליים** ל-`scrollLeft` (לא 0..scrollWidth כמו ב-LTR). קביעת `el.scrollLeft = 100`
   או `el.scrollTo({left: 100})` פשוט לא זזה (מקובעת ל-0, בשקט, בלי שגיאה) — צריך `-100`.
2. **`scroll-snap-type` + `scrollTo({behavior:'smooth'})`**: גם אחרי תיקון הסימן, שילוב
   snap (`mandatory` או `proximity`) עם smooth scroll מתוכנת נוטה "להיתקע" באמצע האנימציה
   (ראינו scrollLeft נעצר על -19px, -63px וכו' במקום להגיע ליעד). לא מצאנו תיקון אמין —
   פשוט **נטשנו native scroll לגמרי** לטובת `transform: translateX()`.
3. **`translateX(<percent>)` על flex track**: האחוז ב-`transform` נפתר יחסית ל**קופסת
   הגבול העצמית של האלמנט המשתנה**, לא לקונטיינר החיצוני. על track ברוחב `500%`
   (5 שקופיות), `translateX(20%)` זז 20% מתוך ה-1980px של ה-track עצמו (=396px, כן
   נכון) — אבל ב**בדיקה בפועל** ב-Chromium headless של הכלי הזה, `getComputedStyle().transform`
   החזיר `matrix(1,0,0,1,0,0)` (זהות) בלי קשר לערך ה-inline — כלומר האחוזים פשוט לא
   *נפתרו/צוירו* בסביבת הבדיקה הזו, מסיבה שלא איתרנו לגמרי. **מסקנה**: להימנע
   מ-`translateX` עם אחוזים על track שרוחבו גם הוא יחסי-אחוזים; אם צריך פיקסלים
   מדויקים — למדוד רוחב בפועל (ResizeObserver) ולהשתמש ב-`translateX(Npx)`. גם זה
   *כן* עבד מבחינת הפתרון (px) אבל ה-state (`slideWidth`) לא התעדכן אמין מ-ResizeObserver
   בסביבה הזו (נשאר 0), אז בסוף **ויתרנו גם על transform-slide וגם על מדידות** —
   הפתרון הסופי שעובד: **רינדור שקופית אחת בכל פעם** (`items[index]`, בלי track/scroll/
   transform בכלל), עם `key={p.id}` + קלאס `animate-fadeIn` קיים (`src/index.css`) כדי
   לקבל fade קליל בכל מעבר. פשוט, אמין, בלי שום בעיית RTL.
4. **סדר ילדים ב-flex row בתוך RTL**: `display:flex` (ברירת מחדל `row`) בתוך `dir="rtl"`
   שם את הילד הראשון **בצד ימין** (לא שמאל כמו ב-LTR) — כל ילד הבא נוסף שמאלה. חשוב
   אם אי פעם עוברים חזרה לגישת track/transform.

**הכלל המעשי**: לקרוסלה/swiper הבא באפליקציה הזו — תתחיל ישר מגישת "שקופית אחת +
fade לפי key", לא מ-scroll או מ-transform-track. זה מה שבסוף עבד.

## הערות חשובות / TODO

- ✅ **תוקן 2026-08-10**: TeamLogin עכשיו מזהה שם חוזר (ILIKE, case-insensitive exact
  match על `restaurant_id + name`) ומשתמש באותו `team_members.id` — לא יוצר כפילות
  ולא מאבד התקדמות. **מגבלה ידועה**: שני אנשים אמיתיים עם אותו שם בדיוק (למשל שני
  "דנה") ישתפו בטעות את אותה שורת התקדמות/ניקוד — לא טופל, ולא התבקש. אם זה קורה
  בפועל, הפתרון הפשוט ביותר הוא לבקש מהם להזין שם משפחה או כינוי ייחודי.
- קטגוריית `drinks` ריקה בתפריט האמיתי — `MainApp.jsx` מסנן קטגוריות ריקות מטאב
  "קטגוריות" כדי לא להציג 0/0.
- אין Supabase Auth (כמו ב-owner) — כל הגישה דרך `anon` key + RLS פתוח.

## הרצה מקומית

```bash
npm install
npm run dev
```
`.env` כבר קיים עם `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

## מה לא committed עדיין (נכון ל-2026-08-10)

```
 M src/App.jsx               (תמיכה ב-session.offline — ר' TEMP DEV FALLBACK למעלה)
 M src/auth/TeamLogin.jsx    (בקשת המשתמש: bypass אם ה-DB לא מגיב — ר' TEMP DEV FALLBACK)
 M src/main.jsx              (תיקון: RestaurantDemo → App האמיתי)
 M src/screens/MainApp.jsx   (matching game מחדש, לידרבורד live, bottom nav מחודש, תיקון
                              import, אתגרים חדש — ר' סעיף "אתגרים" למעלה)
?? src/lib/supabase.js       (קובץ חדש — היה חסר)
?? src/lib/mockMenu.js       (TEMP DEV FALLBACK — תפריט מוק לבדיקה בלי DB)
?? CLAUDE.md                 (הקובץ הזה)
```

⚠️ **לפני כל commit/push**: קבצי ה-TEMP DEV FALLBACK (`TeamLogin.jsx`'s bypass, `App.jsx`'s
`session.offline` skip, ו-`mockMenu.js` כולו) הם עוקף זמני מכוון שהמשתמש ביקש כדי לעבוד
כש-Supabase תקוע — **הם לא אמורים להגיע ל-production כמו שהם**. ברגע שה-DB חוזר לעבוד:
1. ודא ש-login אמיתי מול ה-DB עובד (לא רק ה-fallback).
2. שקול אם להשאיר את מנגנון ה-fallback (יכול להיות שימושי כ-graceful degradation לעתיד)
   או להסיר אותו — זו החלטה של המשתמש, לא משהו להסיר אוטומטית בלי לשאול.
3. בדוק login מקומי עם `npm run dev` וקוד `LEARN`, ורק אז push (רק אחרי אישור מהמשתמש).
