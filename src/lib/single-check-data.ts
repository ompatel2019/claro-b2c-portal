import "server-only";
import { createClient } from "@/utils/supabase/server";
import { checksLeft, sydneyDayStart, type BankQuestion } from "./single-check";
import { questionColumns } from "./practice";

export async function bankQuestions(
  db: Awaited<ReturnType<typeof createClient>>,
) {
  // Reuse the SQL pool predicate, including the live-paper exclusion.
  const ids: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data: pool, error } = await db
      .rpc("sprint_questions", {
        p_config: { mode: "mixed", include_extended: true },
      })
      .neq("type", "mcq")
      .order("id")
      .range(from, from + 499);
    if (error) throw error;
    ids.push(...(pool as { id: string }[]).map((q) => q.id));
    if (pool.length < 500) break;
  }
  const rows: BankQuestion[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("questions")
      .select(`${questionColumns},verb`)
      .in("id", ids.slice(i, i + 200))
      .eq("status", "live");
    if (error) throw error;
    rows.push(...(data as BankQuestion[]));
  }
  return rows;
}
export async function remainingChecks(userId: string) {
  const db = await createClient();
  const { count, error } = await db
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "single")
    .gte("started_at", sydneyDayStart());
  if (error) throw error;
  return checksLeft(count ?? 0);
}
