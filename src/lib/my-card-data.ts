import "server-only";
import type { createClient } from "@/utils/supabase/server";
import type { CardInput } from "./card-import";
import { pages } from "./flashcard-data";
import { sydneyToday } from "./flashcards";
export type MyCardRow = CardInput & {
  id: string;
  updated_at: string;
  seen: number;
  percent: number | null;
  due: string | null;
};
type Db = Awaited<ReturnType<typeof createClient>>;
type Raw = Omit<MyCardRow, "seen" | "due" | "percent"> & {
  flashcard_progress: { due_on: string; reviews: number }[];
};
export const PAGE_SIZE = 50;
/** Own live cards with own progress embedded; filters come straight from the URL. */
export function myCardQuery(
  db: Db,
  userId: string,
  params: Record<string, string>,
  head = false,
) {
  const progress = params.progress;
  const join = ["due", "known", "learning"].includes(progress) ? "!inner" : "";
  let query = db
    .from("flashcards")
    .select(
      `id,front,back,topic_id,kind,updated_at,flashcard_progress${join}(due_on,reviews)`,
      { count: "exact", head },
    )
    .eq("owner_id", userId)
    .eq("status", "live")
    .eq("flashcard_progress.user_id", userId);
  if (params.q) {
    // Quote the PostgREST value and escape LIKE wildcards for a literal substring.
    const value = JSON.stringify(`%${params.q.replace(/[\\%_]/g, "\\$&")}%`);
    query = query.or(`front.ilike.${value},back.ilike.${value}`);
  }
  if (params.topic) query = query.eq("topic_id", params.topic);
  if (params.kind) query = query.eq("kind", params.kind);
  if (progress === "new") query = query.is("flashcard_progress", null);
  if (progress === "due")
    query = query.lte("flashcard_progress.due_on", sydneyToday());
  if (progress === "known" || progress === "learning") {
    query = query.gt("flashcard_progress.due_on", sydneyToday());
    query =
      progress === "known"
        ? query.eq("flashcard_progress.last_mark", 1)
        : query.lt("flashcard_progress.last_mark", 1);
  }
  return query;
}
/** One page, newest first, with Seen and the mean of each session's first rating. */
export async function loadMyCards(
  db: Db,
  userId: string,
  params: Record<string, string>,
) {
  const { count } = await myCardQuery(db, userId, params, true).throwOnError();
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number(params.page) || 1));
  const { data } = await myCardQuery(db, userId, params)
    .order("updated_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .overrideTypes<Raw[], { merge: false }>()
    .throwOnError();
  const reviews = data.length
    ? await pages<{ flashcard_id: string; session_id: string; mark: number }>(
        (from, to) =>
          db
            .from("flashcard_reviews")
            .select("flashcard_id,session_id,mark")
            .eq("user_id", userId)
            .in(
              "flashcard_id",
              data.map((c) => c.id),
            )
            .order("created_at")
            .order("id")
            .range(from, to),
      )
    : [];
  const first = new Map<string, Map<string, number>>();
  for (const r of reviews) {
    const sessions = first.get(r.flashcard_id) ?? new Map<string, number>();
    if (!sessions.has(r.session_id)) sessions.set(r.session_id, Number(r.mark));
    first.set(r.flashcard_id, sessions);
  }
  const rows: MyCardRow[] = data.map(({ flashcard_progress, ...card }) => {
    const marks = [...(first.get(card.id)?.values() ?? [])];
    return {
      ...card,
      seen: flashcard_progress[0]?.reviews ?? 0,
      due: flashcard_progress[0]?.due_on ?? null,
      percent: marks.length
        ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100)
        : null,
    };
  });
  return { rows, page, pageCount };
}
