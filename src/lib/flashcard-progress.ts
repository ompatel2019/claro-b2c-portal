import "server-only";
import { pages } from "./flashcard-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schedule, sydneyToday, type FlashcardMark } from "./flashcards";

// Read after insertion so only the first persisted review advances the schedule.
export async function updateFlashcardProgress(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
  cardId: string,
  reviewId: string,
  mark: FlashcardMark,
) {
  const { data: first } = await db
    .from("flashcard_reviews")
    .select("id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("flashcard_id", cardId)
    .order("created_at")
    .order("id")
    .limit(1)
    .maybeSingle()
    .throwOnError();
  if (first?.id !== reviewId) return;
  const { data: prev } = await db
    .from("flashcard_progress")
    .select("interval_days,reviews")
    .eq("user_id", userId)
    .eq("flashcard_id", cardId)
    .maybeSingle()
    .throwOnError();
  await db
    .from("flashcard_progress")
    .upsert(
      {
        user_id: userId,
        flashcard_id: cardId,
        ...schedule(prev, mark, sydneyToday()),
        last_mark: mark,
        reviews: (prev?.reviews ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_id" },
    )
    .throwOnError();
}

/** Replay first reviews so overriding never compounds the existing interval or count. */
export async function rescheduleFlashcardProgress(
  db: SupabaseClient,
  userId: string,
  cardId: string,
) {
  const history = await pages<{
    session_id: string;
    mark: FlashcardMark;
    created_at: string;
  }>((from, to) =>
    db
      .from("flashcard_reviews")
      .select("session_id,mark,created_at")
      .eq("user_id", userId)
      .eq("flashcard_id", cardId)
      .not("session_id", "is", null)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  const seen = new Set<string>();
  let progress: { interval_days: number; due_on: string } | null = null;
  let lastMark: FlashcardMark = 0;
  for (const review of history) {
    const key = review.session_id;
    if (seen.has(key)) continue;
    seen.add(key);
    lastMark = review.mark;
    progress = schedule(
      progress,
      lastMark,
      sydneyToday(new Date(review.created_at)),
    );
  }
  if (!progress) return;
  await db
    .from("flashcard_progress")
    .upsert(
      {
        user_id: userId,
        flashcard_id: cardId,
        ...progress,
        last_mark: lastMark,
        reviews: seen.size,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_id" },
    )
    .throwOnError();
}
