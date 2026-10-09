import { createClient } from "@/utils/supabase/server";

import { finishSession } from "@/lib/marking/engine";

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
    .select("kind,config,started_at,finished_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session || !["sprint", "flashcards", "single"].includes(session.kind))
    return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.kind === "single")
    return Response.json(
      { error: "Submit this check from Mark my answer." },
      { status: 409 },
    );
  try {
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
