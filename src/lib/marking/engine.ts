import "server-only";

import { callJson } from "@/lib/ai/openai";
import { MODELS } from "@/lib/ai/prices";
import { admin } from "@/utils/supabase/admin";
import {
  anchorComments,
  clampMark,
  findBand,
  scoreMcq,
  validateGrade,
  type MarkableQuestion,
} from "./grade";
import {
  bandCorrection,
  flashcardMessages,
  gradeMessages,
  summaryMessages,
  transcribeMessages,
} from "./prompts";
import {
  FlashcardSchema,
  GradeSchema,
  SummarySchema,
  TranscriptSchema,
} from "./schemas";

export async function markWritten(
  q: MarkableQuestion,
  answer: string,
  userId: string | null,
) {
  const messages = gradeMessages(q, answer);
  const options = {
    task: "mark_written",
    model: MODELS.strong,
    schema: GradeSchema,
    effort: "low" as const,
    fast: true,
    userId,
  };
  let grade = await callJson({ ...options, messages });
  let validation = validateGrade(q.criteria, q.marks, grade);
  if (!validation.ok) {
    messages.push(
      { role: "assistant", content: JSON.stringify(grade) },
      bandCorrection(validation.problem, q.criteria),
    );
    grade = await callJson({ ...options, messages });
    validation = validateGrade(q.criteria, q.marks, grade);
  }
  const mark = validation.ok ? grade.mark : clampMark(grade.mark, q.marks);
  const criterion = validation.ok
    ? findBand(q.criteria, grade.band_selected)
    : q.criteria.find((c) => mark >= c.min && mark <= c.max);
  return {
    mark,
    band: criterion?.descriptor ?? "NO BAND SATISFIED",
    feedback: {
      analysis: grade.analysis,
      justification: grade.justification,
      why_not_higher: grade.why_not_higher,
      comments: anchorComments(answer, grade.comments),
      earned: grade.earned,
      missing_points: grade.missing_points,
      next_band: grade.next_band,
      better_answer_outline: grade.better_answer_outline,
      validated: validation.ok,
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
  question: MarkableQuestion & { correct_index: number };
};

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
        const { data: claimed } = await admin()
          .from("attempts")
          .update({ status: "marking" })
          .eq("id", attemptId)
          .in("status", ["pending", "transcribed", "failed"])
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
      .select("mark")
      .eq("session_id", sessionId)
      .eq("user_id", session.user_id)
      .throwOnError();
    score = (reviews ?? []).reduce(
      (sum, review) => sum + Number(review.mark),
      0,
    );
    max = reviews?.length ?? 0;
  } else {
    const { data } = await admin()
      .from("attempts")
      .select("*, question:questions(*)")
      .eq("session_id", sessionId)
      .eq("user_id", session.user_id)
      .throwOnError();
    const attempts = (data ?? []) as AttemptQuestion[];
    const results = await Promise.allSettled(
      attempts
        .filter((a) => a.status !== "marked")
        .map((a) => markAttempt(a.id)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const { data: marked } = await admin()
      .from("attempts")
      .select("*, question:questions(*)")
      .eq("session_id", sessionId)
      .eq("user_id", session.user_id)
      .throwOnError();
    const rows = (marked ?? []) as AttemptQuestion[];
    score = rows.reduce((sum, a) => sum + Number(a.mark ?? 0), 0);
    max = rows.reduce((sum, a) => sum + (a.max_marks ?? a.question.marks), 0);
    if (rows.length) {
      summary = await summariseSession(
        rows.map((a) => ({
          source: a.question.source,
          stem: a.question.stem,
          mark: Number(a.mark ?? 0),
          max: a.max_marks ?? a.question.marks,
          band: a.band,
          strengths: a.feedback?.analysis?.strengths ?? [],
          improvements: a.feedback?.missing_points ?? [],
        })),
        session.user_id,
      );
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
