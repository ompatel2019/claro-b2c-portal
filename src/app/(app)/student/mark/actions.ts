"use server";
import { z } from "zod";
import {
  MARK_MY_ANSWER_DAILY_LIMIT,
  LONG_PHOTO_PAGE_LIMIT,
} from "@/lib/limits";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import { bankQuestions } from "@/lib/single-check-data";
import {
  answerValid,
  ownQuestionSchema,
  singleConfig,
  singleSlotIds,
  sydneyDayStart,
} from "@/lib/single-check";

const requestSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("own"), question: ownQuestionSchema }),
  z.object({ source: z.literal("bank"), question_id: z.string().min(1) }),
]);
async function create(input: unknown) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Sign in to keep working.");
  const request = requestSchema.parse(input);
  if (
    request.source === "bank" &&
    !(await bankQuestions(db)).some((q) => q.id === request.question_id)
  )
    throw new Error(
      "This question is no longer available. Choose another question.",
    );
  if (request.source === "own" && request.question.topic_id) {
    const { data } = await db
      .from("topics")
      .select("id")
      .eq("id", request.question.topic_id)
      .not("parent_id", "is", null)
      .maybeSingle();
    if (!data) throw new Error("Choose a subtopic from the list.");
  }
  // A deterministic UUID per student/day/slot turns the primary key into an
  // atomic reservation. Concurrent tabs/workers cannot both take the last check.
  const now = new Date();
  const slotIds = await singleSlotIds(user.id, now);
  const service = admin();
  let sessionId: string | null = null;
  for (let retry = 0; retry < MARK_MY_ANSWER_DAILY_LIMIT; retry++) {
    const { data: existing, error: readError } = await service
      .from("sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "single")
      .gte("started_at", sydneyDayStart(now));
    if (readError) throw new Error("Couldn't load today's checks. Try again.");
    const used = new Set((existing ?? []).map((s) => s.id as string));
    const legacy = [...used].filter((id) => !slotIds.includes(id)).length;
    const available = slotIds
      .slice(0, Math.max(0, MARK_MY_ANSWER_DAILY_LIMIT - legacy))
      .find((id) => !used.has(id));
    if (!available)
      throw new Error("You've used today's 20 checks. More at midnight.");
    const { error } = await service.from("sessions").insert({
      id: available,
      user_id: user.id,
      kind: "single",
      started_at: now.toISOString(),
      config:
        request.source === "own"
          ? singleConfig(request.question)
          : { question_id: request.question_id },
    });
    if (!error) {
      sessionId = available;
      break;
    }
    if (error.code !== "23505")
      throw new Error("Couldn't save your question. Try again.");
  }
  if (!sessionId) throw new Error("Another check just started. Try again.");
  const attemptId = crypto.randomUUID();
  const attempt = await service.from("attempts").insert({
    id: attemptId,
    session_id: sessionId,
    user_id: user.id,
    question_id: request.source === "bank" ? request.question_id : null,
    position: 1,
  });
  if (attempt.error) {
    await service
      .from("sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);
    throw new Error("Couldn't save your answer. Try again.");
  }
  return { sessionId, attemptId };
}
async function finish(sessionId: string) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Your session expired. Sign in to keep working.");
  const { data: s } = await db
    .from("sessions")
    .select("id,started_at")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("kind", "single")
    .maybeSingle();
  if (
    !s ||
    !(await singleSlotIds(user.id, new Date(s.started_at))).includes(sessionId)
  )
    throw new Error("Check not found.");
  const { data: answer, error: answerError } = await db
    .from("attempts")
    .select("answer_text,transcript,image_paths")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (
    answerError ||
    !answer ||
    !answerValid(answer, true) ||
    (answer.image_paths?.length ?? 0) > LONG_PHOTO_PAGE_LIMIT ||
    answer.image_paths?.some((path: string) => !path.startsWith(`${user.id}/`))
  )
    throw new Error(
      "Add your answer and confirm any photo transcript before submitting.",
    );
  const { error } = await admin()
    .from("sessions")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .is("finished_at", null);
  if (error) throw new Error("Couldn't submit this check. Try again.");
}

export async function createCheck(input: unknown) {
  try {
    return await create(input);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Couldn't save your check. Try again.",
    };
  }
}
export async function finishCheck(sessionId: string) {
  try {
    await finish(sessionId);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Couldn't submit your check. Try again.",
    };
  }
}

/** Retake/type recovery is restricted to the student's unsubmitted single check. */
export async function restoreUnreadableCheck(attemptId: string) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in to keep working." };
  const { data: attempt, error } = await db
    .from("attempts")
    .select("session_id,status,session:sessions(kind,started_at,finished_at)")
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .maybeSingle();
  const session = attempt?.session as unknown as {
    kind: string;
    started_at: string;
    finished_at: string | null;
  } | null;
  if (
    error ||
    !attempt ||
    !session ||
    session.kind !== "single" ||
    session.finished_at ||
    !(await singleSlotIds(user.id, new Date(session.started_at))).includes(
      attempt.session_id,
    )
  )
    return { error: "This check is no longer editable." };
  const { error: saveError } = await admin()
    .from("attempts")
    .update({ status: "transcribed" })
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .eq("status", "unreadable");
  return { error: saveError ? "Couldn't save your answer. Try again." : null };
}
