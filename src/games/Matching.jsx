import { useState, useEffect, useMemo, useRef } from "react";
import { Trophy } from "lucide-react";
import { dishLabel } from "../lib/questionEngine";
import { shuffle } from "./shared";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");


// Quizlet-style Match: a shuffled grid of name+key-ingredients tiles; tap two tiles to
// pair them. Was name+price — switched 2026-08-11 (user feedback): price isn't relevant
// to menu knowledge, and some dish *names* have a price baked into them (data-quality
// issue from the seed data), which made price tiles actively misleading.
// Objective — a pair matched with zero wrong attempts grades 5, one wrong attempt 4,
// two 3, three+ 2. No self-report; guessing wrong repeatedly costs you the rating.
const BOARDS_PER_GAME = 2;
// A wrong match costs 5 seconds. Without it the fastest strategy is to tap pairs at random
// until something sticks, which is the opposite of what the game is meant to train.
const WRONG_MATCH_PENALTY_S = 5;

export default function Matching({ items, onAnswer, onDone, session }) {
  // `board` advances only when the player clears the current grid. It is the ONLY thing
  // the deck depends on besides the (now frozen) item pool, so a grid can never be
  // rebuilt in the middle of play — matching a pair used to swap the whole board.
  const [board, setBoard] = useState(0);
  const [finished, setFinished] = useState(false);
  const deck = useMemo(() => {
    const chosen = shuffle((items || []).filter(it => it.ingredients?.length > 0)).slice(0, 6);
    const tiles = chosen.flatMap(it => [
      { key: `${it.id}-name`, pairId: it.id, kind: "name", label: dishLabel(it) },
      { key: `${it.id}-ing`, pairId: it.id, kind: "ing", label: it.ingredients.slice(0, 3).join(", ") },
    ]);
    return shuffle(tiles);
  }, [items, board]);

  const [matched, setMatched] = useState(new Set());
  const [sel, setSel] = useState([]);
  const [wrongPair, setWrongPair] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [penalty, setPenalty] = useState(0);
  const [stats, setStats] = useState({ pairs: 0, clean: 0, seconds: 0 });
  // Top-3 fastest for this restaurant, loaded once the game ends.
  const [records, setRecords] = useState(null);
  const startedRef = useRef(Date.now());
  const wrongAttemptsRef = useRef(new Map()); // pairId -> count, for objective grading

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const startBoard = (nextBoard) => {
    setMatched(new Set());
    setSel([]);
    setWrongPair([]);
    wrongAttemptsRef.current = new Map();
    startedRef.current = Date.now();
    setSeconds(0);
    setPenalty(0);
    setRunning(true);
    setBoard(nextBoard);
  };

  // Record the run and read back the restaurant's fastest three. Runs once per finished
  // game (`finished` only flips on the last board), and only for a real session — an
  // offline fallback session has no restaurant to compare against.
  useEffect(() => {
    if (!finished || records !== null) return;
    let alive = true;
    (async () => {
      if (session?.offline || !session?.restaurantId) { if (alive) setRecords([]); return; }
      // A failed insert must not cost the player their result screen, so the podium is
      // read back regardless of whether the write landed.
      await db.from("match_times").insert({
        restaurant_id: session.restaurantId,
        team_member_id: session.teamMemberId,
        name: session.name,
        seconds: stats.seconds,
        boards: BOARDS_PER_GAME,
        pairs: stats.pairs,
        clean: stats.clean,
      });
      const { data } = await db
        .from("match_times")
        .select("name, seconds, created_at")
        .eq("restaurant_id", session.restaurantId)
        .eq("boards", BOARDS_PER_GAME)   // only compare runs of the same length
        .order("seconds", { ascending: true })
        .limit(3);
      if (alive) setRecords(data || []);
    })();
    return () => { alive = false; };
  }, [finished, records, session, stats]);

  if (!deck.length) return <div className="h-screen flex items-center justify-center bg-[#0c0d10] text-[#eef0f6]"><p>אין מספיק פריטים</p></div>;

  if (finished) {
    const accuracy = stats.pairs ? Math.round((stats.clean / stats.pairs) * 100) : 0;
    return (
      <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
        <Trophy size={40} className="text-[#f3c14b]" />
        <div>
          <p className="text-4xl font-black">{accuracy}%</p>
          <p className="text-sm text-[#8a8aa0] mt-1">
            {stats.pairs} התאמות ב-{BOARDS_PER_GAME} לוחות · {stats.seconds} שניות
          </p>
        </div>
        <p className="text-xs text-[#8a8aa0]">מתוכן {stats.clean} נכונות בניסיון הראשון</p>

        <div className="w-full max-w-[280px]">
          <p className="text-[11px] font-black text-[#8a8aa0] mb-2">🏆 השיאים של המסעדה</p>
          {records === null ? (
            <p className="text-[11px] text-[#8a8aa0]">טוען…</p>
          ) : records.length === 0 ? (
            <p className="text-[11px] text-[#8a8aa0]">אין עדיין שיאים — הזמן שלכם ייכנס ראשון</p>
          ) : (
            <div className="flex flex-col gap-1">
              {records.map((r, i) => {
                // Highlight the row that is this run: same name and same time.
                const isMine = r.name === session?.name && r.seconds === stats.seconds;
                return (
                  <div
                    key={`${r.name}-${r.created_at}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold ${
                      isMine ? "bg-[#241f4d] border border-[#6d5efc]" : "bg-[#16181c]"
                    }`}
                  >
                    <span className="text-sm">{["🥇", "🥈", "🥉"][i]}</span>
                    <span className="flex-1 text-right text-[#eef0f6] truncate">{r.name}</span>
                    <span className="text-[#f3c14b] font-black">{r.seconds}s</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full max-w-[240px]">
          <button
            onClick={() => { setStats({ pairs: 0, clean: 0, seconds: 0 }); setRecords(null); setFinished(false); startBoard(board + 1); }}
            className="px-4 py-3 rounded-2xl bg-[#6d5efc] text-white font-black text-sm"
          >
            עוד סבב
          </button>
          <button onClick={onDone} className="px-4 py-3 rounded-2xl bg-[#22252b] text-[#c4c4d4] font-bold text-sm">סיום</button>
        </div>
      </div>
    );
  }

  const done = matched.size === deck.length;
  if (done && running) setRunning(false);

  const tap = (tile) => {
    if (matched.has(tile.key) || sel.find(s => s.key === tile.key) || wrongPair.length) return;
    const nextSel = [...sel, tile];
    setSel(nextSel);
    if (nextSel.length === 2) {
      const [a, b] = nextSel;
      if (a.pairId === b.pairId && a.kind !== b.kind) {
        setMatched(m => new Set(m).add(a.key).add(b.key));
        setSel([]);
        const wrongCount = wrongAttemptsRef.current.get(a.pairId) || 0;
        const rating = wrongCount === 0 ? 5 : wrongCount === 1 ? 4 : wrongCount === 2 ? 3 : 2;
        onAnswer(a.pairId, rating);
        setStats((st) => ({ ...st, pairs: st.pairs + 1, clean: st.clean + (wrongCount === 0 ? 1 : 0) }));
      } else {
        // A wrong guess counts against BOTH tiles involved — whichever one the player
        // eventually matches correctly will remember this miss.
        wrongAttemptsRef.current.set(a.pairId, (wrongAttemptsRef.current.get(a.pairId) || 0) + 1);
        wrongAttemptsRef.current.set(b.pairId, (wrongAttemptsRef.current.get(b.pairId) || 0) + 1);
        setPenalty((p) => p + WRONG_MATCH_PENALTY_S);
        setWrongPair([a.key, b.key]);
        setTimeout(() => { setWrongPair([]); setSel([]); }, 550);
      }
    }
  };

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button>
        <p className="text-xs font-bold text-[#eef0f6]">התאמה · לוח {(board % BOARDS_PER_GAME) + 1}/{BOARDS_PER_GAME}</p>
        <p className={`text-xs font-black ${wrongPair.length ? "text-[#e0315a]" : "text-[#f3c14b]"}`}>
          ⏱ {seconds + penalty}s{penalty > 0 && <span className="text-[10px] font-bold text-[#e0315a]"> (+{penalty})</span>}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {deck.map(tile => {
            const isMatched = matched.has(tile.key);
            const isSelected = sel.find(s => s.key === tile.key);
            const isWrong = wrongPair.includes(tile.key);
            return (
              <button
                key={tile.key}
                onClick={() => tap(tile)}
                disabled={isMatched}
                className={`min-h-[72px] px-2 py-2 rounded-lg font-bold text-center text-[11px] leading-tight flex items-center justify-center transition-all duration-150 ${
                  isMatched ? "bg-[#15302b] text-[#22c08c] opacity-40" :
                  isWrong ? "bg-[#e0315a] text-white animate-pulse" :
                  isSelected ? "bg-[#6d5efc] text-white scale-95" :
                  "bg-[#16181c] text-[#eef0f6] border border-[#22252b]"
                }`}
              >
                {tile.label}
              </button>
            );
          })}
        </div>
        {done && (
          <div className="text-center mt-6">
            <Trophy size={32} className="text-[#f3c14b] mx-auto mb-2" />
            <p className="text-sm font-black text-[#eef0f6] mb-1">לוח {(board % BOARDS_PER_GAME) + 1} מתוך {BOARDS_PER_GAME} הושלם</p>
            <p className="text-xs text-[#8a8aa0] mb-3">
              {seconds + penalty} שניות{penalty > 0 ? ` (${penalty} קנס)` : ""}
            </p>
            <button
              onClick={() => {
                setStats((st) => ({ ...st, seconds: st.seconds + seconds + penalty }));
                // Summary after the last board of the set; otherwise deal a fresh grid.
                if ((board + 1) % BOARDS_PER_GAME === 0) setFinished(true);
                else startBoard(board + 1);
              }}
              className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold"
            >
              {(board + 1) % BOARDS_PER_GAME === 0 ? "לתוצאה" : "ללוח הבא"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
