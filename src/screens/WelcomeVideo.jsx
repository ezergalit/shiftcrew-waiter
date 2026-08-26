import { useRef, useState } from "react";
import { Play, SkipForward, Volume2, VolumeX, BookOpen, Store } from "lucide-react";

// The restaurant's own tour video, shown once to a new waiter in place of the slide
// tutorial (user, 2026-08-24). Which restaurants get one is data, not code:
// restaurants.welcome_video_url, delivered by team_join.
//
// ⚠️ The render carries a silent audio track, so the video is muted and `playsInline` —
// that combination is the only one iOS Safari will start without a user gesture. The play
// button is still there for the browsers that refuse anyway, and "skip" is always visible:
// a waiter opening this mid-shift should never be held by a 67-second video.
export default function WelcomeVideo({ session, onDone }) {
  const ref = useRef(null);
  const [ended, setEnded] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  // ⚠️ Starts muted because that is the only way a browser will autoplay at all — but the
  // render carries a soundtrack now, so there has to be a way to turn it on. One tap.
  const [muted, setMuted] = useState(true);

  // The video explains the APP. Nothing in it says who this restaurant is — and for a
  // video restaurant it replaces the slide tutorial, whose first slide was exactly that
  // introduction (user, 2026-08-26: "explain the restaurant better on the starting page").
  // So the end of the video is where the restaurant introduces itself: a short card, not
  // the whole hosting guide, which lives in "אודות המסעדה" where it can be re-read.
  const cuisines = session?.restaurantCuisineTypes || [];
  const intro = session?.restaurantDescription;

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[15px] font-black">
          ברוכים הבאים{session?.restaurantName ? ` ל${session.restaurantName}` : ""} 👋
        </p>
        <p className="text-[11.5px] text-[#8a8aa0] mt-0.5">
          {ended ? "זהו — עכשיו כמה מילים עלינו" : "סרטון קצר שמראה איך עובדים עם האפליקציה · אפשר להפעיל קול 🔊"}
        </p>
      </div>

      {ended ? (
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
          <div className="rounded-2xl p-4 text-[#EEF0F6]" style={{ background: "linear-gradient(135deg,#0F5C46,#0a3d2f)" }}>
            <p className="text-[19px] font-black leading-tight">{session?.restaurantName || "המסעדה שלנו"}</p>
            {cuisines.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {cuisines.map((c) => (
                  <span key={c} className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-[#EEF0F6]/15">{c}</span>
                ))}
              </div>
            )}
            {intro && <p className="text-[14px] leading-relaxed mt-3 text-[#EEF0F6]/90">{intro}</p>}
          </div>

          {session?.restaurantServiceNotes && (
            <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 flex items-start gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[#6d5efc]/15 flex items-center justify-center flex-shrink-0">
                <Store size={15} className="text-[#a79bff]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-[#eef0f6]">כללי הבית מחכים לכם בפנים</p>
                <p className="text-[11.5px] text-[#8a8aa0] leading-relaxed mt-0.5">
                  בטאב התפריט, תחת ״אודות המסעדה״ — מה מגישים, מה אפשר לשנות ומה חשוב לשאול. שווה לקרוא לפני המשמרת הראשונה.
                </p>
              </div>
            </div>
          )}

          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#22c08c]/15 flex items-center justify-center flex-shrink-0">
              <BookOpen size={15} className="text-[#22c08c]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black text-[#eef0f6]">מתחילים מהתפריט</p>
              <p className="text-[11.5px] text-[#8a8aa0] leading-relaxed mt-0.5">
                קוראים את המנות, מתרגלים בכרטיסיות, ואז נבחנים. הכול נמצא בטאבים למטה.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={ref}
            src={session?.welcomeVideoUrl}
            className="w-full h-full object-contain"
            autoPlay
            muted={muted}
            playsInline
            controls
            onEnded={() => setEnded(true)}
            onError={() => setEnded(true)}   // a video that won't load must not trap anyone
            onPlay={() => setNeedsTap(false)}
            onLoadedData={(e) => { e.currentTarget.play().catch(() => setNeedsTap(true)); }}
          />
          <button
            onClick={() => { const v = ref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }}
            className="absolute top-3 left-3 w-11 h-11 rounded-full bg-black/60 text-[#eef0f6] flex items-center justify-center"
            aria-label={muted ? "הפעלת קול" : "השתקה"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {needsTap && (
            <button
              onClick={() => ref.current?.play().catch(() => setEnded(true))}
              className="absolute inset-0 flex items-center justify-center bg-black/40"
              aria-label="הפעלה"
            >
              <span className="w-16 h-16 rounded-full bg-[#22c08c] text-[#06231a] flex items-center justify-center">
                <Play size={26} />
              </span>
            </button>
          )}
        </div>
      )}

      <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
        <button
          onClick={onDone}
          className={`w-full py-3.5 min-h-[52px] rounded-2xl font-black text-sm ${
            ended ? "bg-[#22c08c] text-[#06231a]" : "bg-[#16181c] border border-[#22252b] text-[#c4c4d4]"
          }`}
        >
          {ended ? "יאללה, מתחילים" : (
            <span className="flex items-center justify-center gap-1.5">
              <SkipForward size={15} />לדלג ולהתחיל
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
