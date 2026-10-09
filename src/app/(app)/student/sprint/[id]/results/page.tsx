import Link from "next/link";
import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { createClient } from "@/utils/supabase/server";
import { modeLabel, timeLimit, type Topic } from "@/lib/practice";
import { markingState, markLabel, type ReviewRow } from "@/lib/feedback";
import {
  below,
  delta,
  firstBelow,
  kpis,
  markTone,
  nextActions,
  pct,
  scored,
  sprintHref,
  timeMeta,
  TYPE_LABEL,
} from "@/lib/results";
import { RichText } from "@/components/rich-text";
import { AnnotatedFeedback } from "@/components/annotated-feedback";
import { ReportProblem } from "@/components/feedback-widget";
import { QuestionMark } from "@/components/question-mark";
import { McReview } from "@/components/mc-review";
import { PageHeader } from "@/components/page-header";
import { MarkingProgress } from "@/components/marking-progress";
import { ResultsBrowser } from "@/components/results-browser";
import { RetryAnswer } from "@/components/retry-answer";
import { SameSetup } from "@/components/sprint-setup";
import { StatCard } from "@/components/stat-card";
import { StatusPill, statePill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const when = (d: string) =>
  new Date(d)
    .toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(/^(\w{3}),/, "$1")
    .replace(/\s?([ap])m$/i, " $1m");
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export default async function Results({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session: s, profile } = await loadSprint(id);
  if (!s.finished_at) redirect(`/student/sprint/${id}`);
  const db = await createClient();
  const [topicRes, review, past] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort"),
    db.rpc("session_review", { p_session: id }),
    db
      .from("sessions")
      .select("id,score,max_score,elapsed_s")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .eq("config->>mode", s.config.mode)
      .not("finished_at", "is", null)
      .neq("id", id)
      .order("finished_at", { ascending: false })
      .limit(20),
  ]);
  if (topicRes.error || review.error || past.error)
    throw new Error("Could not load your results.");
  const topics = (topicRes.data ?? []) as Topic[];
  const rows = (review.data as ReviewRow[]).filter(
    (r) => markingState(r) !== "skipped",
  );
  const topicIds = [...new Set(rows.flatMap((r) => r.topic_id ?? []))];
  const pastIds = past.data.map((p) => p.id);
  const [cardRes, pastAttempts] = await Promise.all([
    db.from("flashcards").select("topic_id").in("topic_id", topicIds),
    pastIds.length
      ? db
          .from("attempts")
          .select("session_id,mark,max_marks,question:questions(type)")
          .in("session_id", pastIds)
          .eq("status", "marked")
      : { data: [] },
  ]);
  const cards: Record<string, number> = {};
  for (const c of cardRes.data ?? [])
    cards[c.topic_id] = (cards[c.topic_id] ?? 0) + 1;
  const paths = rows.flatMap((r) => r.image_paths ?? []);
  const signed = paths.length
    ? (await db.storage.from("answers").createSignedUrls(paths, 3600)).data
    : null;
  const url = new Map(signed?.map((x) => [x.path, x.signedUrl]));

  const name = (tid: string | null) =>
    topics.find((t) => t.id === tid)?.name ?? "";
  const k = kpis(rows);
  const total = rows.reduce((n, r) => n + Number(r.max_marks ?? r.marks), 0);
  const done = rows.filter((r) => markingState(r) !== "marking").length;
  const provisional = rows.some((r) => markingState(r) === "in_review");
  const failed = rows.filter((r) => markingState(r) === "failed");
  const mistakes = rows.filter(below).length;
  const limit = timeLimit(s.config);
  // Averages over past sprints of this type (per-type tallies from their marked attempts).
  const pastRows = (pastAttempts.data ?? []) as unknown as {
    mark: number;
    max_marks: number;
    question: { type: string } | null;
  }[];
  const typeAvg = (mc: boolean) => {
    const xs = pastRows.filter((r) => (r.question?.type === "mcq") === mc);
    const max = xs.reduce((n, r) => n + Number(r.max_marks), 0);
    return max
      ? (xs.reduce((n, r) => n + Number(r.mark), 0) / max) * 100
      : null;
  };
  const scorePct = total ? (k.score.mark / total) * 100 : null;
  const scoreAvg = avg(
    past.data.map((p) => (p.max_score ? (p.score / p.max_score) * 100 : null)),
  );
  const timeAvg = avg(past.data.map((p) => p.elapsed_s));
  const elapsed = s.elapsed_s ?? 0;
  const minutes = (n: number | null) => (n == null ? null : n / 60);
  const actions = nextActions(rows, s.config.mode, topics, cards);
  const places = s.config.subtopics?.length
    ? s.config.subtopics
    : s.config.topics;
  const report = (r: ReviewRow) =>
    r.question_id && (
      <ReportProblem
        questionId={r.question_id}
        sessionId={id}
        label={`Linked: ${r.source}`}
      />
    );

  const actionLinks = actions.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className:
              "h-auto min-h-8 max-w-full shrink py-1.5 text-left whitespace-normal",
          })}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
  const views = rows.map((r, i) => {
    const state = markingState(r);
    return (
      <Card key={r.attempt_id} id={`q-${r.position}`}>
        <CardHeader className="space-y-2">
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink font-semibold">Question {i + 1}</span>·{" "}
            {TYPE_LABEL[r.type]} · {r.source}
            {r.topic_id && ` · ${name(r.topic_id)}`}
            {r.type === "mcq" && scored(r) && (
              <span className="text-ink font-semibold tabular-nums">
                {markLabel(r, state)}
              </span>
            )}
          </p>
          <RichText className="block" text={r.stem} />
        </CardHeader>
        <CardContent className="space-y-4">
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
              photos={(r.image_paths ?? []).flatMap((p) => url.get(p) ?? [])}
              actions={
                <>
                  {["marked", "reviewed"].includes(state) && (
                    <QuestionMark attemptId={r.attempt_id} />
                  )}
                  {report(r)}
                </>
              }
            />
          )}
        </CardContent>
      </Card>
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Every answer gives you a next step"
        title={`${modeLabel(s.config.mode)} sprint · ${places?.length ? places.map(name).join(", ") : "All topics"}`}
        description={`${when(s.started_at)} · ${timeMeta(elapsed, limit)}`}
        actions={
          <>
            {failed.length > 0 && (
              <RetryAnswer
                ids={failed.map((r) => r.attempt_id)}
                label={`Retry all failed (${failed.length})`}
              />
            )}
            {mistakes > 0 && (
              <Link
                href={sprintHref(s.config, { history: "mistakes" })}
                className={buttonVariants()}
              >
                Practise mistakes ({mistakes})
              </Link>
            )}
            <SameSetup config={s.config} />
            <Link
              href="/activity"
              className={buttonVariants({ variant: "ghost" })}
            >
              Back to activity
            </Link>
          </>
        }
      />
      <MarkingProgress done={done} total={rows.length} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          className="col-span-2 whitespace-nowrap sm:col-span-1"
          label={
            <span className="flex items-center gap-2">
              Score {provisional && <StatusPill pill="Provisional" />}
            </span>
          }
          value={`${provisional ? "≈ " : ""}${k.score.mark} / ${total}${scorePct == null ? "" : ` · ${Math.round(scorePct)}%`}`}
          caption={delta(scorePct, scoreAvg, " pts")}
        />
        <StatCard
          label="Time"
          value={timeMeta(elapsed, null)}
          caption={delta(minutes(elapsed), minutes(timeAvg), " min")}
        />
        {k.mcCount > 0 && (
          <StatCard
            label="Multiple choice"
            value={`${k.mc.mark} / ${k.mc.max}`}
            caption={delta(pct(k.mc), typeAvg(true), " pts")}
          />
        )}
        {k.writtenCount > 0 && (
          <StatCard
            label="Written average"
            value={
              pct(k.written) == null ? "–" : `${Math.round(pct(k.written)!)}%`
            }
            caption={delta(pct(k.written), typeAvg(false), " pts")}
          />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Overall feedback</CardTitle>
        </CardHeader>
        <CardContent>
          {s.summary ? (
            <div className="grid gap-6 md:grid-cols-3">
              {(
                [
                  ["Strengths", "strengths"],
                  ["Top fixes", "improvements"],
                  ["Next steps", "next_steps"],
                ] as const
              ).map(([label, key]) => (
                <div key={key} className="space-y-3">
                  <h3 className="font-semibold">{label}</h3>
                  <ul className="list-disc space-y-2 pl-5">
                    {(s.summary![key] ?? []).map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                  {key === "next_steps" && actionLinks}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p role="status" className="text-muted-foreground">
                {done < rows.length
                  ? "Your overall feedback will appear here once marking finishes."
                  : "An overall summary isn’t available for this sprint. Each answer’s feedback is below."}
              </p>
              {actionLinks}
            </div>
          )}
        </CardContent>
      </Card>
      {rows.length > 0 && (
        <ResultsBrowser
          initial={firstBelow(rows)}
          views={views}
          items={rows.map((r) => {
            const state = markingState(r);
            return {
              type: TYPE_LABEL[r.type],
              topic: name(r.topic_id),
              source: r.source,
              mark: scored(r) ? markLabel(r, state) : null,
              tone: scored(r)
                ? markTone(r.mark ?? 0, r.max_marks ?? r.marks)
                : "",
              pill: r.type === "mcq" ? null : statePill(state, r.review),
            };
          })}
        />
      )}
    </div>
  );
}
