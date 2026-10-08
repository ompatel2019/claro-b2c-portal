import { transcribeImage } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 120;

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
    .select("image_path, question_id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  if (!["pending", "transcribed"].includes(attempt.status))
    return Response.json(
      { error: "Attempt is already being marked or marked" },
      { status: 409 },
    );
  if (!attempt.image_path || !attempt.image_path.startsWith(`${user.id}/`))
    return Response.json({ error: "No answer image" }, { status: 400 });
  try {
    const { data: question } = await supabase
      .from("questions")
      .select("stem")
      .eq("id", attempt.question_id)
      .single()
      .throwOnError();
    const { data: image, error } = await admin()
      .storage.from("answers")
      .download(attempt.image_path);
    if (error || !image) throw new Error("Image not found");
    const result = await transcribeImage(
      await image.arrayBuffer(),
      image.type,
      question.stem,
      user.id,
    );
    await admin()
      .from("attempts")
      .update({ transcript: result.transcript, status: "transcribed" })
      .eq("id", id)
      .in("status", ["pending", "transcribed"])
      .throwOnError();
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not transcribe answer" },
      { status: 500 },
    );
  }
}
