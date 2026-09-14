import { Check } from "lucide-react";

// ══ מדריך ההפעלה: פס הנחיה מעל הסרגל, על האפליקציה האמיתית (יותם, 14.9) ══
//
// «the tutorial looks bad — תחשוב על דרך טובה יותר להסביר להם איך להשתמש באפליקציה».
//
// שתי הגרסאות הקודמות נכשלו משתי סיבות הפוכות, ושתיהן מלמדות את אותו דבר:
//   1. **הסיור עם הזרקור** היה שכבה שמדדה אלמנטים חיים, החשיכה את השאר וחיכתה שההקשה
//      תנחת במקום מסוים — ומשם הגיעו הדיליי, הקפיצות והצעדים התקועים.
//   2. **המדריך שרינדר עותק של המסכים** ברח מהמדידה, אבל צייר UI משלו — ולכן הוא נראה
//      כמו גרסה זולה של האפליקציה. **העתק שנראה פחות טוב מהמקור גרוע משכבה.**
//
// הפתרון: **לא לצייר שום מסך ולא למדוד שום אלמנט.** המלצר עובד באפליקציה האמיתית מהשנייה
// הראשונה — אותו עיצוב, אותן תמונות, אותו תפריט — והמדריך הוא שורה אחת מעל הסרגל שאומרת
// מה לעשות עכשיו. הוא מתקדם מ**מצב האפליקציה** (איזה טאב פתוח, איזו מנה נפתחה, אם נפתח
// הסבר אזהרה), לא מהקשה על אלמנט שצריך למצוא. אין DOM, אין geometry, אין מה שיישבר.
//
// ⚠️ הפס יושב **בזרימה הרגילה**, כאח של הסרגל התחתון — לא `position: fixed`. לכן אין כאן
// לא «הכלא של backdrop-filter» ולא חישוב גובה סרגל, והוא לעולם לא מכסה תוכן.
export default function CoachBar({ text, index, total, done, onSkip, onDone }) {
  return (
    <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5" dir="rtl">
      <div
        className="rounded-2xl px-3.5 py-2.5 flex items-center gap-3 border"
        style={{
          borderColor: "rgba(34,192,140,0.35)",
          background: "linear-gradient(150deg,rgba(34,192,140,0.14),rgba(15,92,70,0.20))",
        }}
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-black text-[#eef0f6] leading-snug">{text}</span>
          <span className="flex items-center gap-1 mt-1.5" aria-hidden>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className="h-[3px] rounded-full transition-all duration-300"
                style={{ width: i === index ? 18 : 8, background: i <= index ? "#22c08c" : "rgba(238,240,246,0.18)" }}
              />
            ))}
          </span>
        </span>
        {done ? (
          <button
            onClick={onDone}
            className="flex-shrink-0 h-10 px-4 rounded-xl bg-[#22c08c] text-[#06231a] text-[13px] font-black flex items-center gap-1.5"
          >
            <Check size={15} /> סיימתי
          </button>
        ) : (
          <button
            onClick={onSkip}
            className="flex-shrink-0 h-10 px-3 rounded-xl text-[11px] font-bold text-[#7d8492] border border-[#22252b]"
          >
            דילוג
          </button>
        )}
      </div>
    </div>
  );
}
