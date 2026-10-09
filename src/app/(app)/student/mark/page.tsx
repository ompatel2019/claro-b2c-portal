import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Pen } from "@/components/icons";
import { markingState, markLabel, type ReviewRow } from "@/lib/feedback";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { bankQuestions, remainingChecks } from "@/lib/single-check-data";
import { dateLabel, type Topic } from "@/lib/practice";
import { type OwnQuestion } from "@/lib/single-check";
import { PageHeader } from "@/components/page-header";
import { MarkMyAnswer } from "@/components/mark-my-answer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Page() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in");
  const [questions, left, topics, recent] = await Promise.all([
    bankQuestions(db),
    remainingChecks(user.id),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db
      .from("sessions")
      .select(
        "id,config,score,max_score,started_at,finished_at,attempts(status,check_status,mark,max_marks,feedback,mark_reviews(status,reason,ai_mark,check_mark,final_mark),question:questions(stem))",
      )
      .eq("user_id", user.id)
      .eq("kind", "single")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);
  if (topics.error || recent.error)
    throw new Error("Couldn't load your checks.");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Mark my answer"
        description="Bring a question and your answer. Find out what earns your next mark."
      />
      <MarkMyAnswer
        questions={questions}
        topics={topics.data as Topic[]}
        userId={user.id}
        left={left}
      />
      {recent.data.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.data.map((s) => {
                const config = s.config as { question?: OwnQuestion };
                const attempts = s.attempts as unknown as {
                  status: string;
                  check_status: string;
                  question: { stem: string } | null;
                  mark: number | null;
                  max_marks: number | null;
                  feedback: ReviewRow["feedback"];
                  mark_reviews: NonNullable<ReviewRow["review"]>[];
                }[];
                const a = attempts[0];
                const title =
                  config.question?.stem ??
                  a?.question?.stem ??
                  "Mark my answer";
                const state = a ? markingState(a) : "marking";
                const score = !s.finished_at
                  ? "In progress"
                  : state === "marking"
                    ? "Marking…"
                    : state === "failed"
                      ? "Couldn't mark"
                      : state === "unreadable"
                        ? "Couldn't read photo"
                        : a
                          ? `${markLabel({ ...a, marks: a.max_marks ?? config.question?.marks ?? 0, review: a.mark_reviews.find((r) => r.status === "open") ?? a.mark_reviews[0] ?? null }, state)}${state === "in_review" ? " · Provisional" : ""}`
                          : "In progress";
                return (
                  <li key={s.id}>
                    <Link
                      href={`/student/activity/${s.id}`}
                      className="hover:bg-muted flex flex-wrap items-center gap-2 rounded-lg py-3 focus-visible:outline-2"
                    >
                      <span className="line-clamp-2 min-w-0 basis-full text-sm font-medium sm:flex-1 sm:basis-auto">
                        {title}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {score} · {dateLabel(s.started_at, true)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Recent checks</h2>
          <EmptyState
            icon={Pen}
            title="No checks yet"
            description="Your last five checks will appear here."
          />
        </section>
      )}
    </div>
  );
}
