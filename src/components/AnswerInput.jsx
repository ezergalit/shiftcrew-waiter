import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { suggest } from "../lib/examSuggest";

// Typed answers with autocomplete, for the open quiz.
//
// The waiter writes what is in the dish instead of picking from a list. Two things make
// that workable on a phone under a clock:
//   · suggestions appear from the FIRST keystroke and are tappable — no exact spelling
//     needed, and an English keyboard finds Hebrew words ("sal" → סלמון);
//   · every accepted answer becomes a chip, so what has been said so far stays visible.
//
// ⚠️ The suggestion pool is the WHOLE restaurant's vocabulary, never this dish's own
// ingredients. Suggesting from the dish would print the answer on screen after one letter.
// See examSuggest.js — this is the single most important property of this component.
export default function AnswerInput({
  vocab,
  values,
  onChange,
  placeholder = "כתבו מרכיב ולחצו הוסף…",
  disabled = false,
  label,
}) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const hits = useMemo(
    () => (disabled ? [] : suggest(vocab, text, { limit: 6, exclude: values })),
    [vocab, text, values, disabled],
  );

  const add = (raw) => {
    const v = String(raw || "").trim();
    if (!v) return;
    // Case and spacing differ between what a waiter types and what the menu stores; the
    // grader normalises anyway, so only reject an exact repeat of what is already a chip.
    if (!values.some((x) => x.trim().toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-[11px] font-black text-[#8a8aa0]">{label}</p>}

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 bg-[#22252b] text-[#eef0f6] text-[13px] font-bold px-2.5 py-1.5 rounded-lg">
              {v}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  aria-label={`הסרת ${v}`}
                  className="text-[#8a8aa0] hover:text-[#ff8098] p-1 -m-1"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // ⚠️ Adds WHAT WAS TYPED, never the top suggestion. Substituting looks helpful
            // and quietly changes the answer: a waiter typing "מיונז" for a dish holding
            // "ספייסי מיונז" was given "מיונז יפני" — a different ingredient from elsewhere
            // on the menu — and graded on that. Suggestions are added by tapping them.
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            // Backspace on an empty box removes the last chip — the usual chip-input idiom,
            // and the only way to correct a mistake without aiming at a 12px ✕ under a clock.
            if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
          placeholder={placeholder}
          dir="rtl"
          /* 16px: Safari zooms the whole page on focus for anything smaller. */
          className="flex-1 min-w-0 bg-[#0c0d10] border border-[#22252b] rounded-lg px-3 py-2.5 text-[16px] text-[#eef0f6] placeholder:text-[#5a5a6e] focus:outline-none focus:border-[#22c08c]/60"
        />
        <button
          type="button"
          disabled={disabled || !text.trim()}
          onClick={() => add(text)}
          className="px-4 min-h-[44px] rounded-lg bg-[#22c08c] text-[#06231a] font-black text-[13px] disabled:opacity-30"
        >
          הוסף
        </button>
      </div>

      {hits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hits.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => add(h.label)}
              className="text-[13px] font-bold px-2.5 py-2 rounded-lg bg-[#16181c] border border-[#22252b] text-[#8a8aa0] hover:border-[#22c08c]/50 hover:text-[#eef0f6] transition"
            >
              {h.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
