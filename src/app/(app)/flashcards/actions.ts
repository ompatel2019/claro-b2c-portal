"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  shuffle,
  sydneyToday,
  type Flashcard,
  type FlashcardConfig,
} from "@/lib/flashcards";
import { updateFlashcardProgress } from "@/lib/flashcard-progress";
import type { FormState } from "../actions";

export async function startFlashcards(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/admin");
  const parsed = z
    .object({
      mode: z.enum(["study", "test"]),
      topic: z.string().regex(/^(t[1-4](-[a-z0-9-]+)?)?$/, "Choose a topic."),
      type: z.enum(["term", "stat", "both"]),
      due: z.boolean(),
      cardIds: z.array(z.string().min(1).max(200)).max(20),
    })
    .safeParse({
      mode: form.get("mode") ?? "study",
      topic: form.get("topic") ?? "",
      type: form.get("type") ?? "both",
      due: form.get("due") === "1",
      cardIds: form.getAll("card_ids"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { mode, topic, type, due, cardIds } = parsed.data;
  const kinds: FlashcardConfig["kinds"] =
    type === "both" ? ["term", "stat"] : [type];
  const db = await createClient();
  let cards: Flashcard[];
  if (due) {
    const result = await db
      .from("flashcard_progress")
      .select("card:flashcards!inner(id,topic_id,kind,front,back)")
      .eq("user_id", profile.id)
      .lte("due_on", sydneyToday());
    if (result.error)
      return { error: "Could not load your due cards. Please try again." };
    cards = (result.data ?? []).map((row) => row.card as unknown as Flashcard);
  } else {
    let query = db
      .from("flashcards")
      .select("id,topic_id,kind,front,back")
      .in("kind", kinds);
    if (cardIds.length) query = query.in("id", cardIds);
    else if (topic)
      query = topic.includes("-")
        ? query.eq("topic_id", topic)
        : query.like("topic_id", `${topic}-%`);
    const result = await query;
    if (result.error)
      return { error: "Could not load this deck. Please try again." };
    cards = (result.data ?? []) as Flashcard[];
  }
  cards = shuffle(cards).slice(0, 20);
  if (!cards.length)
    return {
      error: due
        ? "Nothing is due yet. Start a deck below."
        : "No cards match this selection. Try another deck or card type.",
    };
  const config: FlashcardConfig = {
    mode,
    topics: topic ? [topic] : [...new Set(cards.map((c) => c.topic_id))],
    kinds,
    due,
    card_ids: cards.map((c) => c.id),
  };
  const { data, error } = await db
    .from("sessions")
    .insert({ kind: "flashcards", config })
    .select("id")
    .single();
  if (error) return { error: "Could not start your deck. Please try again." };
  redirect(`/flashcards/${data.id}`);
}
export async function rateFlashcard(
  sessionId: string,
  cardId: string,
  mark: number,
) {
  const parsed = z
    .object({
      sessionId: z.uuid(),
      cardId: z.string().min(1).max(200),
      mark: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
    })
    .safeParse({ sessionId, cardId, mark });
  if (!parsed.success) throw new Error("Choose a valid card rating.");
  const profile = await requireProfile();
  if (profile.role !== "student") throw new Error("Student access required.");
  const db = await createClient();
  const { data: session } = await db
    .from("sessions")
    .select("finished_at,config,kind,homework_set_id")
    .eq("id", sessionId)
    .eq("user_id", profile.id)
    .in("kind", ["flashcards", "homework"])
    .maybeSingle()
    .throwOnError();
  let homeworkCard = false;
  if (session?.kind === "homework") {
    const { data: item } = await db
      .from("homework_items")
      .select("position")
      .eq("set_id", session.homework_set_id)
      .eq("flashcard_id", cardId)
      .maybeSingle()
      .throwOnError();
    homeworkCard = Boolean(item);
  }
  if (
    !session ||
    session.finished_at ||
    !(
      homeworkCard ||
      (session.kind === "flashcards" &&
        session.config.mode === "study" &&
        session.config.card_ids?.includes(cardId))
    )
  )
    throw new Error("This card is not available in an active study session.");
  const { data: review } = await db
    .from("flashcard_reviews")
    .insert({
      session_id: sessionId,
      flashcard_id: cardId,
      answer: null,
      mark: parsed.data.mark,
      source: "self",
    })
    .select("id")
    .single()
    .throwOnError();
  await updateFlashcardProgress(
    db,
    profile.id,
    sessionId,
    cardId,
    review.id,
    parsed.data.mark,
  );
}
export async function saveFlashcardTime(sessionId: string, elapsed: number) {
  if (
    !z.uuid().safeParse(sessionId).success ||
    !Number.isInteger(elapsed) ||
    elapsed < 0 ||
    elapsed > 31536000
  )
    throw new Error("Invalid session time.");
  const profile = await requireProfile();
  const db = await createClient();
  await db
    .from("sessions")
    .update({ elapsed_s: elapsed })
    .eq("id", sessionId)
    .eq("user_id", profile.id)
    .in("kind", ["flashcards", "homework"])
    .is("finished_at", null)
    .throwOnError();
}
