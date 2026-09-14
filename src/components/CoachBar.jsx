import { Check } from "lucide-react";

// ══ מדריך ההפעלה: פס הנחיה מעל הסרגל, על האפליקציה האמיתית ══
//
// שתי הגרסאות שלפניו נכשלו משתי סיבות הפוכות, ושתיהן מלמדות את אותו דבר:
//   1. **הסיור עם הזרקור** היה שכבה שמדדה אלמנטים חיים, החשיכה את השאר וחיכתה שההקשה
//      תנחת במקום מסוים — ומשם הגיעו הדיליי, הקפיצות והצעדים התקועים.
//   2. **המדריך שרינדר עותק של המסכים** ברח מהמדידה, אבל צייר UI משלו — ולכן נראה
//      כמו גרסה זולה של האפליקציה. **העתק שנראה פחות טוב מהמקור גרוע משכבה.**
//
// כאן לא מצויר שום מסך ולא נמדד שום אלמנט. המלצר עובד באפליקציה האמיתית מהשנייה
// הראשונה — אותו עיצוב, אותן תמונות, אותו תפריט — והפס מסביר את המסך שהוא עומד בו,
// בפעם הראשונה שהוא מגיע אליו (`lib/coachStops.js`). הטריגר הוא **מצב האפליקציה**:
// אין DOM, אין geometry, ומסך שזז משנה טקסט ולא מנגנון.
//
// ⚠️ הפס יושב **בזרימה הרגילה**, כאח של הסרגל התחתון — לא `position: fixed`. לכן אין כאן
// לא «הכלא של backdrop-filter» ולא חישוב גובה סרגל, והוא לעולם לא מכסה תוכן.
export default function CoachBar({ text, onOk }) {
  return (
    <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5" dir="rtl">
      <div
        className="rounded-2xl px-3.5 py-2.5 flex items-center gap-3 border"
        style={{
          borderColor: "rgba(34,192,140,0.35)",
          background: "linear-gradient(150deg,rgba(34,192,140,0.14),rgba(15,92,70,0.20))",
        }}
      >
        <span className="flex-1 min-w-0 text-[13.5px] font-black text-[#eef0f6] leading-snug">{text}</span>
        <button
          onClick={onOk}
          className="flex-shrink-0 h-10 px-3.5 rounded-xl bg-[#22c08c] text-[#06231a] text-[12.5px] font-black flex items-center gap-1.5"
        >
          <Check size={15} /> הבנתי
        </button>
      </div>
    </div>
  );
}
