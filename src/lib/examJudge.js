// Tier 2 of the grader: the cheap-model judge, and the cache that makes it decay.
//
// The engine settles ~91% of answers on its own and escalates only when an answer carries
// FOREIGN substance — words this restaurant's menu has never used. That is the signature
// of a synonym ("לימון יפני" for יוזו) or a transliteration ("teriyaki"), which a string
// matcher cannot decide and a small model can.
//
// ⚠️ The point of `exam_alt` is that this cost falls to zero. The first waiter who calls
// yuzu "לימון יפני" pays one call; the phrasing is written down, and every waiter after
// them is graded on it for free. Without the cache every sitting pays again.
import { supabase } from "./supabase";
import { norm } from "./examEngine";
import { getSessionToken } from "./appSession";

const db = supabase.schema("menu_app");

/** Phrasings this restaurant has already had accepted. → Map<target, string[]> */
export async function loadLearnedAlts(restaurantId) {
  if (!restaurantId) return new Map();
  const { data, error } = await db.from("exam_alt").select("target, phrase").eq("restaurant_id", restaurantId);
  if (error || !data) return new Map();
  const m = new Map();
  for (const r of data) {
    const list = m.get(r.target) || [];
    list.push(r.phrase);
    m.set(r.target, list);
  }
  return m;
}

/** Fold the learned phrasings into a question's targets so tier 1 can match them itself. */
export function withLearnedAlts(q, altMap) {
  if (!altMap?.size || !q?.targets) return q;
  return {
    ...q,
    targets: q.targets.map((t) => {
      const extra = altMap.get(t.t);
      return extra?.length ? { ...t, alt: [...(t.alt || []), ...extra] } : t;
    }),
  };
}

/**
 * Ask the judge whether anything the waiter wrote means one of the expected items.
 * Returns [{said, means}] — always safe to ignore; a failure just leaves tier 1's verdict.
 */
export async function judgeAnswer({ ask, expected, said }) {
  try {
    const { data, error } = await supabase.functions.invoke("exam-judge", {
      body: { token: getSessionToken(), ask, expected, said },
    });
    if (error || !data?.credited) return [];
    return data.credited;
  } catch {
    return [];
  }
}

/** Write accepted phrasings down so the next waiter is graded on them for free. */
export async function saveLearnedAlts(restaurantId, credited) {
  if (!restaurantId) return;
  // ⚠️ Never cache a word as an alias for itself. Sending the whole answer to the judge
  // means it also maps the chips tier 1 already matched onto themselves ("טמפורה" means
  // "טמפורה"), and those rows are pure noise: they teach the grader nothing and grow the
  // table forever. Observed on the first live run.
  const useful = (credited || []).filter((c) => norm(c.means) !== norm(c.said));
  if (!useful.length) return;
  const rows = useful.map((c) => ({ restaurant_id: restaurantId, target: c.means, phrase: c.said }));
  // Ignore conflicts: two waiters hitting the same phrasing at once is normal, not an error.
  await db.from("exam_alt").upsert(rows, { onConflict: "restaurant_id,target,phrase", ignoreDuplicates: true });
}
