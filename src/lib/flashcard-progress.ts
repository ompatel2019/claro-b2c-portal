import "server-only";
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
