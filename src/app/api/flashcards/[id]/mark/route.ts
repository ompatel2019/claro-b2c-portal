import { z } from "zod";
import {
  updateFlashcardProgress,
  rescheduleFlashcardProgress,
} from "@/lib/flashcard-progress";
import { matchFlashcardAnswer } from "@/lib/flashcards";
import { markFlashcard } from "@/lib/marking/engine";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
} from "@/lib/ai/rate-limit";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;
const Mark = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const Body = z.union([
  z.strictObject({
    answer: z.string().trim().min(1).max(1000),
    answer_mode: z.enum(["typed", "spoken"]).default("typed"),
    sessionId: z.uuid().nullable().optional(),
  }),
  z.strictObject({
    sessionId: z.uuid(),
    override: z.strictObject({ reviewId: z.uuid(), mark: Mark }),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  const { id } = await params;
  const { data: card } = await supabase
    .from("flashcards")
    .select("kind, front, back")
    .eq("id", id)
    .maybeSingle();
  if (!card)
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  const { sessionId } = body.data;
  if (sessionId) {
    const { data: session } = await supabase
      .from("sessions")
      .select("finished_at,kind,config")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session)
      return Response.json(
        { error: "This session was reset or expired. Start the deck again." },
        { status: 404 },
      );
    if (session.finished_at)
      return Response.json(
        { error: "Session already finished" },
        { status: 409 },
      );
    if (
      session.kind !== "flashcards" ||
      session.config?.mode !== "test" ||
      !session.config.card_ids?.includes(id)
    )
      return Response.json(
        { error: "Card is not in this active session" },
        { status: 400 },
      );
  }
  try {
    const db = admin();
    if ("override" in body.data) {
      const { reviewId, mark } = body.data.override;
      const { data: review } = await db
        .from("flashcard_reviews")
        .update({
          mark,
          source: "self",
          reason: "Self-rated after checking the model answer.",
        })
        .eq("id", reviewId)
        .eq("user_id", user.id)
        .eq("session_id", sessionId!)
        .eq("flashcard_id", id)
        .select("id")
        .maybeSingle()
        .throwOnError();
      if (!review)
        return Response.json({ error: "Review not found" }, { status: 404 });
      await rescheduleFlashcardProgress(db, user.id, id);
      return Response.json({
        reviewId,
        mark,
        source: "self",
        reason: "Self-rated after checking the model answer.",
        back: card.back,
      });
    }
    const { answer, answer_mode } = body.data;
    const local = matchFlashcardAnswer(answer, card.back, card.front);
    let result = local;
    if (!result) {
      const limited = await assertStudentAiRateLimit({ userId: user.id });
      if (!limited.ok) return rateLimitedResponse(limited);
      result = await markFlashcard(
        { ...card, kind: card.kind as "term" | "stat" },
        answer,
        user.id,
      );
    }
    const { data: review } = await db
      .from("flashcard_reviews")
      .insert({
        flashcard_id: id,
        user_id: user.id,
        session_id: sessionId ?? null,
        answer,
        answer_mode,
        source: local ? "self" : "ai",
        ...result,
      })
      .select("id")
      .single()
      .throwOnError();
    if (sessionId)
      await updateFlashcardProgress(
        db,
        user.id,
        sessionId,
        id,
        review.id,
        result.mark,
      );
    return Response.json({
      ...result,
      reviewId: review.id,
      source: local ? "self" : "ai",
      back: card.back,
      local: Boolean(local),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not mark flashcard" },
      { status: 500 },
    );
  }
}
