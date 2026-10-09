import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DailyChart } from "@/components/daily-chart";
import { EmptyState } from "@/components/empty-state";
import { Wallet } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadSpend } from "@/lib/admin-data";
import { dateLabel } from "@/lib/practice";
import { sydneyDay } from "@/lib/admin";
import { parseRange } from "./data";
import { RangeSelect } from "./range-select";
import { ModelTable, TaskTable, StudentTable } from "./tables";
import { usd } from "./helpers";

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const range = parseRange(await searchParams);
  const spend = await loadSpend(range);
  const pct = Math.min(100, (spend.all / spend.cap) * 100);
  const calls = spend.byModel.reduce((total, model) => total + model.calls, 0);
  const total = spend.byModel.reduce((total, model) => total + model.usd, 0);
  const throughNow = spend.window.to === sydneyDay(spend.window.until);
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="AI spend"
        description="AI usage and costs in USD."
        actions={<RangeSelect key={JSON.stringify(range)} range={range} />}
      />
      <p className="text-muted-foreground text-[13px]">
        {spend.window.from
          ? `${dateLabel(spend.window.from)} to ${dateLabel(spend.window.to)}`
          : "All time"}{" "}
        (Sydney{throughNow ? ", through now" : ", inclusive"}) · {calls} calls
      </p>
      <div className="grid min-w-0 auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={usd(spend.today)} caption="Sydney day" />
        <StatCard
          label="This month"
          value={usd(spend.month)}
          caption="Sydney calendar month"
        />
        <StatCard
          label="All time"
          value={`${usd(spend.all)} of $${spend.cap.toFixed(0)}`}
          caption={
            <div className="mt-2 space-y-2">
              <div
                role="progressbar"
                aria-label="Spend against cap"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={`${usd(spend.all)} of ${usd(spend.cap)}`}
                className="bg-chart-5 relative h-2 rounded-full"
              >
                <div
                  className="bg-brand h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
                {spend.markers.map((marker) => (
                  <span
                    key={marker}
                    aria-hidden="true"
                    className="bg-foreground absolute top-0 h-3 w-px"
                    style={{
                      left: `${Math.min(100, (marker / spend.cap) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <ul className="space-y-1 tabular-nums">
                {spend.markers.map((marker, index) => (
                  <li key={marker}>
                    {Math.round((marker / spend.cap) * 100)}% ·{" "}
                    {["Evals blocked", "All AI stops", "Cap"][index]}
                  </li>
                ))}
              </ul>
            </div>
          }
        />
        <StatCard
          label="Avg cost per marked written answer"
          empty={spend.avgPerMarkedWritten === null}
          value={
            spend.avgPerMarkedWritten === null
              ? "No marked written answers"
              : usd(spend.avgPerMarkedWritten)
          }
          caption="Selected range"
        />
      </div>
      {total > 0 ? (
        <DailyChart
          title="Spend per day"
          hero={usd(total)}
          kind="bars"
          points={spend.perDay.map((p) => ({
            day: p.day,
            value: p.usd,
            models: p.models,
          }))}
        />
      ) : (
        <EmptyState
          icon={Wallet}
          title="No spend in this range"
          description="Daily spend by model will appear after an AI call."
        />
      )}
      <ModelTable rows={spend.byModel} />
      <TaskTable groups={spend.byTask} />
      <StudentTable rows={spend.topStudents} />
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>
            <h2>Rate limits</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">AI calls per student</dt>
              <dd className="tabular-nums">
                {spend.limits.perMinute}/min and {spend.limits.perHour}/hour
              </dd>
              <dd className="text-muted-foreground mt-1 text-[13px]">
                Admins exempt
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mark my answer</dt>
              <dd className="tabular-nums">
                {spend.limits.markMyAnswerPerDay}/day per student (Sydney)
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Disputes</dt>
              <dd className="tabular-nums">
                {spend.limits.openDisputesPerAnswer} open per answer,{" "}
                {spend.limits.openDisputesPerStudent} open per student
              </dd>
            </div>
          </dl>
          <h3 className="text-sm font-semibold">
            Students over 150 calls in the last hour
          </h3>
          {spend.over150.length ? (
            <ul
              aria-label="Students over 150 calls"
              className="space-y-2 text-sm"
            >
              {spend.over150.map((student) => (
                <li
                  key={student.id}
                  className="flex min-w-0 justify-between gap-3"
                >
                  <Link
                    className="wrap-anywhere underline underline-offset-4"
                    href={`/admin/students/${encodeURIComponent(student.id)}`}
                  >
                    {student.name}
                  </Link>
                  <span className="shrink-0 tabular-nums">
                    {student.calls} calls
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Wallet}
              title="None right now"
              description="No student has made more than 150 AI calls in the last hour."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
