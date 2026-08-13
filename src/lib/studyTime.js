import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

const db = supabase.schema("menu_app");

// Study time and the measurement points behind the owner's improvement chart.
//
// Counts only seconds where the tab is actually visible — a phone left on the counter
// with the app open is not studying, and counting it would make "time invested" a
// meaningless column. Flushes on a fixed budget of accumulated active time rather than on
// a wall clock, so a waiter who studies for four separate minutes gets four minutes
// recorded, whenever those minutes happened.
//
// Each flush writes two things: a row in progress_snapshots (the chart's points) and an
// increment to team_members.total_seconds (the running total). Failures are logged and
// swallowed — losing a measurement point must never interrupt someone mid-study.

const FLUSH_AFTER_SECONDS = 120;
// Below this, a "session" is someone glancing at the app; recording it would clutter the
// chart with points that carry no information.
const MIN_MEANINGFUL_SECONDS = 20;

export function useStudyTime({ session, getPct, ready, onSecond }) {
  const activeRef = useRef(0);      // seconds accumulated since the last flush
  const totalRef = useRef(0);       // seconds accumulated this mount, for total_seconds
  const flushingRef = useRef(false);
  const getPctRef = useRef(getPct);
  getPctRef.current = getPct;
  // The daily goal is measured in minutes, so the ring has to move while the waiter
  // studies — not only when a flush lands two minutes later.
  const onSecondRef = useRef(onSecond);
  onSecondRef.current = onSecond;

  const enabled = ready && !!session?.teamMemberId && !session?.offline;

  useEffect(() => {
    if (!enabled) return;

    const flush = async (force = false) => {
      const seconds = activeRef.current;
      if (flushingRef.current) return;
      if (seconds < (force ? MIN_MEANINGFUL_SECONDS : FLUSH_AFTER_SECONDS)) return;
      flushingRef.current = true;
      activeRef.current = 0;
      const pct = getPctRef.current?.() ?? 0;
      try {
        await db.from("progress_snapshots").insert({
          restaurant_id: session.restaurantId,
          team_member_id: session.teamMemberId,
          pct,
          seconds_delta: seconds,
        });
        // Read-then-write rather than an RPC: there is no real auth here, one waiter owns
        // one row, and a lost increment costs a couple of minutes on a "time invested"
        // figure — not worth a server function to make atomic.
        const { data } = await db.from("team_members")
          .select("total_seconds").eq("id", session.teamMemberId).maybeSingle();
        await db.from("team_members")
          .update({ total_seconds: (data?.total_seconds || 0) + seconds })
          .eq("id", session.teamMemberId);
      } catch (e) {
        console.error("study-time flush failed", e);
      } finally {
        flushingRef.current = false;
      }
    };

    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      activeRef.current += 1;
      totalRef.current += 1;
      onSecondRef.current?.();
      if (activeRef.current >= FLUSH_AFTER_SECONDS) void flush();
    }, 1000);

    // Leaving the tab is the most common way a study session ends, and it's the last
    // chance to record it.
    const onHide = () => { if (document.visibilityState === "hidden") void flush(true); };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onHide);
      void flush(true);
    };
  }, [enabled, session?.teamMemberId, session?.restaurantId]);
}
