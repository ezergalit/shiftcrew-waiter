import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Flame, Clock, Trophy, Trash2, Loader2 } from "lucide-react";
import { colorFor } from "../games/shared";
import { supabase } from "../lib/supabase";
import { setSessionToken } from "../lib/appSession";

const db = supabase.schema("menu_app");

// "המדדים שלי" — the waiter's own stats screen. Everything here is derived from data the
// app already writes; nothing new is recorded to build it:
//   mastery %      menu_progress (same sum/(n*5) formula as everywhere else — a threshold
//                  count would read 9 dishes at 4/5 as better than 8 at 5/5)
//   time           team_members.total_seconds, fed by the visible-tab study timer
//   per-day bars   progress_snapshots, which the timer already flushes every 2 active min
//   streak         leaderboard.streak; the record is re-derived from snapshot days
//
// The owner has their own view of this (ProgressChart in the owner app). This one answers
// a different question — "how am I doing?" rather than "how is my team doing?" — so it is
// deliberately not the same component.

const fmtHours = (secs) => {
  if (!secs) return "0";
  const h = secs / 3600;
  return h >= 1 ? `${h.toFixed(1)}ש׳` : `${Math.round(secs / 60)} דק׳`;
};

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Longest run of consecutive days that have at least one snapshot. Stored streaks only
// track the current run, and a record that resets when the waiter misses a day is not a
// record. Derived instead of adding a column.
function recordStreak(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    const t = new Date(d).getTime();
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

// Mastery bands. A single-colour ring only says "how much"; these say "of what kind",
// which is the difference between a waiter knowing they are 49% and knowing that 12 dishes
// are solid and 9 have barely been opened.
const BANDS = [
  { key: "mastered", label: "שולט", color: "#22c08c", test: (v) => v >= 4 },
  { key: "learning", label: "בתהליך", color: "#4aa8ff", test: (v) => v >= 2 && v < 4 },
  { key: "started", label: "התחלתי", color: "#f3c14b", test: (v) => v === 1 },
  { key: "untouched", label: "לא נגעתי", color: "#3a3d47", test: (v) => !v },
];

function Ring({ pct, counts, total }) {
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = BANDS.map((b) => {
    const share = total ? (counts[b.key] || 0) / total : 0;
    const len = c * share;
    const arc = { ...b, len, gap: c - len, rotate: -90 + (offset / c) * 360 };
    offset += len;
    return arc;
  }).filter((a) => a.len > 0);

  return (
    <svg viewBox="0 0 140 140" className="w-[130px] h-[130px]">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#191b1f" strokeWidth="13" />
      {arcs.map((a) => (
        <circle
          key={a.key} cx="70" cy="70" r={r} fill="none" stroke={a.color} strokeWidth="13"
          strokeDasharray={`${a.len} ${a.gap}`} transform={`rotate(${a.rotate} 70 70)`}
        />
      ))}
      <text x="70" y="68" textAnchor="middle" className="fill-[#eef0f6]" style={{ fontSize: 26, fontWeight: 900 }}>
        {Math.round(pct)}%
      </text>
      <text x="70" y="86" textAnchor="middle" className="fill-[#8a8aa0]" style={{ fontSize: 10, fontWeight: 700 }}>
        שליטה
      </text>
    </svg>
  );
}

export default function MetricsScreen({ session, cards, masteryById, weekly = [], leaderboard = [], onDone }) {
  const [snaps, setSnaps] = useState(null);
  const [member, setMember] = useState(null);
  const [streak, setStreak] = useState(0);
  const [earnings, setEarnings] = useState([]);
  const [addingEarn, setAddingEarn] = useState(false);
  const [earnAmount, setEarnAmount] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (session?.offline || !session?.teamMemberId) { if (alive) setSnaps([]); return; }
      const monthStart = new Date();
      monthStart.setDate(1);
      const [s, m, l, e] = await Promise.all([
        db.from("progress_snapshots").select("taken_at, pct, seconds_delta, points")
          .eq("team_member_id", session.teamMemberId).order("taken_at", { ascending: true }),
        db.from("team_members").select("total_seconds, baseline_pct, created_at")
          .eq("id", session.teamMemberId).maybeSingle(),
        db.from("leaderboard").select("streak")
          .eq("team_member_id", session.teamMemberId).maybeSingle(),
        // RLS returns only this member's own rows — earnings are private.
        db.from("shift_earnings").select("date, amount")
          .eq("team_member_id", session.teamMemberId)
          .gte("date", monthStart.toISOString().slice(0, 10)),
      ]);
      if (!alive) return;
      setSnaps(s.data || []);
      setMember(m.data || null);
      setStreak(l.data?.streak || 0);
      setEarnings(e.data || []);
    })();
    return () => { alive = false; };
  }, [session]);

  // Upsert on (member, date): today's amount is corrected, not duplicated.
  const saveEarning = async () => {
    const amount = Number(earnAmount);
    if (!amount || !session?.teamMemberId) return;
    const date = new Date().toISOString().slice(0, 10);
    // restaurant_id is NOT NULL and the INSERT policy checks it — sending only the member
    // id fails on both counts.
    const { error } = await db.from("shift_earnings")
      .upsert(
        { restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, date, amount },
        { onConflict: "team_member_id,date" }
      );
    if (error) { console.error("shift_earnings", error.message, error.details, error.hint, error.code); return; }
    setEarnings((prev) => [...prev.filter((r) => r.date !== date), { date, amount }]);
    setAddingEarn(false); setEarnAmount("");
  };

  const stats = useMemo(() => {
    const list = cards || [];
    const scores = list.map((c) => masteryById?.[c.id] || 0);
    const sum = scores.reduce((a, b) => a + b, 0);
    const pct = list.length ? (sum / (list.length * 5)) * 100 : 0;
    const mastered = scores.filter((v) => v >= 4).length;
    const touched = scores.filter((v) => v > 0).length;
    const counts = Object.fromEntries(BANDS.map((b) => [b.key, scores.filter(b.test).length]));
    const totalSeconds = member?.total_seconds || 0;
    // Time left = the pace actually observed so far, applied to the score still missing.
    // Before any real study time there is nothing to extrapolate from, so it stays null
    // rather than inventing a number.
    const earned = sum;
    const remaining = list.length * 5 - sum;
    const estLeft = earned > 0 && totalSeconds > 0 ? (totalSeconds / earned) * remaining : null;
    return { pct, mastered, touched, counts, total: list.length, totalSeconds, estLeft };
  }, [cards, masteryById, member]);

  const record = useMemo(
    () => recordStreak((snaps || []).map((s) => dayKey(s.taken_at))),
    [snaps]
  );

  // Each card carries its own accent so the screen reads as sections at a glance rather
  // than one long grey column.
  const Card = ({ title, accent = "#6d5efc", children }) => (
    <div className="bg-[#16181c] rounded-2xl p-4 border border-[#22252b] relative overflow-hidden">
      <span className="absolute top-0 right-0 h-full w-[3px]" style={{ background: accent }} />
      <p className="text-xs font-black mb-3" style={{ color: accent }}>{title}</p>
      {children}
    </div>
  );
  const Stat = ({ label, value, color = "#eef0f6" }) => (
    <div className="flex-1 text-center">
      <p className="text-[10px] text-[#8a8aa0] font-bold leading-tight mb-1">{label}</p>
      <p className="text-lg font-black" style={{ color }}>{value}</p>
    </div>
  );

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] flex items-center gap-1">
          <ChevronRight size={14} /> חזרה
        </button>
        <p className="text-sm font-black">המדדים שלי</p>
        <span className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!session?.offline && (() => {
          const total = earnings.reduce((n, r) => n + Number(r.amount || 0), 0);
          const monthName = new Date().toLocaleDateString("he-IL", { month: "long" });
          return (
            <Card title={`ההכנסות שלי — ${monthName}`} accent="#f3c14b">
              {earnings.length === 0 ? (
                <p className="text-[11px] text-[#8a8aa0]">
                  עוד לא נרשמו משמרות החודש — בערב של יום לימוד תקבלו הצעה להזין כמה הרווחתם.
                </p>
              ) : (
                <div className="flex">
                  <Stat label="הרווחתם החודש" value={`₪${total.toLocaleString()}`} color="#f3c14b" />
                  <Stat label="משמרות שנרשמו" value={earnings.length} color="#eef0f6" />
                  <Stat label="ממוצע למשמרת" value={`₪${Math.round(total / earnings.length).toLocaleString()}`} color="#22c08c" />
                </div>
              )}
              {/* Without a way in, the card above could only ever say "nothing yet" —
                  the evening prompt that used to fill it is not wired up. One row per
                  date, so re-entering today's amount corrects it instead of doubling. */}
              {addingEarn ? (
                <div className="flex gap-1.5 mt-2">
                  <input
                    type="number" inputMode="numeric" autoFocus
                    value={earnAmount} onChange={(e) => setEarnAmount(e.target.value)}
                    placeholder="כמה הרווחתם היום?"
                    className="flex-1 min-w-0 bg-[#0c0d10] border border-[#22252b] rounded-lg px-2.5 py-2 text-[#eef0f6] text-xs focus:outline-none focus:border-[#f3c14b]"
                  />
                  <button onClick={saveEarning} disabled={!Number(earnAmount)}
                    className="px-3 py-2 min-h-[36px] rounded-lg text-[11px] font-black bg-[#f3c14b] text-[#231c05] disabled:opacity-50">
                    שמירה
                  </button>
                  <button onClick={() => { setAddingEarn(false); setEarnAmount(""); }}
                    className="px-2.5 py-2 rounded-lg text-[11px] font-bold bg-[#22252b] text-[#8a8aa0]">ביטול</button>
                </div>
              ) : (
                <button onClick={() => setAddingEarn(true)}
                  className="w-full mt-2 py-2 min-h-[36px] rounded-lg text-[11px] font-black bg-[#33290f] text-[#f3c14b]">
                  + רישום המשמרת של היום
                </button>
              )}
              <p className="text-[10px] text-[#5a5a6e] mt-2">הסכומים נשמרים רק אצלך — אף אחד אחר בצוות או בניהול לא רואה אותם.</p>
            </Card>
          );
        })()}
        <p className="text-[11px] font-black text-[#6d5efc]">התקדמות</p>
        <Card title="שליטה בתפריט" accent="#6d5efc">
          <div className="flex items-center gap-3">
            <Ring pct={stats.pct} counts={stats.counts} total={stats.total} />
            <div className="flex-1 space-y-2.5">
              <div>
                <p className="text-[10px] text-[#8a8aa0] font-bold">מנות שנשלטו</p>
                <p className="text-base font-black text-[#22c08c]">{stats.mastered} / {stats.total}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8a8aa0] font-bold">זמן משוער שנותר</p>
                <p className="text-base font-black text-[#4aa8ff]">
                  {stats.estLeft === null ? "—" : fmtHours(stats.estLeft)}
                </p>
              </div>
              {member?.baseline_pct != null && (
                <div>
                  <p className="text-[10px] text-[#8a8aa0] font-bold">ידע התחלתי</p>
                  <p className="text-sm font-black text-[#f3c14b]">{Math.round(member.baseline_pct)}%</p>
                </div>
              )}
            </div>
          </div>
          {/* Legend: without it the ring's colours are decoration rather than information. */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-[#22252b]">
            {BANDS.map((b) => (
              <div key={b.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                <span className="text-[10px] font-bold text-[#8a8aa0]">
                  {b.label} {stats.counts?.[b.key] || 0}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="מאז ההצטרפות" accent="#22c08c">
          <div className="flex">
            <Stat label="מנות שלמדתם" value={stats.touched} color="#4aa8ff" />
            <Stat label="מנות שנשלטו" value={stats.mastered} color="#22c08c" />
          </div>
        </Card>

        <p className="text-[11px] font-black text-[#f3c14b] pt-1">הדירוג בצוות</p>
        <Board session={session} weekly={weekly} leaderboard={leaderboard} />

        <Card title="רצפים" accent="#f3c14b">
          <div className="flex">
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame size={12} className="text-[#f3c14b]" />
                <p className="text-[10px] text-[#8a8aa0] font-bold">רצף נוכחי</p>
              </div>
              <p className="text-lg font-black text-[#f3c14b]">{streak}</p>
            </div>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Trophy size={12} className="text-[#f3c14b]" />
                <p className="text-[10px] text-[#8a8aa0] font-bold">שיא</p>
              </div>
              <p className="text-lg font-black text-[#f3c14b]">{Math.max(record, streak)}</p>
            </div>
          </div>
        </Card>

        {session?.offline && (
          <div className="flex items-center gap-1.5 justify-center py-2">
            <Clock size={11} className="text-[#f3c14b]" />
            <p className="text-[10px] text-[#f3c14b] font-bold">מצב לוקאלי — אין נתונים היסטוריים</p>
          </div>
        )}

        {!session?.offline && <DeleteProfile />}
      </div>
    </div>
  );
}

// The team leaderboard, moved here from its own bottom-nav tab (user request, 2026-08-20):
// ranking matters, but not enough for prime navigation — it lives "hidden" behind the
// stats button now. Same rules as before: weekly is the default (a lifetime total means
// whoever started first wins forever), all-time behind a toggle.
function Board({ session, weekly, leaderboard }) {
  const [scope, setScope] = useState("week");
  const weeklyRows = weekly.map((w) => {
    const all = leaderboard.find((r) => r.team_member_id === w.team_member_id);
    return { ...w, mastered_count: all?.mastered_count ?? 0, streak: all?.streak ?? 0 };
  });
  const rows = scope === "week" ? weeklyRows : leaderboard;
  const myRank = rows.findIndex((r) => r.team_member_id === session?.teamMemberId) + 1;

  return (
    <div className="space-y-2">
      {myRank > 0 && (
        <div className="bg-[#16181c] border border-[#f3c14b]/40 rounded-xl p-3 text-center">
          <p className="text-base font-black text-[#f3c14b]">אתם במקום {myRank}!</p>
          <p className="text-[11px] text-[#8a8aa0] font-bold mt-0.5">
            {scope === "week" ? "בדירוג של השבוע" : "בדירוג כל הזמנים"}
          </p>
        </div>
      )}
      <div className="flex gap-1.5">
        {[{ k: "week", label: "השבוע" }, { k: "all", label: "כל הזמנים" }].map((o) => (
          <button
            key={o.k}
            onClick={() => setScope(o.k)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              scope === o.k
                ? "bg-[#6d5efc] text-white border-[#6d5efc]"
                : "bg-[#16181c] text-[#8a8aa0] border-[#22252b]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {scope === "week" && (
        <p className="text-[11px] text-[#8a8aa0] px-1 leading-relaxed">
          הניקוד מתאפס בכל יום ראשון — כל שבוע מתחיל מחדש, וגם מי שהצטרף אתמול יכול לנצח.
        </p>
      )}
      <div className="bg-[#16181c] rounded-2xl overflow-hidden">
        {rows.length === 0 && (
          <p className="text-xs text-[#8a8aa0] p-4 text-center">
            {scope === "week" ? "עוד לא נצברו נקודות השבוע — אתם יכולים להיות ראשונים" : "עדיין אין נתונים — התחילו ללמוד!"}
          </p>
        )}
        {rows.slice(0, 10).map((r, i) => (
          <div key={r.team_member_id} className={`flex items-center gap-2 px-3 py-2 ${i > 0 ? "border-t border-[#22252b]" : ""}`}>
            <span className="text-xs font-black w-5" style={{ color: ["#f3c14b", "#c7ccd6", "#cd8b5b"][i] || "#8a8aa0" }}>{i + 1}</span>
            <span className="w-6 h-6 rounded-full text-[9px] font-black flex items-center justify-center text-white flex-shrink-0" style={{ background: colorFor(r.name) }}>{r.name[0]}</span>
            <div className="flex-1">
              <p className={`text-xs font-bold ${r.team_member_id === session?.teamMemberId ? "text-[#6d5efc]" : "text-[#eef0f6]"}`}>{r.name}{r.team_member_id === session?.teamMemberId ? " (אני)" : ""}</p>
              <p className="text-[11px] text-[#8a8aa0] flex items-center gap-1">{r.mastered_count} נלמדו{r.streak > 1 && <span className="flex items-center gap-0.5"><Flame size={9} className="text-[#ff7a59]" />{r.streak}</span>}</p>
            </div>
            <p className="text-xs font-black text-[#6d5efc]">{r.points}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// In-app profile deletion — a store requirement (Google Play UserData policy /
// App Store 5.1.1(v)): any app where people create an identity must let them
// erase it from inside the app. The RPC resolves who to delete from the session
// token, deletes the team_members row, and the FK cascades take the progress,
// leaderboard and history rows with it.
function DeleteProfile() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      const { data, error } = await supabase.schema("menu_app").rpc("delete_my_team_profile");
      if (error || !data?.ok) throw error || new Error(data?.error);
      localStorage.removeItem("menu-app-team-session");
      setSessionToken(null);
      window.location.reload();
    } catch (e) {
      console.error("delete profile:", e);
      setErr("המחיקה נכשלה. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <div className="pt-2 pb-4">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full text-center text-[11px] text-[#5a5a6e] font-bold underline underline-offset-2 py-2">
          מחיקת הפרופיל שלי מהמסעדה
        </button>
      ) : (
        <div className="bg-[#16181c] border border-[#3a1c22] rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-[#e0315a] flex items-center gap-1.5">
            <Trash2 size={13} /> מחיקת הפרופיל
          </p>
          <p className="text-[11px] text-[#8a8aa0] leading-relaxed">
            כל ההתקדמות, הנקודות והמבחנים שלכם יימחקו לצמיתות. אין שחזור.
          </p>
          {err && <p className="text-[11px] font-bold text-[#e0315a]">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} disabled={busy}
              className="flex-1 bg-[#22252b] text-[#c4c4d4] font-bold py-2.5 rounded-xl text-xs">
              ביטול
            </button>
            <button onClick={run} disabled={busy}
              className="flex-1 bg-[#e0315a] text-white font-black py-2.5 rounded-xl text-xs disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin mx-auto" /> : "מחיקה לצמיתות"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
