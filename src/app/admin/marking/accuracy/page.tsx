import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Target } from "@/components/icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { dateLabel } from "@/lib/practice";
import { loadAccuracy, parseRange, percentLabel } from "./data";
import { loadLatestEval } from "./eval";
import { RangeSelect } from "./range-select";
import { CategoryBar, WeeklyChart } from "./charts";
import { BreakdownTable, DisagreedQuestions } from "./tables";

export default async function AccuracyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const [data, evaluation] = await Promise.all([
    loadAccuracy(range),
    loadLatestEval(),
  ]);
  const agreed = data.mix[0].count,
    secondPass = data.mix[1].count,
    review = data.sentToReview;
  const checkedCaption = (n: number) => `${n} of ${data.checked} checked`;
  const engineLink = (
    <Link
      href="/admin/marking/engine"
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      Open Engine
    </Link>
  );
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Marking accuracy"
        description="Agreement, reviews and student disputes for written answers."
        actions={<RangeSelect range={range} />}
      />
      <p className="text-muted-foreground text-[13px]">
        {dateLabel(data.window.from)} to {dateLabel(data.window.today)} (Sydney,
        through now) · {data.written} marked written answers · {data.checked}{" "}
        checked
      </p>
      <div className="grid min-w-0 auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Check agreement"
          empty={!data.checked}
          value={percentLabel(agreed, data.checked, "No checked answers yet")}
          caption={checkedCaption(agreed)}
        />
        <StatCard
          label="Settled by second pass"
          empty={!data.checked}
          value={percentLabel(
            secondPass,
            data.checked,
            "No checked answers yet",
          )}
          caption={checkedCaption(secondPass)}
        />
        <StatCard
          label="Sent to review"
          empty={!data.checked}
          value={percentLabel(review, data.checked, "No checked answers yet")}
          caption={checkedCaption(review)}
        />
        <StatCard
          label="Override rate"
          empty={!data.comparable}
          value={percentLabel(
            data.overrides,
            data.comparable,
            "No comparable reviews yet",
          )}
          caption={
            <>
              {data.overrides} of {data.comparable} comparable resolved reviews
              <br />
              {data.meanDelta == null
                ? "No comparable marks yet"
                : `Mean |Δ| ${data.meanDelta.toFixed(2)} marks · ${data.comparable} comparable reviews`}
            </>
          }
        />
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <WeeklyChart weeks={data.weeks} kind="agreement" />
        <WeeklyChart weeks={data.weeks} kind="disputes" />
      </div>
      <CategoryBar mix={data.mix} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="By type and marks"
          heading="Type / max marks"
          rows={data.byType}
        />
        <BreakdownTable
          title="By topic"
          heading="Parent topic"
          rows={data.byTopic}
        />
      </div>
      <DisagreedQuestions rows={data.questions} />
      {evaluation ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Latest offline eval</h2>
            </CardTitle>
            <CardDescription>
              Latest full run with held-out test answers; independent of the
              selected range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-[13px]">
                  Run date (Sydney)
                </dt>
                <dd>
                  {dateLabel(evaluation.stamp.slice(0, 10))},{" "}
                  {evaluation.stamp.slice(11, 13)}:
                  {evaluation.stamp.slice(13, 15)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-[13px]">
                  Marker model
                </dt>
                <dd className="break-all">{evaluation.model}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[13px]">
                  Agreement (same band, ±1 on 6+)
                </dt>
                <dd className="tabular-nums">
                  {(evaluation.agreement! * 100).toFixed(1)}%
                  <span className="text-muted-foreground mt-1 block text-[13px]">
                    Exact mark under 6 marks; within ±1 mark on 6+
                  </span>
                  <span className="text-muted-foreground mt-1 block text-[13px]">
                    Exact mark: {(evaluation.exact! * 100).toFixed(1)}% ·{" "}
                    {evaluation.n} test answers
                  </span>
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-xs wrap-anywhere">
              {evaluation.label}
            </p>
            {engineLink}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Target}
          title="No full offline eval yet"
          description="A full run with held-out test answers will appear here."
          action={engineLink}
        />
      )}
    </div>
  );
}
