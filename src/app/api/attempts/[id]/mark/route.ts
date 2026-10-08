import { AlreadyMarking, markAttempt } from "@/lib/marking/engine";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 240;

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
  const { data: attempt } = await supabase
    .from("attempts")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  try {
    const { mark, max_marks, band, feedback, status } = await markAttempt(id);
    return Response.json({
      mark,
      max_marks,
      band,
      feedback,
      status,
      ...(feedback?.correct_index != null
        ? { correct_index: feedback.correct_index }
        : {}),
    });
  } catch (error) {
    if (error instanceof AlreadyMarking)
      return Response.json({ error: error.message }, { status: 409 });
    console.error(error);
    return Response.json({ error: "Could not mark answer" }, { status: 500 });
  }
}
