import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { studentPaperFilter } from "@/lib/papers";
import { pages } from "@/lib/flashcard-data";
import { createClient } from "@/utils/supabase/server";
import type { PaperConfig } from "@/lib/paper-session";
import type { ReviewRow } from "@/lib/feedback";
import { markingState } from "@/lib/feedback";
import { type Topic, scoreTone } from "@/lib/practice";
import {
  below,
  delta,
  resultsState,
  kpis,
  mcGridRows,
  nextActions,
  pct,
  rankLabel,
  sectionBreakdown,
  selectSit,
  sitLabel,
  timeMeta,
  visibleResults,
  type PaperRank,
} from "@/lib/results";
import { PageHeader } from "@/components/page-header";
import { SitSelect } from "@/components/results-browser";
import {
  OverallFeedback,
  ResultsAnswers,
  type OverallSummary,
} from "@/components/results-report";
import { MarkingProgress } from "@/components/marking-progress";
import { RetryAnswer } from "@/components/retry-answer";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";

type Sit = {
  id: string;
  started_at: string;
  finished_at: string | null;
  config: PaperConfig;
  score: number | null;
  max_score: number | null;
  elapsed_s: number;
  summary: OverallSummary | null;
};
export const metadata = pageMetadata("Paper results");

export default async function PaperResults({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sit?: string | string[] }>;
}) {
  const [{ id }, query, profile] = await Promise.all([
    params,
    searchParams,
    requireProfile(),
  ]);
  const db = await createClient();
  const [paperRes, sits] = await Promise.all([
    db
      .from("papers")
      .select("id,title,ranks_enabled")
      .eq("id", id)
      .or(studentPaperFilter(profile.id))
      .maybeSingle(),
    pages<Sit>((from, to) =>
      db
        .from("sessions")
        .select(
          "id,started_at,finished_at,config,score,max_score,elapsed_s,summary",
        )
        .eq("paper_id", id)
        .eq("kind", "paper")
        .eq("user_id", profile.id)
        .order("started_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (paperRes.error) throw new Error("Could not load this paper.");
  if (!paperRes.data) notFound();
  if (Array.isArray(query.sit)) notFound();
  const sit = selectSit(sits, query.sit);
  if (!sit) {
    if (!query.sit) redirect(`/student/papers/${id}`);
    notFound();
  }
  if (!sit.finished_at) redirect(`/student/papers/${id}`);
  const paper = paperRes.data;
  const first =
    [...sits]
      .filter((s) => s.finished_at)
      .sort(
        (a, b) =>
          a.finished_at!.localeCompare(b.finished_at!) ||
          a.id.localeCompare(b.id),
      )[0]?.id === sit.id;
  const [reviewRes, topicRes, rankRes] = await Promise.all([
    db.rpc("session_review", { p_session: sit.id }),
    db.from("topics").select("id,parent_id,name,sort"),
    paper.ranks_enabled && first
      ? db.rpc("paper_rank", { p_paper: id })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (reviewRes.error || topicRes.error || rankRes.error)
    throw new Error("Could not load your results.");
  const allRows = (reviewRes.data ?? []) as ReviewRow[];
  const rows = visibleResults(allRows);
  const topics = (topicRes.data ?? []) as Topic[];
  const topicIds = [...new Set(rows.flatMap((r) => r.topic_id ?? []))];
  const paths = rows.flatMap((r) => r.image_paths ?? []);
  const [cardsRes, signedRes] = await Promise.all([
    topicIds.length
      ? db.from("flashcards").select("topic_id").in("topic_id", topicIds)
      : Promise.resolve({ data: [], error: null }),
    paths.length
      ? db.storage.from("answers").createSignedUrls(paths, 3600)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cardsRes.error || signedRes.error)
    throw new Error("Could not load your results.");
  const cards: Record<string, number> = {};
  for (const c of cardsRes.data ?? [])
    cards[c.topic_id] = (cards[c.topic_id] ?? 0) + 1;
  const photos = new Map(
    (signedRes.data ?? []).map((p) => [p.path, p.signedUrl]),
  );
  const name = (tid: string | null) =>
    topics.find((t) => t.id === tid)?.name ?? "";
  const k = kpis(rows);
  const progress = resultsState(rows, sit.summary);
  const { done } = progress;
  const provisional = rows.some((r) => markingState(r) === "in_review");
  const failed = rows.filter((r) => markingState(r) === "failed");
  const sections = sectionBreakdown(
    sit.config.sections,
    allRows,
    sit.config.time_limit_min,
  );
  const rank = rankLabel(
    paper.ranks_enabled,
    (rankRes.data?.[0] ?? null) as PaperRank | null,
    first,
  );
  const mistakes = rows.filter(below);
  const subtopics = [...new Set(mistakes.flatMap((r) => r.topic_id ?? []))];
  const actions = nextActions(rows, "mixed", topics, cards);
  const sectionSummaries = sit.summary?.sections;
  const feedbackSections = Array.isArray(sectionSummaries)
    ? sectionSummaries.map((s) => [s.section, s] as const)
    : Object.entries(sectionSummaries ?? {});
  const previous = selectSit(
    sits.filter((s) => s.finished_at && s.finished_at < sit.finished_at!),
  );
  const previousPct =
    previous?.score != null && previous.max_score
      ? (previous.score / previous.max_score) * 100
      : null;
  const percentage =
    sit.score != null && sit.max_score
      ? Math.round((sit.score / sit.max_score) * 100)
      : null;
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Paper results"
        title={paper.title}
        description={`${sitLabel(sit, sits)} · ${timeMeta(sit.elapsed_s, (sit.config.time_limit_min + sit.config.reading_min) * 60)}`}
        actions={
          <>
            <SitSelect
              paperId={id}
              value={sit.id}
              sits={sits
                .filter((s) => s.finished_at)
                .map((s) => ({ id: s.id, label: sitLabel(s, sits) }))}
            />
            {failed.length > 0 && (
              <RetryAnswer
                ids={failed.map((r) => r.attempt_id)}
                label={`Retry all failed (${failed.length})`}
              />
            )}
            {mistakes.length > 0 && (
              <Link
                className={buttonVariants()}
                href={`/student/sprint?${new URLSearchParams({ type: "mixed", history: "mistakes", ...(subtopics.length ? { sub: subtopics.join(",") } : {}) })}`}
              >
                Practise mistakes ({mistakes.length})
              </Link>
            )}
            <Link
              href={`/student/papers/${id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Sit again
            </Link>
            <Link
              href="/student/papers"
              className={buttonVariants({ variant: "ghost" })}
            >
              Back to papers
            </Link>
          </>
        }
      />
      <MarkingProgress key={sit.id} {...progress} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          className="col-span-2 sm:col-span-1"
          label={
            <span className="flex flex-wrap items-center gap-2">
              Score {provisional && <StatusPill pill="Provisional" />}
            </span>
          }
          value={
            sit.score == null ||
            done === 0 ||
            rows.some(
              (r) => r.status === "marked" && r.check_status === "pending",
            )
              ? progress.marking
                ? "Marking"
                : "No marks yet"
              : `${provisional ? "≈ " : ""}${sit.score} / ${sit.max_score ?? "Pending"}${percentage == null ? "" : ` · ${percentage}%`}`
          }
          caption={
            progress.marking
              ? "Marking in progress"
              : delta(percentage, previousPct, " pts", "your previous sit")
          }
        />
        <StatCard
          label="Time"
          value={timeMeta(sit.elapsed_s, null)}
          caption={delta(
            sit.elapsed_s / 60,
            previous ? previous.elapsed_s / 60 : null,
            " min",
            "your previous sit",
          )}
        />
        {k.mcCount > 0 && (
          <StatCard
            label="Multiple choice"
            value={
              k.mc.max
                ? `${k.mc.mark} / ${k.mc.max}`
                : progress.marking
                  ? "Marking"
                  : "No marks yet"
            }
          />
        )}
        {k.writtenCount > 0 && (
          <StatCard
            label="Written average"
            value={
              pct(k.written) == null
                ? "No marks yet"
                : `${Math.round(pct(k.written)!)}%`
            }
          />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Section breakdown</h2>
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Suggested times are estimates based on section marks. Time used per
            section wasn’t recorded.
          </p>
        </CardHeader>
        <CardContent>
          <Table aria-label="Section breakdown">
            <TableHeader>
              <TableRow>
                {[
                  "Section",
                  "Marks",
                  "Out of",
                  "%",
                  "Time suggested vs used",
                ].map((h) => (
                  <TableHead key={h} scope="col">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="whitespace-normal">
                    <span className="font-semibold">{s.name}</span>
                    {s.notChosen.length > 0 && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Not chosen: {s.notChosen.map((p) => `Q${p}`).join(", ")}
                      </p>
                    )}
                    {s.pending && (
                      <p className="text-muted-foreground text-xs">
                        Marking in progress
                      </p>
                    )}
                    {s.provisional && <StatusPill pill="Provisional" />}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s.mark == null
                      ? s.pending
                        ? "Pending"
                        : "Unavailable"
                      : `${s.provisional ? "≈ " : ""}${s.mark}`}
                  </TableCell>
                  <TableCell className="tabular-nums">{s.outOf}</TableCell>
                  <TableCell>
                    {s.percentage == null ? (
                      s.pending ? (
                        "Pending"
                      ) : (
                        "Unavailable"
                      )
                    ) : (
                      <Badge variant={scoreTone(s.percentage)}>
                        {Math.round(s.percentage)}%
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.suggestedMin} min suggested
                    <br />
                    <span className="text-muted-foreground text-xs">
                      Used: not recorded
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {(!feedbackSections.length ||
        sit.summary?.strengths ||
        sit.summary?.improvements ||
        sit.summary?.top_fixes ||
        sit.summary?.next_steps) && (
        <OverallFeedback
          summary={sit.summary}
          pending={progress.summaryPending}
          context="paper"
          actions={actions}
        />
      )}
      {feedbackSections.map(([section, summary]) => (
        <OverallFeedback
          key={section}
          section={section}
          summary={summary}
          pending={false}
          actions={nextActions(
            rows.filter((r) =>
              sit.config.sections.some(
                (s) => s.position === r.position && s.section === section,
              ),
            ),
            "mixed",
            topics,
            cards,
          )}
        />
      ))}
      {rank && (
        <Card>
          <CardHeader>
            <CardTitle>Your first sit rank</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{rank}</p>
          </CardContent>
        </Card>
      )}
      <ResultsAnswers
        key={sit.id}
        rows={rows}
        id={sit.id}
        name={name}
        photos={photos}
        mcGrid={mcGridRows(rows)}
      />
    </div>
  );
}
