import Link from "next/link";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { FeedbackDetails } from "@/components/annotated-feedback";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { bankQuestions, remainingChecks } from "@/lib/single-check-data";
import { type OwnQuestion } from "@/lib/single-check";
import {
  questionColumns,
  dateLabel,
  type Attempt,
  type Topic,
} from "@/lib/practice";
import { type ReviewRow, markingState } from "@/lib/feedback";
import { PageHeader } from "@/components/page-header";
import { ResultsAnswers } from "@/components/results-report";
import { RetryAnswer } from "@/components/retry-answer";
import { MarkingProgress } from "@/components/marking-progress";
import { MarkMyAnswer } from "@/components/mark-my-answer";
import { RichText } from "@/components/rich-text";
import { Card } from "@/components/ui/card";

/** Single-session report until §3.13 supplies the canonical report for every kind. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: s, error } = await db
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!s) notFound();
  if (s.kind !== "single") {
    if (s.kind === "sprint") redirect(`/student/sprint/${id}/results`);
    if (s.kind === "paper") redirect(`/student/papers/${id}/results`);
    if (s.kind === "flashcards") redirect(`/student/flashcards/${id}`);
    notFound();
  }
  const config = s.config as { question?: OwnQuestion; question_id?: string };
  const [attempts, topics] = await Promise.all([
    db
      .from("attempts")
      .select("*")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .order("position"),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
  ]);
  if (attempts.error || topics.error)
    throw new Error("Couldn't load this check.");
  const a = attempts.data[0];
  if (!a) notFound();
  if (!s.finished_at) {
    const bank = await bankQuestions(db);
    if (a.question_id && !bank.some((q) => q.id === a.question_id)) {
      const { data: question, error } = await db
        .from("questions")
        .select(`${questionColumns},verb`)
        .eq("id", a.question_id)
        .maybeSingle();
      if (error) throw error;
      if (question) bank.push(question as (typeof bank)[number]);
    }
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          title="Continue your check"
          description="Your question is saved. Finish your answer when you're ready."
        />
        <MarkMyAnswer
          questions={bank}
          topics={topics.data as Topic[]}
          userId={user.id}
          left={await remainingChecks(user.id)}
          initial={{
            sessionId: id,
            attempt: a as Omit<Attempt, "question">,
            question: config.question,
            questionId: a.question_id,
          }}
        />
      </div>
    );
  }
  let rows: ReviewRow[];
  if (config.question && !a.question_id) {
    const q = config.question;
    const { data: reviews, error } = await db
      .from("mark_reviews")
      .select("status,reason,ai_mark,check_mark,final_mark")
      .eq("attempt_id", a.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    rows = [
      {
        ...a,
        attempt_id: a.id,
        type: q.marks > 8 ? "extended" : "short",
        marks: q.marks,
        stem: q.stem,
        stimulus: null,
        options: null,
        source: "Your question",
        topic_id: q.topic_id,
        year: null,
        correct_index: null,
        criteria: null,
        sample_answer: null,
        explanation: null,
        review: reviews[0] ?? null,
      } as ReviewRow,
    ];
  } else {
    const { data, error } = await db.rpc("session_review", { p_session: id });
    if (error) throw error;
    rows = data as ReviewRow[];
  }
  const paths = rows.flatMap((r) => r.image_paths ?? []);
  const { data: signed, error: photoError } = paths.length
    ? await db.storage.from("answers").createSignedUrls(paths, 3600)
    : { data: [], error: null };
  if (photoError) throw photoError;
  const photos = new Map(
    (signed ?? []).map((p) => [p.path ?? null, p.signedUrl ?? null]),
  );
  const pending = rows.some((r) => markingState(r) === "marking");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Mark my answer"
        description={`${dateLabel(s.started_at, true)} · One question, one clear next step.`}
      />
      <MarkingProgress
        done={
          rows.filter((r) =>
            ["marked", "reviewed", "in_review", "not_answered"].includes(
              markingState(r),
            ),
          ).length
        }
        total={rows.length}
        marking={rows.filter((r) => markingState(r) === "marking").length}
        attention={
          rows.filter((r) => ["failed", "unreadable"].includes(markingState(r)))
            .length
        }
      />
      {config.question && (
        <Card className="space-y-2 p-5">
          <p className="text-sm font-semibold">
            {config.question.criteria_text
              ? "Your supplied guidelines"
              : "Marked without official guidelines"}
          </p>
          {config.question.criteria_text ? (
            <FeedbackDetails name="guidelines" title="Marking guidelines">
              <RichText text={config.question.criteria_text} />
            </FeedbackDetails>
          ) : (
            <p className="text-muted-foreground text-sm">
              This mark is an estimate against the directive verb and the marks
              available.
            </p>
          )}
        </Card>
      )}
      {rows.flatMap((row) =>
        typeof row.feedback?.error === "string" &&
        markingState(row) === "failed"
          ? [
              <Card key={row.attempt_id} className="p-5">
                <p role="alert" className="text-sm">
                  {row.feedback.error}
                </p>
              </Card>,
            ]
          : [],
      )}
      {pending && (
        <RetryAnswer
          ids={rows
            .filter((row) => markingState(row) === "marking")
            .map((row) => row.attempt_id)}
          label="Retry marking"
        />
      )}
      <ResultsAnswers
        rows={rows}
        id={id}
        name={(tid) => topics.data.find((t) => t.id === tid)?.name ?? ""}
        photos={photos}
      />
      <div className="flex flex-wrap gap-3">
        <Link href="/student/mark" className={buttonVariants()}>
          Mark another answer
        </Link>
        <Link
          href="/activity"
          className={buttonVariants({ variant: "outline" })}
        >
          All activity
        </Link>
      </div>
    </div>
  );
}
