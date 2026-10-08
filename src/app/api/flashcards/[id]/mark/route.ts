import { z } from "zod";
import { markFlashcard } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 120;
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
      .select("finished_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session)
      return Response.json({ error: "Session not found" }, { status: 404 });
    if (session.finished_at)
      return Response.json(
        { error: "Session already finished" },
        { status: 409 },
      );
  }
  try {
    const result = await markFlashcard(
      { ...card, kind: card.kind as "term" | "stat" },
      answer,
      user.id,
    );
    await admin()
      .from("flashcard_reviews")
      .insert({
        flashcard_id: id,
        user_id: user.id,
        session_id: sessionId ?? null,
        answer,
        source: "ai",
        ...result,
      })
      .throwOnError();
    return Response.json({ ...result, back: card.back });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not mark flashcard" },
      { status: 500 },
    );
  }
}
