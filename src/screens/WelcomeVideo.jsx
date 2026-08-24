import { useRef, useState } from "react";
import { Play, SkipForward, Volume2, VolumeX } from "lucide-react";

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

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[15px] font-black">
          ברוך הבא{session?.restaurantName ? ` ל${session.restaurantName}` : ""} 👋
        </p>
        <p className="text-[11.5px] text-[#8a8aa0] mt-0.5">סרטון קצר שמראה איך עובדים עם האפליקציה · אפשר להפעיל קול 🔊</p>
      </div>

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
