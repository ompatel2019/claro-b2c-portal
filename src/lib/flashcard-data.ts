import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import type { Session, Topic } from "./practice";
import type { Flashcard, FlashcardConfig, FlashcardReview } from "./flashcards";
export type FlashcardSession = Omit<Session, "config"> & {
  kind: "flashcards";
  config: FlashcardConfig;
};
export async function loadFlashcards(id: string) {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/admin");
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
