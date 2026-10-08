import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "./auth";
import { createClient } from "@/utils/supabase/server";
import { questionColumns, type Attempt, type Session } from "./practice";
import type { FlashcardReview } from "./flashcards";
import type { HomeworkSet } from "./homework";
export const homeworkColumns = `*,topic:topics(name),items:homework_items(position,flashcard_id,question_id,card:flashcards(id,topic_id,kind,front,back),question:questions(${questionColumns}))`;
export type HomeworkSession = Session & {
  homework_set_id: string;
  attempts: Attempt[];
  reviews: FlashcardReview[];
};
export const loadHomeworkList = cache(async function loadHomeworkList() {
  const profile = await requireProfile();
  const db = await createClient();
  const [sets, sessions] = await Promise.all([
    db
      .from("homework_sets")
      .select(homeworkColumns)
      .lte("published_at", new Date().toISOString())
      .order("due_at")
      .throwOnError(),
    db
      .from("sessions")
      .select(
        `*,attempts(*,question:questions(${questionColumns})),reviews:flashcard_reviews(*)`,
      )
      .eq("user_id", profile.id)
      .eq("kind", "homework")
      .throwOnError(),
  ]);
  return {
    sets: (sets.data ?? []) as unknown as HomeworkSet[],
    sessions: (sessions.data ?? []) as unknown as HomeworkSession[],
  };
});
export async function loadHomework(id: string) {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/admin");
  const db = await createClient();
  const { data: set } = await db
    .from("homework_sets")
    .select(homeworkColumns)
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!set) notFound();
  const { data: session } = await db
    .from("sessions")
    .select(
      `*,attempts(*,question:questions(${questionColumns})),reviews:flashcard_reviews(*)`,
    )
    .eq("homework_set_id", id)
    .eq("user_id", profile.id)
    .maybeSingle()
    .throwOnError();
  const typed = set as unknown as HomeworkSet;
  typed.items = [...(typed.items ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const run = session
    ? ({
        ...(session as unknown as HomeworkSession),
        attempts: [...((session as HomeworkSession).attempts ?? [])].sort(
          (a, b) => a.position - b.position,
        ),
        reviews: [...((session as HomeworkSession).reviews ?? [])].sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        ),
      } satisfies HomeworkSession)
    : null;
  return { set: typed, session: run, profile };
}
