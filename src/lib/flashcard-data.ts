import "server-only";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import type { Session, Topic } from "./practice";
import type {
  Flashcard,
  FlashcardConfig,
  FlashcardReview,
  FlashcardProgress,
} from "./flashcards";
import type { DeckCard } from "./deck";
export type FlashcardSession = Omit<Session, "config"> & {
  kind: "flashcards";
  config: FlashcardConfig;
};
export async function loadFlashcards(id: string) {
  const profile = await requireProfile();
  const db = await createClient();
  const { data: session } = await db
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", profile.id)
    .eq("kind", "flashcards")
    .maybeSingle()
    .throwOnError();
  if (!session) notFound();
  const typed = session as FlashcardSession;
  const [cards, reviews, topics] = await Promise.all([
    db
      .from("flashcards")
      .select("id,topic_id,kind,front,back")
      .in("id", typed.config.card_ids)
      .throwOnError(),
    db
      .from("flashcard_reviews")
      .select("*")
      .eq("session_id", id)
      .eq("user_id", profile.id)
      .order("created_at")
      .order("id")
      .throwOnError(),
    db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort")
      .throwOnError(),
  ]);
  return {
    session: typed,
    cards: (cards.data ?? []) as Flashcard[],
    reviews: (reviews.data ?? []) as FlashcardReview[],
    topics: (topics.data ?? []) as Topic[],
    profile,
  };
}

export async function pages<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await query(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

/** Load every authorised row, including collections beyond the Data API row limit. */
export async function loadDeckBank(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const [cards, progress] = await Promise.all([
    pages<DeckCard>((from, to) =>
      db
        .from("flashcards")
        .select("id,topic_id,kind,owner_id")
        .eq("status", "live")
        .or(`owner_id.is.null,owner_id.eq.${userId}`)
        .order("id")
        .range(from, to),
    ),
    pages<FlashcardProgress>((from, to) =>
      db
        .from("flashcard_progress")
        .select(
          "flashcard_id,interval_days,due_on,last_mark,reviews,updated_at",
        )
        .eq("user_id", userId)
        .order("flashcard_id")
        .range(from, to),
    ),
  ]);
  return { cards, progress };
}
