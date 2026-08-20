import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// A personal note the manager wrote to THIS waiter (owner app, ✉ next to the name in
// "מי למד היום"). It is not a system notification, so it reads as a message: who it is
// from, what they wrote, and an acknowledgement — not a badge to dismiss.
//
// The RLS policy already narrows `team_messages` to `session_member()`, so a waiter can
// only ever read their own. The extra `team_member_id` filter here costs nothing and
// keeps the intent visible at the call site.
export default function ManagerMessages({ session }) {
  const [msgs, setMsgs] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (session?.offline || !session?.teamMemberId) return;
      const { data, error } = await db
        .from("team_messages")
        .select("id, body, created_at")
        .eq("team_member_id", session.teamMemberId)
        .is("read_at", null)
        .order("created_at", { ascending: false });
      if (error) console.error("team_messages", error.message, error.details, error.hint, error.code);
      if (alive) setMsgs(data || []);
    })();
    return () => { alive = false; };
  }, [session]);

  // Acknowledging is a write the manager sees — it must not be optimistic-only, or we
  // repeat the checklist bug where a green tick never reached the server.
  const ack = async (id) => {
    const { error } = await db.from("team_messages").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("team_messages ack", error.message, error.details, error.hint, error.code);
      return;
    }
    setMsgs((prev) => prev.filter((m) => m.id !== id));
  };

  if (!msgs.length) return null;

  return (
    <div className="space-y-2">
      {msgs.map((m) => (
        <div key={m.id} className="bg-[#16181c] border border-[#8b5cf6] rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#8b5cf6]/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={14} className="text-[#a78bfa]" />
            </span>
            <p className="text-xs font-black text-[#a78bfa]">הודעה אישית מההנהלה</p>
          </div>
          <p className="text-[13px] text-[#eef0f6] leading-relaxed whitespace-pre-line font-semibold">{m.body}</p>
          <button
            onClick={() => ack(m.id)}
            className="w-full py-2.5 min-h-[44px] rounded-xl font-black text-xs bg-[#8b5cf6] text-white"
          >
            קראתי ✓
          </button>
        </div>
      ))}
    </div>
  );
}
