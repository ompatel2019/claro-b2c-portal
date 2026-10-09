import { pageMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  loadProgress,
  loadProgressActivity,
  progressToday,
} from "@/lib/progress-data";
import {
  parseRange,
  rangeFrom,
  weakSpots,
  masterySegments,
  reportHref,
  verbRows,
  PROGRESS_RANGES,
  type ProgressRange,
} from "@/lib/progress";
import { sessionTitle } from "@/lib/home";
import { sydneyToday } from "@/lib/flashcards";
import { dateLabel, timer, plural } from "@/lib/practice";
import { PageHeader } from "@/components/page-header";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { SessionScoreTrend } from "@/components/score-trend";
import { ProgressControls } from "@/components/progress-controls";
import {
  ProgressScore,
  TopicProgressTable,
  VerbProgressTable,
} from "@/components/progress-tables";
import { EmptyState as Empty } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { TryAgain } from "@/components/try-again";
import {
  Cards,
  Target,
  History,
  CheckCircle,
  Clock,
  Alert,
  Dot,
} from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function Section({
  title,
  children,
  caption,
}: {
  title: string;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <Card className="min-w-0 gap-4">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {caption && (
          <p className="text-muted-foreground text-[13px]">{caption}</p>
        )}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
function CardSkeleton() {
  return (
    <Card className="min-w-0 p-5">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-44 w-full" />
    </Card>
  );
}

type Scope = { range: ProgressRange; today: string };
async function Stats({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Your progress">
        <TryAgain what="your stats" />
      </Section>
    );
  const s = d.stats,
    label = PROGRESS_RANGES.find((r) => r.value === range)!.label;
  return (
    <div
      className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&_dd]:[overflow-wrap:anywhere]"
      data-testid="progress-stats"
      data-range={range}
    >
      <StatCard label="Questions answered" value={s.answered} caption={label} />
      <StatCard
        label="Average mark"
        value={s.pct === null ? "No marks yet" : `${Math.round(s.pct)}%`}
        empty={s.pct === null}
        caption={
          s.pct === null ? (
            "Finish a sprint to see your average"
          ) : (
            <ProgressScore pct={s.pct} />
          )
        }
      />
      <StatCard
        label="Marks earned"
        value={s.possible ? `${s.earned} / ${s.possible}` : "No marks yet"}
        empty={!s.possible}
        caption="Earned / possible"
      />
      <StatCard
        label="Active days"
        value={s.active}
        caption="Questions and flashcards"
      />
    </div>
  );
}
async function Heatmap({ userId, today }: { userId: string; today: string }) {
  const d = await loadProgressActivity(userId, today).catch(() => null);
  return (
    <ActivityHeatmap
      today={today}
      days={d?.days ?? []}
      current={d?.current_streak ?? 0}
      longest={d?.longest_streak ?? 0}
      error={!d}
      errorContent={<TryAgain what="your activity" />}
    />
  );
}
async function HistoryCard({
  range,
  today,
  kind,
  type,
}: Scope & { kind?: string; type?: string }) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Score history">
        <TryAgain what="your score history" />
      </Section>
    );
  const sessions = d.history.filter(
    (s) => (!kind || s.kind === kind) && (!type || s.by_type[type] != null),
  );
  const points = sessions.flatMap((s) => {
    const pct = type ? s.by_type[type] : s.pct;
    return pct === null
      ? []
      : [
          {
            id: s.id,
            day: sydneyToday(new Date(s.finished_at)),
            at: s.finished_at,
            pct,
            href: reportHref(s),
            label: `${sessionTitle(s, d.topics)} · ${dateLabel(s.finished_at, true)} · ${Math.round(pct)}% · ${timer(s.elapsed_s)}`,
          },
        ];
  });
  return (
    <Section
      title="Score history"
      caption="Each finished session, in the order you completed it."
    >
      <ProgressControls range={range} filters />
      {points.length ? (
        <div className="mt-4">
          <SessionScoreTrend
            points={points}
            from={rangeFrom(range, today) ?? points[0].day}
            today={today}
            range={range}
          />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">
              View {plural(points.length, "session")}
            </summary>
            <ul className="mt-3 divide-y divide-dashed">
              {points.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {p.href ? (
                      <Link
                        href={p.href}
                        className="text-sm underline underline-offset-4"
                      >
                        {p.label}
                      </Link>
                    ) : (
                      <span>{p.label}</span>
                    )}
                  </div>
                  <StatusPill pill="Finished" />
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <div className="mt-4">
          <Empty
            title="No scores in this range"
            description="Finish a sprint to see your score history, or choose another range or filter."
            icon={History}
          />
        </div>
      )}
    </Section>
  );
}
async function Topics({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Marks by topic">
        <TryAgain what="marks by topic" />
      </Section>
    );
  return (
    <Section
      title="Marks by topic"
      caption="Open a section to explore its subtopics."
    >
      {!d.topics.some((t) => t.possible > 0) && (
        <div className="mb-4">
          <Empty
            icon={Target}
            title="No topic marks yet"
            description="Finish a sprint to see marks by topic."
          />
        </div>
      )}
      <TopicProgressTable rows={d.topics} />
    </Section>
  );
}
async function Types({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="By question type">
        <TryAgain what="marks by question type" />
      </Section>
    );
  if (!d.types.length)
    return (
      <Empty
        icon={Target}
        title="By question type"
        description="Finish a sprint to see where each question type earns marks."
      />
    );
  return (
    <Section title="By question type">
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["mcq", "MC"],
          ["short", "Short"],
          ["extended", "Extended"],
        ].map(([id, label]) => {
          const t = d.types.find((t) => t.id === id);
          return (
            <div key={id} className="min-w-0">
              <dt className="text-muted-foreground text-[13px]">{label}</dt>
              <dd className="mt-2">
                <ProgressScore pct={t?.pct ?? null} />
              </dd>
              <dd className="text-muted-foreground mt-2 text-xs">
                {plural(t?.answered ?? 0, "answer")}
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}
async function Verbs({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="By directive verb">
        <TryAgain what="marks by verb" />
      </Section>
    );
  if (!verbRows(d.verbs).length)
    return (
      <Empty
        icon={Target}
        title="By directive verb"
        description="Answer at least 3 questions with the same directive verb to see a comparison."
      />
    );
  return (
    <Section
      title="By directive verb"
      caption="Verbs with at least 3 answers. Start with your lowest average."
    >
      <VerbProgressTable rows={d.verbs} />
    </Section>
  );
}
async function Weak({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Weak spots">
        <TryAgain what="your weak spots" />
      </Section>
    );
  const rows = weakSpots(d.topics, d.missed);
  if (!rows.length)
    return (
      <Empty
        icon={Target}
        title="Weak spots"
        description="Topics below 60% appear after 3 answers, alongside cards rated Missed or Mostly."
      />
    );
  return (
    <Section
      title="Weak spots"
      caption="Practise missed questions, or choose Missed last time in the flashcard builder."
    >
      <ul className="divide-y divide-dashed">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="text-muted-foreground mt-1 text-xs">{r.caption}</p>
            </div>
            <Link
              href={r.href}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "shrink-0",
              })}
            >
              {r.action}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
const CATEGORY_STYLE = {
  Known: ["bg-success", CheckCircle],
  Learning: ["bg-warning", Clock],
  Missed: ["bg-destructive", Alert],
  New: ["bg-muted-foreground/30", Dot],
} as const;
async function Mastery({ range, today }: Scope) {
  const d = await loadProgress(range, today).catch(() => null);
  if (!d)
    return (
      <Section title="Flashcard mastery">
        <TryAgain what="flashcard mastery" />
      </Section>
    );
  if (!d.mastery.length)
    return (
      <Empty
        title="Flashcard mastery"
        description="Review cards to see your mastery. New cards appear in the range they were added."
        icon={Cards}
      />
    );
  const max = Math.max(1, ...d.due.map((d) => d.count));
  return (
    <Section
      title="Flashcard mastery"
      caption="Latest ratings recorded in this range, plus new cards added in it."
    >
      <div className="space-y-6">
        {d.mastery.map((m) => (
          <div key={m.id}>
            <h3 className="text-sm font-semibold">
              {m.id === "term" ? "Terms" : "Key stats"}
            </h3>
            <div
              role="img"
              aria-label={masterySegments(m)
                .map((s) => `${s.label}: ${s.count}`)
                .join(", ")}
              className="bg-muted mt-3 flex h-3 overflow-hidden rounded-full"
            >
              {masterySegments(m).map((s) => (
                <span
                  key={s.label}
                  className={CATEGORY_STYLE[s.label][0]}
                  style={{ width: `${s.width}%` }}
                />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {masterySegments(m).map((s) => {
                const Icon = CATEGORY_STYLE[s.label][1];
                return (
                  <li key={s.label} className="flex items-center gap-1.5">
                    <Icon className="size-3" aria-hidden />
                    {s.label}{" "}
                    <span className="ml-auto font-semibold tabular-nums">
                      {s.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-sm font-semibold">Due in the next 7 days</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Today includes overdue cards rated in this range.
          </p>
          <div className="mt-4 grid grid-cols-7 gap-2">
            {d.due.map((day, i) => (
              <div key={day.day} className="min-w-0 text-center">
                <p className="text-xs tabular-nums">{day.count}</p>
                <div className="mt-2 flex h-16 items-end justify-center">
                  <div
                    className="bg-primary w-full max-w-8 rounded-t-sm"
                    style={{ height: `${(day.count / max) * 100}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-[10px]">
                  {i === 0 ? "Today" : dateLabel(day.day, true).split(" ")[0]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

export const metadata = pageMetadata("Progress");

export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile(),
    p = await searchParams;
  const range = parseRange(p.range),
    today = progressToday(),
    scope = { range, today };
  const kind =
    typeof p.kind === "string" && ["sprint", "paper", "single"].includes(p.kind)
      ? p.kind
      : undefined;
  const type =
    typeof p.type === "string" && ["mcq", "short", "extended"].includes(p.type)
      ? p.type
      : undefined;
  return (
    <div
      className="min-w-0 space-y-4"
      data-testid="progress-page"
      data-range={range}
    >
      <PageHeader
        eyebrow="Your long view"
        title="Progress"
        description="See where your marks come from and make your next session count."
        actions={<ProgressControls range={range} />}
      />
      <Suspense
        key={`stats-${range}`}
        fallback={
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        }
      >
        <Stats {...scope} />
      </Suspense>
      <Suspense fallback={<CardSkeleton />}>
        <Heatmap userId={profile.id} today={today} />
      </Suspense>
      <Suspense
        key={`history-${range}-${kind}-${type}`}
        fallback={<CardSkeleton />}
      >
        <HistoryCard {...scope} kind={kind} type={type} />
      </Suspense>
      <Suspense key={`topics-${range}`} fallback={<CardSkeleton />}>
        <Topics {...scope} />
      </Suspense>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Suspense key={`types-${range}`} fallback={<CardSkeleton />}>
            <Types {...scope} />
          </Suspense>
          <Suspense key={`verbs-${range}`} fallback={<CardSkeleton />}>
            <Verbs {...scope} />
          </Suspense>
        </div>
        <Suspense key={`weak-${range}`} fallback={<CardSkeleton />}>
          <Weak {...scope} />
        </Suspense>
      </div>
      <Suspense key={`mastery-${range}`} fallback={<CardSkeleton />}>
        <Mastery {...scope} />
      </Suspense>
    </div>
  );
}
