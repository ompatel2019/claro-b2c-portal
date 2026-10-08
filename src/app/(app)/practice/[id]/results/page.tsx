import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { createClient } from "@/utils/supabase/server";
import {
  modeLabel,
  percentage,
  dateLabel,
  timer,
  topicNames,
  type Topic,
} from "@/lib/practice";
import { markingState, type ReviewRow } from "@/lib/feedback";
import { RichText } from "@/components/rich-text";
import { AnnotatedFeedback } from "@/components/annotated-feedback";
import { ReportProblem } from "@/components/feedback-widget";
import { McReview } from "@/components/mc-review";
import { PageHeader } from "@/components/page-header";
import { RefreshWhile } from "@/components/refresh-while";
import { StatCard } from "@/components/stat-card";
import { StatusPill, statePill } from "@/components/status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Results({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session: s } = await loadSprint(id);
  if (!s.finished_at) redirect(`/practice/${id}`);
  const db = await createClient();
  const [topics, review] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort"),
    db.rpc("session_review", { p_session: id }),
  ]);
  if (topics.error || review.error)
    throw new Error("Could not load your results.");
  const rows = (review.data as ReviewRow[]).filter(
    (r) => markingState(r) !== "skipped",
  );
  const paths = rows.flatMap((r) => r.image_paths ?? []);
  const signed = paths.length
    ? (await db.storage.from("answers").createSignedUrls(paths, 3600)).data
    : null;
  const url = new Map(signed?.map((x) => [x.path, x.signedUrl]));
  const report = (r: ReviewRow) =>
    r.question_id && (
      <ReportProblem
        questionId={r.question_id}
        sessionId={id}
        label={`Linked: ${r.source}`}
      />
    );
  const marking = rows.filter((r) => markingState(r) === "marking").length;
  return (
    <div className="space-y-4">
      <RefreshWhile active={marking > 0} />
      <PageHeader
        eyebrow="Every answer gives you a next step"
        title="Your results."
        description={`${modeLabel(s.config.mode)} · ${topicNames(s.config.topics, (topics.data ?? []) as Topic[])}`}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Score"
          value={`${s.score}/${s.max_score}`}
          caption={
            marking
              ? `${rows.length - marking} of ${rows.length} marked`
              : percentage(s.score, s.max_score)
          }
        />
        <StatCard label="Time used" value={timer(s.elapsed_s ?? 0)} />
        <StatCard label="Finished" value={dateLabel(s.finished_at)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["Strengths", "strengths"],
            ["Priority Improvements", "improvements"],
            ["Next Study Moves", "next_steps"],
          ] as const
        ).map(([label, key]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle>{label}</CardTitle>
            </CardHeader>
            <CardContent>
              {s.summary?.[key]?.length ? (
                <ul className="list-disc space-y-2 pl-5">
                  {s.summary[key].map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  A summary isn’t available for this session. Review your
                  answers below.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="space-y-3">
        <h2>Your answers</h2>
        {rows.map((r, i) => {
          const state = markingState(r);
          const pill = r.type === "mcq" ? null : statePill(state, r.review);
          return (
            <details
              key={r.attempt_id}
              id={`q-${r.position}`}
              className="bg-card rounded-xl border p-5"
            >
              <summary className="cursor-pointer space-y-2">
                <span className="font-semibold">
                  Question {i + 1} · {r.source} {r.year ?? ""}
                </span>
                <span className="ml-3 inline-flex items-center gap-2 text-sm">
                  {["marked", "in_review", "reviewed"].includes(state) &&
                    `${r.mark}/${r.max_marks ?? r.marks}`}
                  {pill && <StatusPill pill={pill} />}
                </span>
                <RichText className="mt-2 block" text={r.stem} />
              </summary>
              <div className="mt-4 space-y-4">
                {r.stimulus && (
                  <RichText
                    className="bg-paper space-y-3 rounded-xl p-4"
                    text={r.stimulus}
                  />
                )}
                {r.type === "mcq" ? (
                  <>
                    <McReview row={r} />
                    {report(r)}
                  </>
                ) : (
                  <AnnotatedFeedback
                    row={r}
                    photos={(r.image_paths ?? []).flatMap(
                      (p) => url.get(p) ?? [],
                    )}
                    actions={report(r)}
                  />
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
