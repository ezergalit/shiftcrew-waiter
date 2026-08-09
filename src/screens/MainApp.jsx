import { useEffect, useState, useMemo } from "react";
import { GraduationCap, Trophy, BookOpen, Zap, Users, BarChart3, Home, LogOut, Check, X, Loader2 } from "lucide-react";
import { supabase } from "../lib/shiftcrew";

const db = supabase.schema("menu_app");
const ALLERGENS = ["גלוטן", "חלב", "ביצים", "אגוזים", "בוטנים", "דגים", "רכיכות", "סויה", "שומשום", "סולפיטים"];

function pubToCard(p) {
  const ing = (p.ingredients || []).filter(Boolean);
  return { id: p.source_item_id, name: p.name, price: Number(p.price), desc: p.description || "", ingredients: ing, allergens: (p.allergens || []).filter(Boolean), isSpecial: !!p.is_special };
}

const COLORS = ["#22c08c", "#ff7a59", "#e0315a", "#f3a712", "#3a86ff", "#6d5efc", "#9b7bff", "#1aa376"];
const colorFor = name => COLORS[String(name).charCodeAt(0) % COLORS.length];

export default function MainApp({ session, onSignOut }) {
  const [tab, setTab] = useState("home");
  const [cards, setCards] = useState(null);
  const [mastered, setMastered] = useState(new Set());
  const [leaderboard, setLeaderboard] = useState([]);
  const [brief, setBrief] = useState(null);
  const [mode, setMode] = useState(null); // flashcards | quiz | match | speed | battle

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await db.from("published_menu").select("*");
      if (alive) setCards((data || []).map(pubToCard));
      const { data: m } = await db.from("menu_progress").select("source_item_id, mastery").eq("team_member_id", session?.teamMemberId);
      if (alive) setMastered(new Set((m || []).filter(r => (r.mastery ?? 0) >= 4).map(r => r.source_item_id)));
      const { data: l } = await db.from("leaderboard").select("*").eq("restaurant_id", session?.restaurantId).order("points", { ascending: false });
      if (alive) setLeaderboard(l || []);
      const today = new Date().toISOString().slice(0, 10);
      const { data: b } = await db.from("daily_brief").select("*").eq("date", today).maybeSingle();
      if (alive) setBrief(b || {});
    })();
    return () => { alive = false; };
  }, [session]);

  const learnItem = (id) => {
    setMastered(p => {
      if (p.has(id)) return p;
      const n = new Set(p).add(id);
      db.from("menu_progress").upsert({ team_member_id: session.teamMemberId, source_item_id: id, mastery: 5, last_reviewed: new Date().toISOString() }, { onConflict: "team_member_id,source_item_id" });
      db.from("leaderboard").upsert({ restaurant_id: session.restaurantId, team_member_id: session.teamMemberId, name: session.name, points: n.size * 100, mastered_count: n.size, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,team_member_id" });
      return n;
    });
  };

  if (mode === "flashcards") return <Flashcards items={cards} mastered={mastered} onKnown={learnItem} onDone={() => setMode(null)} />;
  if (mode === "quiz") return <Quiz items={cards} mastered={mastered} onCorrect={learnItem} onDone={() => setMode(null)} />;
  if (mode === "match") return <Matching items={cards?.slice(0, 8)} mastered={mastered} onKnown={learnItem} onDone={() => setMode(null)} />;
  if (mode === "speed") return <Speed items={cards?.slice(0, 6)} mastered={mastered} onKnown={learnItem} onDone={() => setMode(null)} />;

  const pct = cards?.length ? Math.round((mastered.size / cards.length) * 100) : 0;
  const myRank = leaderboard.findIndex(r => r.team_member_id === session?.teamMemberId) + 1;
  const cats = ["starters", "mains", "desserts", "drinks"].map(c => ({ c, items: cards?.filter(x => x.category === c) || [] }));

  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      {/* Header */}
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onSignOut} className="w-8 h-8 rounded-lg bg-[#191b1f] flex items-center justify-center text-[#8a8aa0]"><LogOut size={16} /></button>
        <p className="text-sm font-black">{session?.name}</p>
        {myRank > 0 && <span className="text-[11px] font-bold text-[#f3c14b] bg-[#33290f] px-2 py-1 rounded-md">מקום {myRank}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "home" && (
          <div className="space-y-3">
            <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(135deg,#6d5efc,#9b7bff)" }}>
              <p className="text-sm font-black mb-2">תרגול יומי</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMode("flashcards")} className="bg-[#16181c] text-[#6d5efc] font-bold text-xs py-2.5 rounded-lg">כרטיסיות</button>
                <button onClick={() => setMode("quiz")} className="bg-white/20 text-white font-bold text-xs py-2.5 rounded-lg">חידון</button>
                <button onClick={() => setMode("match")} className="bg-white/20 text-white font-bold text-xs py-2.5 rounded-lg">התאמה</button>
                <button onClick={() => setMode("speed")} className="bg-white/20 text-white font-bold text-xs py-2.5 rounded-lg">מהירות</button>
              </div>
            </div>
            <div className="bg-[#16181c] rounded-lg p-3">
              <p className="text-xs font-bold text-[#8a8aa0] mb-2">התקדמות</p>
              <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden mb-2">
                <div className="h-full bg-[#6d5efc]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-[#8a8aa0]">{mastered.size}/{cards?.length || 0} פריטים — {pct}%</p>
            </div>
            {brief?.missing_items?.length > 0 && (
              <div className="bg-[#33290f] border border-[#664400] rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-[#f3c14b] mb-1">❌ חסרים היום</p>
                <p className="text-xs text-[#f3c14b]">{brief.missing_items.join(", ")}</p>
              </div>
            )}
            {brief?.new_items?.length > 0 && (
              <div className="bg-[#15302b] border border-[#0d8066] rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-[#22c08c] mb-1">⭐ חדש היום</p>
                <p className="text-xs text-[#22c08c]">{brief.new_items.join(", ")}</p>
              </div>
            )}
          </div>
        )}
        {tab === "daily" && (
          <div className="bg-[#16181c] rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-[#8a8aa0] mb-2">עדכון המנהל</p>
            {brief?.missing_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#f3c14b]">❌ חסרים:</span><p className="text-xs text-[#f3c14b] mt-0.5">{brief.missing_items.join(", ")}</p></div>}
            {brief?.new_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#22c08c]">⭐ חדש:</span><p className="text-xs text-[#22c08c] mt-0.5">{brief.new_items.join(", ")}</p></div>}
            {brief?.oven_items?.length > 0 && <div><span className="text-[10px] font-bold text-[#6d5efc]">📦 מעלה:</span><p className="text-xs text-[#6d5efc] mt-0.5">{brief.oven_items.join(", ")}</p></div>}
            {brief?.notes && <div><span className="text-[10px] font-bold text-[#8a8aa0]">הערה:</span><p className="text-xs text-[#8a8aa0] mt-0.5">{brief.notes}</p></div>}
          </div>
        )}
        {tab === "leaderboard" && (
          <div className="bg-[#16181c] rounded-lg overflow-hidden">
            {leaderboard.slice(0, 10).map((r, i) => (
              <div key={r.team_member_id} className={`flex items-center gap-2 px-3 py-2 ${i > 0 ? "border-t border-[#22252b]" : ""}`}>
                <span className="text-xs font-black w-5" style={{ color: ["#f3c14b", "#c7ccd6", "#cd8b5b"][i] || "#8a8aa0" }}>{i + 1}</span>
                <span className="w-6 h-6 rounded-full text-[9px] font-black flex items-center justify-center text-white flex-shrink-0" style={{ background: colorFor(r.name) }}>{r.name[0]}</span>
                <div className="flex-1">
                  <p className={`text-xs font-bold ${r.team_member_id === session?.teamMemberId ? "text-[#6d5efc]" : "text-[#eef0f6]"}`}>{r.name}</p>
                  <p className="text-[10px] text-[#8a8aa0]">{r.mastered_count} נלמדו</p>
                </div>
                <p className="text-xs font-black text-[#6d5efc]">{r.points}</p>
              </div>
            ))}
          </div>
        )}
        {tab === "categories" && (
          <div className="space-y-2">
            {cats.map(({ c, items }) => {
              const known = items.filter(x => mastered.has(x.id)).length;
              const pct = items.length ? Math.round((known / items.length) * 100) : 0;
              const names = { starters: "ראשונות", mains: "עיקריות", desserts: "קינוחים", drinks: "קוקטיילים" };
              return (
                <div key={c} className="bg-[#16181c] rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-black text-[#eef0f6]">{names[c]}</p>
                    <span className="text-[11px] font-bold text-[#6d5efc]">{known}/{items.length}</span>
                  </div>
                  <div className="h-1.5 bg-[#22252b] rounded-full overflow-hidden">
                    <div className="h-full bg-[#6d5efc]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="flex gap-0 bg-[#16181c] border-t border-[#22252b] flex-shrink-0">
        {[["home", Home], ["daily", BookOpen], ["leaderboard", Trophy], ["categories", BarChart3]].map(([t, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center py-2.5 ${tab === t ? "bg-[#6d5efc] text-white" : "text-[#8a8aa0]"}`}>
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Flashcards({ items, mastered, onKnown, onDone }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!items?.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (i >= items.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">סיימת!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = items[i];
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{items.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="bg-[#16181c] rounded-xl p-6 w-full text-center space-y-3">
          <p className="text-2xl font-black text-[#eef0f6]">{it.name}</p>
          <p className="text-base font-bold text-[#ea7317]">₪{it.price}</p>
          {!revealed && <button onClick={() => setRevealed(true)} className="w-full py-2.5 rounded-lg font-bold bg-[#6d5efc] text-white text-xs">חשוף</button>}
          {revealed && (
            <>
              {it.desc && <p className="text-xs text-[#c4c4d4]">{it.desc}</p>}
              {it.allergens?.length > 0 && <div className="bg-[#3a1d22] p-2 rounded-lg"><p className="text-[10px] font-bold text-[#e0315a]">אלרגנים: {it.allergens.join(", ")}</p></div>}
              <div className="flex gap-2">
                <button onClick={() => { onKnown(it.id); setRevealed(false); setI(i + 1); }} className="flex-1 py-2 rounded-lg font-bold text-xs bg-[#22c08c] text-white">ידעתי ✓</button>
                <button onClick={() => { setRevealed(false); setI(i + 1); }} className="flex-1 py-2 rounded-lg font-bold text-xs bg-[#22252b] text-[#c4c4d4]">בחזרה</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Quiz({ items, mastered, onCorrect, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const qs = useMemo(() => (items || []).slice(0, 6).map(it => ({ q: `מה המחיר של ${it.name}?`, a: `₪${it.price}`, opts: shuffle([`₪${it.price}`, `₪${it.price + 10}`, `₪${Math.max(5, it.price - 5)}`]), it })), [items]);
  if (!qs.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (i >= qs.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4"><Trophy size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{score}/{qs.length}</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const q = qs[i];
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">{i + 1}/{qs.length}</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        <div className="bg-[#16181c] rounded-lg p-3 mb-3"><p className="text-sm font-black text-[#eef0f6]">{q.q}</p></div>
        <div className="space-y-2">
          {q.opts.map((opt, j) => <button key={j} onClick={() => { if (opt === q.a) { setScore(s => s + 1); onCorrect(q.it.id); } setI(i + 1); }} className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs text-right ${opt === q.a ? "bg-[#22c08c] text-white" : "bg-[#16181c] text-[#c4c4d4]"}`}>{opt}</button>)}
        </div>
      </div>
    </div>
  );
}

function Matching({ items, mastered, onKnown, onDone }) {
  const [pairs, setPairs] = useState(items?.map(x => ({ id: x.id, name: x.name, price: `₪${x.price}`, flipped: false, matched: false })) || []);
  const [sel, setSel] = useState([]);
  const done = pairs.every(p => p.matched);
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><button onClick={onDone} className="text-xs text-[#8a8aa0]">← חזרה</button><p className="text-xs font-bold">התאמה</p></div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          {pairs.map(p => (
            <button key={p.id} onClick={() => { if (!p.matched && !sel.find(s => s.id === p.id)) { const newSel = [...sel, p]; setSel(newSel); if (newSel.length === 2) { if ((newSel[0].name === newSel[1].price) || (newSel[0].price === newSel[1].name)) { setPairs(pairs.map(x => x.id === newSel[0].id || x.id === newSel[1].id ? { ...x, matched: true } : x)); onKnown(newSel[0].id); } setTimeout(() => setSel([]), 500); } } }}
              className={`py-6 px-2 rounded-lg font-bold text-center text-xs transition-all ${sel.find(s => s.id === p.id) ? "bg-[#6d5efc] text-white" : p.matched ? "bg-[#22c08c] text-white" : "bg-[#16181c] text-[#eef0f6]"}`}>
              {sel.find(s => s.id === p.id) ? (p.name.length > 10 ? p.name.slice(0, 8) + "..." : p.name) : p.matched ? "✓" : p.name.slice(0, 6)}
            </button>
          ))}
        </div>
        {done && <div className="text-center mt-4"><Trophy size={32} className="text-[#f3c14b] mx-auto mb-2" /><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white text-xs font-bold">סיום</button></div>}
      </div>
    </div>
  );
}

function Speed({ items, mastered, onKnown, onDone }) {
  const [i, setI] = useState(0);
  const [time, setTime] = useState(30);
  useEffect(() => { if (time === 0) return onDone(); const t = setInterval(() => setTime(x => x - 1), 1000); return () => clearInterval(t); }, [time, onDone]);
  if (!items?.length) return <div className="h-screen flex items-center justify-center"><p>אין פריטים</p></div>;
  if (time === 0 || i >= items.length) return <div className="h-screen flex flex-col items-center justify-center px-8 text-center gap-4"><Zap size={40} className="text-[#f3c14b]" /><p className="font-black text-lg">{i} נכונים!</p><button onClick={onDone} className="px-4 py-2 rounded-lg bg-[#6d5efc] text-white">חזור</button></div>;
  const it = items[i];
  return (
    <div className="h-screen max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="bg-[#16181c] border-b border-[#22252b] px-4 py-2.5 flex items-center justify-between flex-shrink-0"><span className="text-xs font-bold text-[#f3c14b]">⏱ {time}s</span><p className="text-xs font-bold">{i + 1}/{items.length}</p></div>
      <div className="flex-1 flex flex-col items-center justify-center px-4"><div className="text-center"><p className="text-lg font-black mb-4">{it.name}</p><div className="grid grid-cols-2 gap-2"><button onClick={() => { onKnown(it.id); setI(i + 1); }} className="px-4 py-3 rounded-lg bg-[#22c08c] text-white font-bold text-xs">ידעתי</button><button onClick={() => setI(i + 1)} className="px-4 py-3 rounded-lg bg-[#22252b] text-[#c4c4d4] font-bold text-xs">לא יודע</button></div></div></div>
    </div>
  );
}

const shuffle = a => [...a].sort(() => Math.random() - 0.5);
