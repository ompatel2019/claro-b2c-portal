import Link from "next/link";
import { Suspense } from "react";
import { Alert, CheckCircle, History, Users } from "@/components/icons";
import { requireAdmin } from "@/lib/auth";
import { loadDashboard } from "@/lib/admin-data";
import { ago } from "@/lib/admin";
import { modeLabel, percentage, plural, scoreTone } from "@/lib/practice";
import { DailyChart } from "@/components/daily-chart";
import { EmptyState } from "@/components/empty-state";
import { LatestSessions } from "@/components/latest-sessions";
import { PageHeader } from "@/components/page-header";
import { Delta, StatCard } from "@/components/stat-card";
import { TryAgain } from "@/components/try-again";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const usd = (n: number) => `$${n.toFixed(2)}`;
const Skeleton = ({ className }: { className: string }) => (
  <Card aria-hidden className={`bg-muted animate-pulse ${className}`} />
);

async function Dashboard() {
  await requireAdmin();
  const d = await loadDashboard().catch(() => null);
  if (!d)
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            "Active students, 7 days",
            "Sessions, 7 days",
            "Open reviews",
            "Spend this month",
          ].map((title) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TryAgain what="this" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            "Sessions per day",
            "AI spend per day",
            "Latest finished sessions",
            "Needs attention",
          ].map((title) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TryAgain what="this" />
              </CardContent>
            </Card>
          ))}
        </div>
      </>
    );
  const pct = Math.round((100 * d.spend.all) / d.spend.cap);
  const attention = [
    [
      d.openReviews.count,
      "open mark reviews",
      "/admin/marking/review?tab=open",
    ],
    [
      d.attention.failed,
      "failed or unreadable marks in the last 7 days",
      "/admin/marking/review?tab=failed",
    ],
    [d.attention.newFeedback, "new feedback", "/admin/feedback?status=new"],
    [
      d.attention.contentReports,
      "content reports not resolved",
      "/admin/feedback?kind=content&status=unresolved",
    ],
    [
      d.attention.importReview,
      "drafts in import review",
      "/admin/content/questions?tab=import-review",
    ],
    [
      d.spend.all >= d.spend.cap * 0.8 ? 1 : 0,
      `spend at ${pct}% of the cap`,
      "/admin/spend",
    ],
    [
      d.attention.agreement != null && d.attention.agreement < 85 ? 1 : 0,
      `check agreement ${(Math.floor((d.attention.agreement ?? 0) * 10) / 10).toFixed(1)}% this week`,
      "/admin/marking/accuracy",
    ],
  ] as const;
  const rows = attention.filter(([n]) => n > 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students, 7 days"
          value={d.active.now}
          caption={
            <Delta d={d.active.now - d.active.prev}>
              vs {d.active.prev} previous 7
            </Delta>
          }
        />
        <StatCard label="Sessions, 7 days" value={d.sessionsWeek} />
        <StatCard
          label="Open reviews"
          value={d.openReviews.count}
          caption={
            d.openReviews.oldestDays == null
              ? "Nothing waiting"
              : `oldest ${plural(d.openReviews.oldestDays, "day")}`
          }
        />
        <StatCard
          label="Spend this month"
          value={`${usd(d.spend.month)} of $${d.spend.cap}`}
          caption={
            <span
              role="progressbar"
              aria-label="All-time spend against cap"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, pct)}
              aria-valuetext={`${usd(d.spend.all)} of $${d.spend.cap} (${pct}%)`}
              className="bg-chart-5 mt-1 block h-1.5 overflow-hidden rounded-full"
            >
              <span
                className="bg-brand block h-full"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </span>
          }
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DailyChart
          title="Sessions per day"
          hero={plural(d.sessionsTotal, "session")}
          points={d.sessionsPerDay}
          kind="area"
        />
        <DailyChart
          title="AI spend per day"
          hero={usd(d.spendTotal)}
          points={d.spendPerDay}
          kind="bars"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-3">
          <h2>Latest finished sessions</h2>
          {d.students === 0 ? (
            <EmptyState
              icon={Users}
              title="No students yet"
              description="Sessions appear here once students sign up and finish a sprint."
            />
          ) : !d.latest.length ? (
            <EmptyState
              icon={History}
              title="No finished sessions yet"
              description="Finished sessions will appear here."
            />
          ) : (
            <LatestSessions
              rows={d.latest.map((s) => ({
                id: s.id,
                user_id: s.user_id,
                name: s.name,
                kind:
                  s.kind === "flashcards"
                    ? "Flashcards"
                    : s.kind === "paper"
                      ? "Paper"
                      : s.kind === "single"
                        ? "Mark my answer"
                        : `${modeLabel(s.mode ?? undefined)} sprint`,
                score: percentage(s.score, s.max),
                tone:
                  s.max && s.score != null
                    ? scoreTone((100 * s.score) / s.max)
                    : null,
                when: ago(s.finished_at),
                finished_at: s.finished_at,
              }))}
            />
          )}
        </section>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length ? (
              <ul className="divide-y divide-dashed">
                {rows.map(([n, text, href]) => (
                  <li key={href + text}>
                    <Link
                      href={href}
                      className="hover:bg-surface -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm"
                    >
                      <Badge variant="warning">
                        <Alert className="size-3" />
                        {n}
                      </Badge>
                      <span>{text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <CheckCircle className="size-4 shrink-0" />
                All clear. Nothing needs attention right now.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function AdminHome() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description="Students, sessions, reviews and spend at a glance."
      />
      <Suspense
        fallback={
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </>
        }
      >
        <Dashboard />
      </Suspense>
    </div>
  );
}
