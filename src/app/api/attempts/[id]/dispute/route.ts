import { OPEN_DISPUTES_PER_STUDENT } from "@/lib/limits";
import { z } from "zod";
import { markingState } from "@/lib/feedback";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const OVER_LIMIT = `You have ${OPEN_DISPUTES_PER_STUDENT} marks being checked. You can question another once one is done.`;
const body = z.object({ note: z.string().trim().min(10).max(1000) });

/**
 * §2.5 "Question this mark". A server route because students can't write
 * mark_reviews or check_status: own written attempt in a finished session,
 * shown as marked or reviewed; 1 open review per attempt, ≤3 open disputes each.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Tell us what we missed in 10 to 1,000 characters." },
      { status: 400 },
    );
  const { id } = await params;
  const { data: attempt } = await supabase
    .from("attempts")
    .select(
      "mark, status, check_status, feedback, session:sessions(finished_at), question:questions(type)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  const { session, question } = attempt as unknown as {
    session: { finished_at: string | null };
    question: { type: string } | null;
  };
  const state = markingState(attempt);
  if (
    !session.finished_at ||
    question?.type === "mcq" ||
    !["marked", "reviewed"].includes(state)
  )
    return Response.json(
      { error: "This mark can’t be questioned right now." },
      { status: 409 },
    );
  const db = admin();
  const { count } = await db
    .from("mark_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("reason", "student_dispute")
    .eq("status", "open")
    .throwOnError();
  if ((count ?? 0) >= OPEN_DISPUTES_PER_STUDENT)
    return Response.json({ error: OVER_LIMIT }, { status: 409 });
  const { error } = await db.from("mark_reviews").insert({
    attempt_id: id,
    user_id: user.id,
    reason: "student_dispute",
    ai_mark: attempt.mark,
    student_note: parsed.data.note,
  });
  if (error?.code === "23505")
    return Response.json(
      { error: "This mark is already being checked." },
      { status: 409 },
    );
  if (error) throw error;
  await db
    .from("attempts")
    .update({ check_status: "in_review" })
    .eq("id", id)
    .throwOnError();
  return Response.json({ ok: true });
}
