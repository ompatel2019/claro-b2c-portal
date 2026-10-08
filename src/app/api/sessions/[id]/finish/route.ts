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
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session)
    return Response.json({ error: "Session not found" }, { status: 404 });
  try {
    const { score, max_score, summary } = await finishSession(id);
    return Response.json({ score, max_score, summary });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Could not finish session" },
      { status: 500 },
    );
  }
}
