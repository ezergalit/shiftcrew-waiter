# הצטרפות עם אימות טלפון — סדר הרצה

> 🔴 **שער יחיד: אישור מלא של Google Play לשתי האפליקציות** (הוראת יותם,
> 30.8). עד אז שום דבר מכאן לא נדחף, לא מוחל ולא נפרס. הענף: `phone-join`.

## מה בחבילה

| רכיב | קובץ | סטטוס |
|---|---|---|
| מיגרציית DB | `migrations/03_phone_join.sql` | כתובה, **לא הוחלה** |
| Edge Function | `supabase/functions/phone-join/index.ts` | כתובה, **לא נפרסה** (esbuild עובר) |
| לקוח | `src/auth/TeamLogin.jsx` + `src/lib/phone.js` | ממומש, מסכים אומתו ויזואלית |
| בדיקות | `tests/phone.test.mjs` | 12 ✓ |

**העיקרון**: טלפון אחד = עובד אחד למסעדה. הצטרפות דורשת OTP חד-פעמי;
הצטרפות חוזרת מאותו מספר מחזירה את אותו פרופיל (עם אימות טרי — ידיעת מספר
של קולגה לא מספיקה). חסימה = שורה ב-`phone_blocklist` (מפעיל, ב-SQL).
`join_audit` רושם IP+UA לכל אירוע. הכל מאחורי `features.phone_join = true` —
ברירת המחדל כבויה, אז גם המיזוג עצמו לא משנה כלום לאף מסעדה עד ההדלקה.

## צעדים כשמגיע האישור

1. **יותם, בקונסולת Twilio (~10 דק')**: לבדוק אם ה-WhatsApp sender זמין
   ל-Verify · ליצור **Verify Service חדש** (לא לגעת בזרימות ShiftMatch!) ·
   להעתיק לסודות של Supabase (Edge Functions → Secrets):
   `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_VERIFY_SERVICE_SID` ·
   אופציונלי `OTP_CHANNEL=whatsapp` · `REVIEW_PHONE`+`REVIEW_CODE` לבודקי חנות.
2. להחיל את `migrations/03_phone_join.sql` (MCP apply_migration).
3. לפרוס את `phone-join` (deploy_edge_function).
4. בדיקה חיה מול המספר של יותם: send ⇒ קוד מגיע ⇒ check ⇒ join ⇒ שורה
   ב-team_member_phones + join_audit. ואימות שלילי: טוקן ישן ⇒ need_verify,
   מספר חסום ⇒ blocked. **כל כתיבה מאומתת בקריאה נפרדת.**
5. אימות חומה: anon בלי טוקן ⇒ `[]`/שגיאה על כל 5 הטבלאות החדשות.
6. למזג `phone-join` ל-main, לדחוף, לבנות build מלצר חדש ל-TestFlight.
7. להדליק פר-מסעדה: `features.phone_join=true` ל-SALON26 ו-STUDIO26.
   **לא ל-CREWDEMO** בלי REVIEW_PHONE מתועד ב-App Review Notes.
8. הצהרות חנות: Data safety (גוגל) + App Privacy (אפל) — איסוף טלפון מקושר
   לזהות; עדכון privacy.html; מחיקת חשבון מוחקת גם את הטלפון (cascade כבר
   קיים דרך team_members).

## ידוע ומכוון

- מונה ה"שחזור פרופיל" מתעלם מהשם שהוקלד — הטלפון הוא הזהות.
- שחזור פרופיל מחזיר `trainee:false` תמיד (מתחילים ממילא כבויים).
- ה-fallback האופליין של TeamLogin מנוטרל במסלול המאומת — כישלון אחרי
  אימות לא הופך בשקט לפרופיל לא-מאומת.
- נרמול הטלפון משוכפל ב-3 מקומות (phone.js · SQL · Edge) — לשנות בשלושתם.
