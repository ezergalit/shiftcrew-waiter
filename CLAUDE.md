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
  5 טאבים בניווט תחתון (עם label, לא רק אייקון): בית | אתגרים | יומי | דירוג | קטגוריות
  4 מצבי משחק (מ"בית" או מ"אתגרים", עם items מלא או scoped דרך modeItems):
    כרטיסיות | חידון | התאמה | מהירות
  - Flashcards: הצג שם+מחיר → reveal → תיאור+אלרגנים → "ידעתי" (mastery=5)
  - Quiz: 8 שאלות רנדומליות (מהתפריט), 4 ברירות מחיר, פידבק ירוק/אדום
  - Matching (נבנה מחדש 2026-08-10, בסגנון Quizlet): גריד 3 עמודות, 6 מנות עם
    מחירים שונים זה מזה (לא בוחר שתי מנות באותו מחיר — היה באג אמיתי, שתי מנות אמיתיות
    בתפריט חולקות מחיר) × 2 tiles (שם+מחיר)
    מעורבבים, לחיצה על 2 → זוג נכון נעלם בירוק, זוג שגוי מהבהב אדום וחוזר, טיימר עולה
  - Speed: 30 שניות, עד 12 מנות רנדומליות, "ידעתי"/"לא יודע", מדווח את הציון הסופי
    ל-MainApp דרך onFinish (משמש לאתגר "שיא מהירות")
  כל "ידעתי"/תשובה נכונה → learnItem(id):
    upsert ל-menu_progress (mastery=5) + upsert ל-leaderboard
    (points = mastered_count*100 + bonusTotal, ר' אתגרים למטה)
    + עדכון אופטימי מקומי + realtime subscription (postgres_changes על leaderboard,
    מסונן לפי restaurant_id) כדי שכל הצוות יראה עדכון מיידית

  אתגרים (נוסף 2026-08-10) — מחושבים בקוד מ-cards/mastered/leaderboard, לא מטבלת DB
  ייעודית (אין כזו). כרטיס תצוגה מקדימה בבית + טאב "אתגרים" מלא:
  - אתגר יומי: 3 מנות חדשות/יום → בונוס חד-פעמי של 50 נקודות. מעקב מקומי בלבד
    (localStorage, מפתח `menu-app-daily-<teamMemberId>`), מתאפס כל יום; ה-bonusTotal
    המצטבר נשמר תחת `menu-app-bonus-<teamMemberId>` ונכנס לנוסחת הניקוד לצמיתות.
  - שליטה בקטגוריה: אחד אוטומטית לכל קטגוריה שלא הושלמה, "תרגול קטגוריה" מפעיל
    Flashcards עם רק הפריטים של אותה קטגוריה (דרך modeItems).
  - שליטה מלאה בתפריט: mastered.size מול cards.length, ללא כפתור פעולה.
  - שיא מהירות: השיא הטוב ביותר במצב Speed, נשמר תחת `menu-app-best-speed-<teamMemberId>`.
  - רצף למידה: קורא את `leaderboard.streak` של המשתמש (מגיע מה-DB/מוק).
  ⚠️ **הכל device-scoped** (localStorage) — לא מסונכרן בין מכשירים, ולא נשמר ב-DB
  מלבד ה-points הכוללים שכן מתעדכנים ב-leaderboard.
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
