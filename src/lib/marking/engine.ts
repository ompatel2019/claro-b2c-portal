import "server-only";

import type { z } from "zod";

import { callJson, type Message } from "@/lib/ai/openai";
import { MODELS } from "@/lib/ai/prices";
import { admin } from "@/utils/supabase/admin";
import { firstReviews, type FlashcardReview } from "@/lib/flashcards";
import {
  anchorComments,
  clampMark,
  findBand,
  marksAgree,
  scoreMcq,
  topicSummary,
  validateGrade,
  type MarkableQuestion,
} from "./grade";
import {
  bandCorrection,
  flashcardMessages,
  gradeMessages,
  reconcileMessages,
  summaryMessages,
  transcribeMessages,
} from "./prompts";
import {
  CheckSchema,
  FlashcardSchema,
  GradeSchema,
  SummarySchema,
  TranscriptSchema,
} from "./schemas";

export const MARKER = {
  model: MODELS.strong,
  effort: { grade: "low", check: "low", reconcile: "medium" },
} as const;

export async function markWritten(
  q: MarkableQuestion,
  answer: string,
  userId: string | null,
  task?: string,
) {
  async function pass<S extends z.ZodType<z.infer<typeof CheckSchema>>>(
    schema: S,
    messages: Message[],
    effort: "low" | "medium",
    passTask: string,
  ) {
    const options = {
      task: task ?? passTask,
      model: MARKER.model,
      effort,
      schema,
      fast: true,
      userId,
    };
    let grade = await callJson<S>({ ...options, messages });
    let validation = validateGrade(q.criteria, q.marks, grade);
    if (!validation.ok) {
      messages.push(
        { role: "assistant", content: JSON.stringify(grade) },
        bandCorrection(validation.problem, q.criteria),
      );
      grade = await callJson<S>({ ...options, messages });
      validation = validateGrade(q.criteria, q.marks, grade);
    }
    const mark = validation.ok ? grade.mark : clampMark(grade.mark, q.marks);
    const criterion = validation.ok
      ? findBand(q.criteria, grade.band_selected)
      : mark === 0
        ? null
        : q.criteria.find((c) => mark >= c.min && mark <= c.max);
    return { grade, mark, criterion, validated: validation.ok };
  }

  const [first, second] = await Promise.all([
    pass(
      GradeSchema,
      gradeMessages(q, answer),
      MARKER.effort.grade,
      "mark_written",
    ),
    pass(
      CheckSchema,
      gradeMessages(q, answer, true),
      MARKER.effort.check,
      "check_written",
    ),
  ]);
  const agrees = (a: number, b: number) =>
    marksAgree(q.criteria, q.marks, a, b);
  const check: {
    status: "agreed" | "second_pass" | "in_review";
    marks: number[];
  } = {
    status: "agreed",
    marks: [first.mark, second.mark],
  };
  let final: typeof first | typeof second = first;
  if (!agrees(first.mark, second.mark)) {
    const third = await pass(
      CheckSchema,
      reconcileMessages(
        q,
        answer,
        {
          band_selected: first.criterion?.descriptor ?? "NO BAND SATISFIED",
          mark: first.mark,
          justification: first.grade.justification,
        },
        {
          band_selected: second.criterion?.descriptor ?? "NO BAND SATISFIED",
          mark: second.mark,
          justification: second.grade.justification,
        },
      ),
      MARKER.effort.reconcile,
      "second_pass",
    );
    check.marks.push(third.mark);
    if (agrees(third.mark, first.mark) || agrees(third.mark, second.mark)) {
      check.status = "second_pass";
      final = third;
    } else {
      check.status = "in_review";
    }
  }
  const grade = first.grade;
  return {
    mark: final.mark,
    band: final.criterion?.descriptor ?? "NO BAND SATISFIED",
    feedback: {
      analysis: grade.analysis,
      justification: final.grade.justification,
      why_not_higher: grade.why_not_higher,
      comments: anchorComments(answer, grade.comments),
      earned: grade.earned,
      missing_points: grade.missing_points,
      next_band: grade.next_band,
      better_answer_outline: grade.better_answer_outline,
      validated: first.validated,
      check,
    },
  };
}

export async function transcribeImage(
  bytes: ArrayBuffer | Buffer,
  mime: string,
  stem: string,
  userId: string,
) {
  const encoded = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const url = `data:${mime};base64,${encoded.toString("base64")}`;
  const result = await callJson({
    task: "transcribe_answer",
    model: MODELS.strong,
    schema: TranscriptSchema,
    messages: transcribeMessages(url, stem),
    effort: "low",
    userId,
  });
  return { transcript: result.lines.join("\n"), ...result };
}

export async function markFlashcard(
  card: Parameters<typeof flashcardMessages>[0],
  answer: string,
  userId: string,
) {
  return callJson({
    task: "mark_flashcard",
    model: MODELS.cheap,
    schema: FlashcardSchema,
    messages: flashcardMessages(card, answer),
    effort: "low",
    userId,
  });
}

export async function summariseSession(
  items: Parameters<typeof summaryMessages>[0],
  userId: string,
) {
  return callJson({
    task: "session_summary",
    model: MODELS.cheap,
    schema: SummarySchema,
    messages: summaryMessages(items),
    effort: "low",
    userId,
  });
}

type Attempt = {
  id: string;
  user_id: string;
  status: string;
  choice_index: number | null;
  answer_text: string | null;
  transcript: string | null;
  mark: number | null;
  max_marks: number | null;
  band: string | null;
  feedback: {
    analysis?: { strengths: string[] };
    missing_points?: string[];
    correct_index?: number;
    chosen_index?: number | null;
    note?: string;
  } | null;
};
type AttemptQuestion = Attempt & {
  question: MarkableQuestion & {
    correct_index: number;
    topic?: { name: string } | null;
  };
};

/** A claim older than this belongs to a marking call that died; it may be taken over. */
export const STALE_CLAIM_MS = 3 * 60_000;
const WAIT_FOR_MARKING_MS = 90_000;

export class AlreadyMarking extends Error {
  message = "This answer is already being marked.";
}

export async function markAttempt(attemptId: string) {
  try {
    const { data } = await admin()
      .from("attempts")
      .select("*, question:questions(*)")
      .eq("id", attemptId)
      .single()
      .throwOnError();
    const attempt = data as AttemptQuestion;
    if (attempt.status === "marked") {
      const { question: _question, ...row } = attempt;
      void _question;
      return row;
    }
    const q = attempt.question;
    let result;
    if (q.type === "mcq") {
      result = {
        mark: scoreMcq(q.correct_index, attempt.choice_index),
        max_marks: 1,
        band: null,
        feedback: {
          correct_index: q.correct_index,
          chosen_index: attempt.choice_index,
        },
      };
    } else {
      const answer = attempt.transcript ?? attempt.answer_text ?? "";
      if (answer.trim().split(/\s+/).filter(Boolean).length < 3) {
        result = {
          mark: 0,
          max_marks: q.marks,
          band: null,
          feedback: { note: "No answer" },
        };
      } else {
        const stale = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
        const { data: claimed } = await admin()
          .from("attempts")
          .update({ status: "marking", claimed_at: new Date().toISOString() })
          .eq("id", attemptId)
          .or(
            `status.in.(pending,transcribed,failed),and(status.eq.marking,claimed_at.lt.${stale})`,
          )
          .select("id")
          .throwOnError();
        if (!claimed?.length) throw new AlreadyMarking();
        result = {
          ...(await markWritten(q, answer, attempt.user_id)),
          max_marks: q.marks,
        };
      }
    }
    const { data: updated } = await admin()
      .from("attempts")
      .update({
        ...result,
        status: "marked",
        marked_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .select("*")
      .single()
      .throwOnError();
    return updated as Attempt;
  } catch (error) {
    if (!(error instanceof AlreadyMarking))
      await admin()
        .from("attempts")
        .update({ status: "failed" })
        .eq("id", attemptId);
    throw error;
  }
}

export async function finishSession(sessionId: string) {
  const { data: session } = await admin()
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single()
    .throwOnError();
  if (session.finished_at) return session;
  let score = 0;
  let max = 0;
  let summary = null;
  if (session.kind === "flashcards") {
    const { data: reviews } = await admin()
      .from("flashcard_reviews")
      .select("flashcard_id,mark,created_at,id")
      .eq("session_id", sessionId)
      .eq("user_id", session.user_id)
      .order("created_at")
      .order("id")
      .throwOnError();
    const first = [
      ...firstReviews((reviews ?? []) as FlashcardReview[]).values(),
    ];
    score = first.reduce((sum, review) => sum + Number(review.mark), 0);
    max = first.length;
  } else {
    const rows = await markRemaining(sessionId, session.user_id);
    ({ score, max } = totals(rows));
    const marked = rows.filter((a) => a.status === "marked");
    if (marked.length && !marked.some((a) => a.feedback?.analysis)) {
      summary = topicSummary(
        marked.map((a) => ({
          topic: a.question.topic?.name ?? "this topic",
          correct: Number(a.mark) === (a.max_marks ?? a.question.marks),
        })),
      );
    } else if (marked.length) {
      summary = await summariseSession(
        marked.map((a) => ({
          source: a.question.source,
          stem: a.question.stem,
          mark: Number(a.mark ?? 0),
          max: a.max_marks ?? a.question.marks,
          band: a.band,
          strengths: a.feedback?.analysis?.strengths ?? [],
          improvements: a.feedback?.missing_points ?? [],
        })),
        session.user_id,
      ).catch((error) => {
        console.error(error);
        return null;
      });
    }
  }
  const { data: finished } = await admin()
    .from("sessions")
    .update({
      finished_at: new Date().toISOString(),
      score,
      max_score: max,
      summary,
    })
    .eq("id", sessionId)
    .select("*")
    .single()
    .throwOnError();
  return finished;
}

async function sessionAttempts(sessionId: string, userId: string) {
  const { data } = await admin()
    .from("attempts")
    .select("*, question:questions(*, topic:topics(name))")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("position")
    .throwOnError();
  return (data ?? []) as (AttemptQuestion & { claimed_at: string | null })[];
}

/** Waits for in-flight marking, then marks everything left (retrying failures once). Never throws for one bad answer. */
async function markRemaining(sessionId: string, userId: string) {
  const deadline = Date.now() + WAIT_FOR_MARKING_MS;
  let rows = await sessionAttempts(sessionId, userId);
  const inFlight = (a: (typeof rows)[number]) =>
    a.status === "marking" &&
    Date.now() - new Date(a.claimed_at ?? 0).getTime() < STALE_CLAIM_MS;
  const settle = async () => {
    while (rows.some(inFlight) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      rows = await sessionAttempts(sessionId, userId);
    }
  };
  for (let round = 0; round < 2; round++) {
    await settle();
    const todo = rows.filter((a) => a.status !== "marked" && !inFlight(a));
    if (!todo.length) break;
    const results = await Promise.allSettled(
      todo.map((a) => markAttempt(a.id)),
    );
    results.forEach((result) => {
      if (result.status === "rejected") console.error(result.reason);
    });
    rows = await sessionAttempts(sessionId, userId);
  }
  // A background mark may have claimed an answer while this call was marking the rest.
  await settle();
  return rows;
}

function totals(rows: AttemptQuestion[]) {
  return {
    score: rows.reduce(
      (sum, a) => sum + (a.status === "marked" ? Number(a.mark ?? 0) : 0),
      0,
    ),
    max: rows.reduce((sum, a) => sum + (a.max_marks ?? a.question.marks), 0),
  };
}

/** After a late re-mark (e.g. a retry on the results page), refresh a finished session's score. */
export async function rescoreSession(sessionId: string) {
  const { data: session } = await admin()
    .from("sessions")
    .select("user_id, finished_at")
    .eq("id", sessionId)
    .single()
    .throwOnError();
  if (!session.finished_at) return;
  const { score, max } = totals(
    await sessionAttempts(sessionId, session.user_id),
  );
  await admin()
    .from("sessions")
    .update({ score, max_score: max })
    .eq("id", sessionId)
    .throwOnError();
}
