import { singleSlotIds } from "@/lib/single-check";
import { markOwnCheck, markBankCheck } from "@/lib/single-check-marking";
import { BUDGET_USD } from "@/lib/ai/prices";
import {
  AlreadyMarking,
  markAttempt,
  rescoreSession,
} from "@/lib/marking/engine";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
} from "@/lib/ai/rate-limit";
import { admin } from "@/utils/supabase/admin";
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
    .select(
      "session_id, question_id, session:sessions(finished_at, config, kind, started_at), question:questions(type)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  // Embedded to-one relations; typed loosely without generated DB types.
  const { session, question } = attempt as unknown as {
    session: {
      finished_at: string | null;
      kind: string;
      started_at: string;
      config: { feedback?: string } | null;
    };
    question: { type: string } | null;
  };
  async function singleFailure(message: string) {
    if (session.kind !== "single") return;
    await admin()
      .from("attempts")
      .update({ status: "failed", feedback: { error: message } })
      .eq("id", id)
      .eq("user_id", user!.id)
      .in("status", ["pending", "transcribed", "failed"])
      .throwOnError();
  }
  const finished = Boolean(session.finished_at);
  if (session.kind === "single") {
    if (!finished)
      return Response.json(
        { error: "Submit your check before marking." },
        { status: 409 },
      );
    if (
      !session.started_at ||
      !(await singleSlotIds(user.id, new Date(session.started_at))).includes(
        attempt.session_id,
      )
    )
      return Response.json({ error: "Check not found" }, { status: 404 });
  }
  // Check-as-you-go sprints (§3.3) mark and reveal one answer before finish.
  const checkMode = !finished && session.config?.feedback === "each";
  if (question?.type === "mcq" && !finished && !checkMode)
    return Response.json(
      { error: "Multiple-choice answers are marked when you finish" },
      { status: 409 },
    );
  if (question?.type !== "mcq") {
    const limited = await assertStudentAiRateLimit({ userId: user.id });
    if (!limited.ok) {
      await singleFailure(limited.error);
      return rateLimitedResponse(limited);
    }
  }
  try {
    if (question?.type !== "mcq") {
      const { data: spent, error: spendError } = await admin().rpc("ai_spend");
      if (spendError) throw spendError;
      if (Number(spent) >= BUDGET_USD) {
        const error =
          "Marking is paused right now. Your answer is saved; try again later.";
        await singleFailure(error);
        return Response.json({ error }, { status: 503 });
      }
    }
    const { mark, max_marks, band, feedback, status } =
      session.kind === "single"
        ? attempt.question_id
          ? await markBankCheck(id, user.id, attempt.question_id)
          : await markOwnCheck(id, user.id, session.config)
        : await markAttempt(id);
    if (feedback?.note === "No answer")
      await admin()
        .from("attempts")
        .update({ check_status: "skipped" })
        .eq("id", id)
        .eq("user_id", user.id)
        .throwOnError();
    if (finished) {
      if (session.kind === "single") {
        await admin()
          .from("sessions")
          .update({ score: mark, max_score: max_marks })
          .eq("id", attempt.session_id)
          .eq("user_id", user.id)
          .throwOnError();
      } else await rescoreSession(attempt.session_id);
    }
    // The answer is locked now, so the explanation can be shown with the key.
    const explanation =
      checkMode && question?.type === "mcq"
        ? (
            await admin()
              .from("questions")
              .select("explanation")
              .eq("id", attempt.question_id)
              .single()
          ).data?.explanation
        : null;
    return Response.json({
      mark,
      max_marks,
      band,
      feedback,
      status,
      ...(explanation ? { explanation } : {}),
      ...(feedback?.correct_index != null
        ? { correct_index: feedback.correct_index }
        : {}),
    });
  } catch (error) {
    if (error instanceof AlreadyMarking)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "AI budget reached") {
      await singleFailure(
        "Marking is paused right now. Your answer is saved; try again later.",
      );
      return Response.json(
        {
          error:
            "Marking is paused right now. Your answer is saved; try again later.",
        },
        { status: 503 },
      );
    }
    await singleFailure("We couldn't mark this one. Retry.");
    console.error(error);
    return Response.json({ error: "Could not mark answer" }, { status: 500 });
  }
}
