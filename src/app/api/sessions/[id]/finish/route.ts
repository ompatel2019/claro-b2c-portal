import { stageOneComplete } from "@/lib/homework";
import { finishSession } from "@/lib/marking/engine";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const { data: session } = await supabase
    .from("sessions")
    .select("id, finished_at, kind, homework_set_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session)
    return Response.json({ error: "Session not found" }, { status: 404 });
  try {
    if (session.kind === "homework") {
      const [items, reviews] = await Promise.all([
        supabase
          .from("homework_items")
          .select("flashcard_id")
          .eq("set_id", session.homework_set_id)
          .throwOnError(),
        supabase
          .from("flashcard_reviews")
          .select("flashcard_id,mark,created_at")
          .eq("session_id", id)
          .eq("user_id", user.id)
          .order("created_at")
          .order("id")
          .throwOnError(),
      ]);
      const ids = (items.data ?? []).flatMap((i) =>
        i.flashcard_id ? [i.flashcard_id as string] : [],
      );
      if (!stageOneComplete(ids, reviews.data ?? []))
        return Response.json(
          {
            error:
              "Get every flashcard right before submitting your homework. Your progress is saved.",
          },
          { status: 409 },
        );
    }
    const finished = await finishSession(id);
    return Response.json({
      score: finished.score,
      max_score: finished.max_score,
      summary: finished.summary,
      finished: true,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not finish session. Your answers are still saved. Please try again.",
      },
      { status: 500 },
    );
  }
}
