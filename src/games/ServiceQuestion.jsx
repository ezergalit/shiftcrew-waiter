import { useState, useEffect, useRef } from "react";
import { gz } from "../lib/shiftChoice";
import { secondsFor } from "../lib/serviceExam";

// One service question on screen, in all three answer shapes.
//
// ⚠️ Shared by בוחן השירות and by the final exam ON PURPOSE. The two screens graded the same
// question differently the moment they each had their own copy — and a question that scores
// one way in practice and another in the exam teaches the waiter that the app is arbitrary.
//
// The clock is PER QUESTION and does not roll over. Running out is scored as wrong, not as a
// skip: someone who cannot answer inside twenty-five seconds cannot answer at a table.

// Both vocabularies live here: the service kinds from serviceBank.js and the menu kinds
// from serviceScenarios.js. The final exam mixes them, so a renderer that knows only one
// side labels half its questions "שאלה".
const KIND_TAG = {
  // service
  first: "מה קודם?", choice: "מצב בשירות", multi: "בחירה מרובה",
  order: "סדר את השלבים", house: "אצלנו בבית",
  // menu (serviceScenarios.js)
  compose: "הרכבת מנה", allergenset: "אלרגיות במנה", pregnancy: "אורחת בהריון",
  allergy: "אלרגיה", pitfall: "העדפת אורח", price: "מחיר",
  menugroup: "איפה בתפריט", describe: "אורח מתאר מנה",
};

export default function ServiceQuestion({ q, onGraded, onNext, index, total, sectionTitle }) {
  const budget = secondsFor(q);
  const [left, setLeft] = useState(budget);
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);
  const gradedRef = useRef(false);

  // Reset for each question. `q` identity is the signal — the parent hands us a new object.
  useEffect(() => {
    gradedRef.current = false;
    setLeft(budget); setPicked([]); setResult(null);
  }, [q, budget]);

  // The clock stops the moment an answer is in: reading the explanation must not cost time.
  useEffect(() => {
    if (result) return;
    if (left <= 0) { grade(null); return; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, result]);

  function grade(answer) {
    if (gradedRef.current) return;
    gradedRef.current = true;
    let ok = false;
    if (answer === null) ok = false;                       // ran out of time
    else if (q.correctOrder) ok = answer.join("|") === q.correctOrder.join("|");
    else {
      const need = new Set(q.options.filter((o) => o.correct).map((o) => o.id));
      // An exact set. Partial credit would let "select everything" pass a multi-select.
      ok = answer.length === need.size && answer.every((id) => need.has(id));
    }
    setResult({ ok, timedOut: answer === null });
    onGraded?.(ok);
  }

  const isMulti = !!q.multi;
  const isOrder = !!q.correctOrder;
  const need = isOrder ? q.correctOrder.length : q.options.filter((o) => o.correct).length;

  const toggle = (id) => {
    if (result) return;
    if (isOrder || isMulti) setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    else { setPicked([id]); grade([id]); }
  };

  // Chips only when every label is short and none of them carries an explanation to show.
  const compact = !isOrder && q.options.every((o) => (o.label || "").length <= 20 && !o.why);

  const urgent = left <= 5;
  const optClass = (o) => {
    const sel = picked.includes(o.id);
    if (!result) return sel ? "bg-[#22c08c] text-[#06251c] border-[#22c08c]" : "bg-[#16181c] text-[#eef0f6] border-[#22252b]";
    if (o.correct) return "bg-[#15302b] text-[#22c08c] border-[#22c08c]";
    if (sel) return "bg-[#3a1d22] text-[#e0315a] border-[#e0315a]";
    return "bg-[#16181c] text-[#4a4a5a] border-[#22252b]";
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {/* Clock and position. The bar is the clock — a number alone is easy to ignore mid-read. */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-[#22252b] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${(left / budget) * 100}%`, background: urgent ? "#e0315a" : "#22c08c" }}
          />
        </div>
        <span className={`text-[12px] font-black tabular-nums ${urgent ? "text-[#e0315a]" : "text-[#8a8aa0]"}`}>{left}s</span>
        <span className="text-[11px] font-bold text-[#8a8aa0]">{index + 1}/{total}</span>
      </div>

      <div className="bg-[#16181c] rounded-2xl p-4 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-black text-[#a79bff] bg-[#6d5efc]/15 rounded px-2 py-0.5">
            {KIND_TAG[q.kind] || "שאלה"}
          </span>
          {sectionTitle && <span className="text-[10px] font-bold text-[#8a8aa0]">{sectionTitle}</span>}
        </div>
        <p className="text-[15px] font-black leading-snug">{gz(q.prompt)}</p>
        {/* A house rule is said out loud as a house rule, so nobody learns it as a law of
            hospitality that applies at their next job. */}
        {q.note && <p className="text-[11px] text-[#f3c14b] leading-snug">{gz(q.note)}</p>}
      </div>

      {isOrder ? (
        <OrderPad q={q} picked={picked} setPicked={setPicked} result={result} onSubmit={() => grade(picked)} />
      ) : (
        /* ⚠️ Short labels wrap as chips, the way MenuExam already renders them. An
           ingredient list is often a dozen options, and twelve full-width rows is more than
           a phone screen — the waiter scrolls to find what they are choosing between while
           the clock runs. Dish names stay as rows: they are long, and they carry the
           per-option explanation after the answer. */
        <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-col gap-2"}>
          {q.options.map((o) => (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              disabled={!!result}
              className={compact
                ? `rounded-lg border px-3 py-2 min-h-[40px] font-bold text-[12px] leading-snug transition-colors ${optClass(o)}`
                : `w-full text-right rounded-xl border px-3.5 py-3 min-h-[44px] font-bold text-[13px] leading-snug transition-colors ${optClass(o)}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {isMulti && !result && (
        <>
          <button
            onClick={() => grade(picked)}
            disabled={!picked.length}
            className={`w-full py-3.5 min-h-[44px] rounded-2xl font-black text-sm ${picked.length ? "bg-[#22c08c] text-[#06251c]" : "bg-[#22252b] text-[#b4b4c4]"}`}
          >
            שליחה
          </button>
          {/* "נבחרו 1" is wrong in Hebrew and this line sits under every multi question. */}
          <p className="text-[11px] text-[#8a8aa0] text-center">
            {picked.length === 1 ? "נבחר 1" : `נבחרו ${picked.length}`} מתוך {need}
          </p>
        </>
      )}

      {result && (
        <div className="space-y-2.5">
          <div className={`rounded-xl p-3 ${result.ok ? "bg-[#15302b] border border-[#22c08c]/40" : "bg-[#3a1d22] border border-[#e0315a]/40"}`}>
            <p className={`text-sm font-black ${result.ok ? "text-[#22c08c]" : "text-[#e0315a]"}`}>
              {result.ok ? "✓ נכון" : result.timedOut ? "✗ נגמר הזמן" : "✗ לא נכון"}
            </p>
            {!result.ok && (
              <p className="text-[12px] text-[#eef0f6] mt-1 leading-relaxed">
                {isOrder
                  ? `הסדר הנכון: ${q.correctOrder.map((k) => q.shuffled.find((x) => x.key === k)?.label).join(" ← ")}`
                  : `התשובה: ${q.options.filter((o) => o.correct).map((o) => o.label).join(" · ")}`}
              </p>
            )}
          </div>
          {/* Every question explains itself, right or wrong. Without this a waiter memorises
              a position on the screen instead of a rule for the floor. */}
          {q.why && (
            <div className="rounded-xl bg-[#16181c] border border-[#22252b] p-3">
              <p className="text-[12px] text-[#c4c4d4] leading-relaxed">{gz(q.why)}</p>
            </div>
          )}
          <button onClick={onNext} className="w-full py-3.5 min-h-[44px] rounded-2xl font-black text-sm bg-[#22c08c] text-[#06251c]">
            {index + 1 >= total ? "לתוצאה" : "לשאלה הבאה"}
          </button>
        </div>
      )}
    </div>
  );
}

// Ordering: tap the steps in order. Tapping a chosen step removes it and everything after
// it — pulling one card out of the middle of a sequence is not something the waiter meant.
function OrderPad({ q, picked, setPicked, result, onSubmit }) {
  const byKey = Object.fromEntries(q.shuffled.map((s) => [s.key, s.label]));
  const remaining = q.shuffled.filter((s) => !picked.includes(s.key));
  const full = picked.length === q.correctOrder.length;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {picked.map((k, i) => {
          const right = result && q.correctOrder[i] === k;
          const tone = !result ? "bg-[#22c08c]/15 border-[#22c08c]/50 text-[#eef0f6]"
            : right ? "bg-[#15302b] border-[#22c08c] text-[#22c08c]"
            : "bg-[#3a1d22] border-[#e0315a] text-[#e0315a]";
          return (
            <button
              key={k}
              disabled={!!result}
              onClick={() => setPicked((p) => p.slice(0, i))}
              className={`w-full text-right rounded-xl border px-3 py-2.5 min-h-[44px] flex items-center gap-2.5 ${tone}`}
            >
              <span className="w-6 h-6 rounded-full bg-black/25 flex items-center justify-center text-[11px] font-black flex-shrink-0">{i + 1}</span>
              <span className="flex-1 text-[13px] font-bold leading-snug">{byKey[k]}</span>
            </button>
          );
        })}
        {!result && Array.from({ length: q.correctOrder.length - picked.length }).map((_, i) => (
          <div key={`slot${i}`} className="w-full rounded-xl border border-dashed border-[#2c2f36] px-3 py-2.5 min-h-[44px] flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-[#22252b] flex items-center justify-center text-[11px] font-black text-[#8a8aa0] flex-shrink-0">
              {picked.length + i + 1}
            </span>
            <span className="text-[12px] text-[#4a4a5a]">—</span>
          </div>
        ))}
      </div>

      {!result && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {remaining.map((s) => (
              <button
                key={s.key}
                onClick={() => setPicked((p) => [...p, s.key])}
                data-order-chip="1"
                className="rounded-lg border border-[#22252b] bg-[#16181c] px-3 py-2 min-h-[40px] text-[12px] font-bold leading-snug"
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={onSubmit}
            disabled={!full}
            className={`w-full py-3.5 min-h-[44px] rounded-2xl font-black text-sm ${full ? "bg-[#22c08c] text-[#06251c]" : "bg-[#22252b] text-[#b4b4c4]"}`}
          >
            שליחה
          </button>
        </>
      )}
    </div>
  );
}
