import { z } from "zod";
import { updateFlashcardProgress } from "@/lib/flashcard-progress";
import { matchFlashcardAnswer } from "@/lib/flashcards";
import { markFlashcard } from "@/lib/marking/engine";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
} from "@/lib/ai/rate-limit";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;
const Body = z.strictObject({
  answer: z.string().trim().min(1).max(2000),
  sessionId: z.uuid().nullable().optional(),
});

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
  const { answer, sessionId } = body.data;
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
    const db = admin();
    const { data: review } = await db
      .from("flashcard_reviews")
      .insert({
        flashcard_id: id,
        user_id: user.id,
        session_id: sessionId ?? null,
        answer,
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
    return Response.json({ ...result, back: card.back, local: Boolean(local) });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not mark flashcard" },
      { status: 500 },
    );
  }
}
