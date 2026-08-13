import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Flame, Clock, Trophy } from "lucide-react";
import { supabase } from "../lib/supabase";

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

const RANGES = [
  { key: 7, label: "7 ימים" },
  { key: 30, label: "30 יום" },
  { key: 365, label: "שנה" },
];

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

function Ring({ pct }) {
  const r = 52, c = 2 * Math.PI * r;
  // Three arcs so the ring reads like the mockup: mastered, partial, untouched.
  const dash = (c * Math.min(100, Math.max(0, pct))) / 100;
  return (
    <svg viewBox="0 0 140 140" className="w-[130px] h-[130px]">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#22252b" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r} fill="none" stroke="#6d5efc" strokeWidth="12"
        strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="68" textAnchor="middle" className="fill-[#eef0f6]" style={{ fontSize: 26, fontWeight: 900 }}>
        {Math.round(pct)}%
      </text>
      <text x="70" y="86" textAnchor="middle" className="fill-[#8a8aa0]" style={{ fontSize: 10, fontWeight: 700 }}>
        שליטה
      </text>
    </svg>
  );
}

// Bar chart with no chart library — same approach as the owner's ProgressChart. Bars are
// divs, so an empty range still lays out correctly instead of collapsing.
function Bars({ data, color, emptyNote }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const avg = data.length ? total / data.length : 0;
  if (!total) return <p className="text-[11px] text-[#8a8aa0] py-6 text-center">{emptyNote}</p>;
  return (
    <>
      <div className="flex items-end justify-between gap-[3px] h-[110px] mb-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center h-full" title={`${d.label}: ${d.value}`}>
            <div
              className="w-full rounded-t-sm min-h-[2px] transition-all"
              style={{ height: `${(d.value / max) * 100}%`, background: d.value ? color : "#22252b" }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-[#8a8aa0] font-bold">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center truncate">{d.showLabel ? d.label : ""}</span>
        ))}
      </div>
      <p className="text-[10px] text-[#8a8aa0] font-bold mt-2 text-center">ממוצע: {avg.toFixed(1)}</p>
    </>
  );
}

export default function MetricsScreen({ session, cards, masteryById, onDone }) {
  const [snaps, setSnaps] = useState(null);
  const [member, setMember] = useState(null);
  const [streak, setStreak] = useState(0);
  const [range, setRange] = useState(7);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (session?.offline || !session?.teamMemberId) { if (alive) setSnaps([]); return; }
      const [s, m, l] = await Promise.all([
        db.from("progress_snapshots").select("taken_at, pct, seconds_delta, points")
          .eq("team_member_id", session.teamMemberId).order("taken_at", { ascending: true }),
        db.from("team_members").select("total_seconds, baseline_pct, created_at")
          .eq("id", session.teamMemberId).maybeSingle(),
        db.from("leaderboard").select("streak")
          .eq("team_member_id", session.teamMemberId).maybeSingle(),
      ]);
      if (!alive) return;
      setSnaps(s.data || []);
      setMember(m.data || null);
      setStreak(l.data?.streak || 0);
    })();
    return () => { alive = false; };
  }, [session]);

  const stats = useMemo(() => {
    const list = cards || [];
    const scores = list.map((c) => masteryById?.[c.id] || 0);
    const sum = scores.reduce((a, b) => a + b, 0);
    const pct = list.length ? (sum / (list.length * 5)) * 100 : 0;
    const mastered = scores.filter((v) => v >= 4).length;
    const touched = scores.filter((v) => v > 0).length;
    const totalSeconds = member?.total_seconds || 0;
    // Time left = the pace actually observed so far, applied to the score still missing.
    // Before any real study time there is nothing to extrapolate from, so it stays null
    // rather than inventing a number.
    const earned = sum;
    const remaining = list.length * 5 - sum;
    const estLeft = earned > 0 && totalSeconds > 0 ? (totalSeconds / earned) * remaining : null;
    return { pct, mastered, touched, total: list.length, totalSeconds, estLeft };
  }, [cards, masteryById, member]);

  const series = useMemo(() => {
    const days = [];
    const now = new Date();
    const n = range === 365 ? 52 : range; // a year is bucketed by week, not by day
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      if (range === 365) d.setDate(d.getDate() - i * 7);
      else d.setDate(d.getDate() - i);
      days.push(d);
    }
    const bucket = (d) => (range === 365
      ? `w${Math.floor((now - d) / (7 * 86400000))}`
      : dayKey(d));
    const mins = new Map(), pts = new Map();
    for (const s of snaps || []) {
      const d = new Date(s.taken_at);
      const k = bucket(d);
      mins.set(k, (mins.get(k) || 0) + Math.round((s.seconds_delta || 0) / 60));
      pts.set(k, (pts.get(k) || 0) + (s.points || 0));
    }
    const label = (d) => (range === 7
      ? ["א", "ב", "ג", "ד", "ה", "ו", "ש"][d.getDay()]
      : `${d.getDate()}/${d.getMonth() + 1}`);
    const every = range === 7 ? 1 : range === 30 ? 5 : 8;
    return days.map((d, i) => ({
      label: label(d),
      showLabel: i % every === 0,
      minutes: mins.get(bucket(d)) || 0,
      points: pts.get(bucket(d)) || 0,
    }));
  }, [snaps, range]);

  const record = useMemo(
    () => recordStreak((snaps || []).map((s) => dayKey(s.taken_at))),
    [snaps]
  );

  const Card = ({ title, children }) => (
    <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-4">
      <p className="text-xs font-black text-[#eef0f6] mb-3">{title}</p>
      {children}
    </div>
  );
  const Stat = ({ label, value }) => (
    <div className="flex-1 text-center">
      <p className="text-[10px] text-[#8a8aa0] font-bold leading-tight mb-1">{label}</p>
      <p className="text-lg font-black text-[#eef0f6]">{value}</p>
    </div>
  );

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0] flex items-center gap-1">
          <ChevronRight size={14} /> חזרה
        </button>
        <p className="text-sm font-black">המדדים שלי</p>
        <span className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <p className="text-[11px] font-black text-[#8a8aa0]">התקדמות</p>
        <Card title="שליטה בתפריט">
          <div className="flex items-center gap-3">
            <Ring pct={stats.pct} />
            <div className="flex-1 space-y-2.5">
              <div>
                <p className="text-[10px] text-[#8a8aa0] font-bold">מנות שנשלטו</p>
                <p className="text-base font-black">{stats.mastered} / {stats.total}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8a8aa0] font-bold">זמן משוער שנותר</p>
                <p className="text-base font-black">
                  {stats.estLeft === null ? "—" : fmtHours(stats.estLeft)}
                </p>
              </div>
              {member?.baseline_pct != null && (
                <div>
                  <p className="text-[10px] text-[#8a8aa0] font-bold">ידע התחלתי</p>
                  <p className="text-sm font-black text-[#8a8aa0]">{Math.round(member.baseline_pct)}%</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="מאז ההצטרפות">
          <div className="flex">
            <Stat label="מנות שנגעתם בהן" value={stats.touched} />
            <Stat label="מנות שנשלטו" value={stats.mastered} />
            <Stat label="זמן לימוד" value={fmtHours(stats.totalSeconds)} />
          </div>
        </Card>

        <p className="text-[11px] font-black text-[#8a8aa0] pt-1">התמדה</p>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                range === r.key
                  ? "bg-[#6d5efc] text-white border-[#6d5efc]"
                  : "bg-[#16181c] text-[#8a8aa0] border-[#22252b]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Card title="דקות לימוד ליום">
          {snaps === null
            ? <p className="text-[11px] text-[#8a8aa0] py-6 text-center">טוען…</p>
            : <Bars data={series.map((d) => ({ ...d, value: d.minutes }))} color="#6d5efc"
                    emptyNote="עוד לא נרשם זמן לימוד בטווח הזה" />}
        </Card>

        <Card title="נקודות ליום">
          {snaps === null
            ? <p className="text-[11px] text-[#8a8aa0] py-6 text-center">טוען…</p>
            : <Bars data={series.map((d) => ({ ...d, value: d.points }))} color="#22c08c"
                    emptyNote="עוד לא נצברו נקודות בטווח הזה" />}
        </Card>

        <Card title="רצפים">
          <div className="flex">
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Flame size={12} className="text-[#f3c14b]" />
                <p className="text-[10px] text-[#8a8aa0] font-bold">רצף נוכחי</p>
              </div>
              <p className="text-lg font-black">{streak}</p>
            </div>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Trophy size={12} className="text-[#f3c14b]" />
                <p className="text-[10px] text-[#8a8aa0] font-bold">שיא</p>
              </div>
              <p className="text-lg font-black">{Math.max(record, streak)}</p>
            </div>
          </div>
        </Card>

        {session?.offline && (
          <div className="flex items-center gap-1.5 justify-center py-2">
            <Clock size={11} className="text-[#f3c14b]" />
            <p className="text-[10px] text-[#f3c14b] font-bold">מצב לוקאלי — אין נתונים היסטוריים</p>
          </div>
        )}
      </div>
    </div>
  );
}
