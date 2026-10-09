import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Target } from "@/components/icons";
import { dateLabel } from "@/lib/practice";
import type { Week } from "./data";
import { percentage } from "./helpers";

export const statusLabels = ["Agreed", "Second pass", "In review", "Reviewed"];
const colours = ["bg-success", "bg-warning", "bg-destructive", "bg-primary"];
export function WeeklyChart({
  weeks,
  kind,
}: {
  weeks: Week[];
  kind: "agreement" | "disputes";
}) {
  const agreement = kind === "agreement";
  const title = agreement
    ? "Agreement per week"
    : "Disputes per 100 written answers";
  const points = weeks.map((w) => ({
    ...w,
    value: agreement
      ? percentage(w.agreed, w.checked)
      : percentage(w.disputes, w.written),
  }));
  const hasData = points.some((p) => p.value != null);
  const W = 600,
    H = 220,
    LEFT = 64,
    RIGHT = 16,
    TOP = 12,
    BOTTOM = 176;
  const maximum = agreement
    ? 100
    : Math.max(1, Math.ceil(Math.max(...points.map((p) => p.value ?? 0))));
  const x = (i: number) =>
    LEFT + (i / Math.max(1, points.length - 1)) * (W - LEFT - RIGHT);
  const y = (value: number) => TOP + (1 - value / maximum) * (BOTTOM - TOP);
  const line = points
    .map((p, i) =>
      p.value == null
        ? ""
        : `${i > 0 && points[i - 1].value != null ? "L" : "M"}${x(i)},${y(p.value)}`,
    )
    .join(" ");
  const summary = points
    .map(
      (p) =>
        `Week of ${dateLabel(p.day)}: ${p.value == null ? (agreement ? "no checked answers" : "no written answers") : `${p.value.toFixed(1)}${agreement ? "%" : " per 100"}`}`,
    )
    .join("; ");
  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>
          Monday-start weeks in Sydney; first and last weeks may be partial.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative flex-1">
        {!hasData ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center text-center">
            {agreement ? "No checked answers yet" : "No written answers yet"}
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${title}. ${summary}`}
              className="h-auto w-full"
            >
              {[0, maximum / 2, maximum].map((tick) => (
                <g key={tick}>
                  <text
                    x={LEFT - 8}
                    y={y(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={18}
                    className="fill-muted-foreground"
                  >
                    {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                    {agreement ? "%" : ""}
                  </text>
                  <line
                    x1={LEFT}
                    x2={W - RIGHT}
                    y1={y(tick)}
                    y2={y(tick)}
                    className="stroke-border"
                  />
                </g>
              ))}
              <path
                d={line}
                fill="none"
                className="stroke-primary"
                strokeWidth={2}
              />
              {points.map((p, i) =>
                p.value == null ? null : (
                  <circle
                    key={p.day}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={4}
                    className="fill-primary"
                  >
                    <title>{`Week of ${dateLabel(p.day)}: ${p.value.toFixed(1)}${agreement ? "%" : " per 100"}; ${agreement ? `${p.agreed} of ${p.checked} checked` : `${p.disputes} disputes / ${p.written} written answers`}`}</title>
                  </circle>
                ),
              )}
              <text
                x={LEFT}
                y={H - 12}
                fontSize={18}
                className="fill-muted-foreground"
              >
                {dateLabel(points[0].day)}
              </text>
              {points.length > 1 && (
                <text
                  x={W - RIGHT}
                  y={H - 12}
                  textAnchor="end"
                  fontSize={18}
                  className="fill-muted-foreground"
                >
                  {dateLabel(points.at(-1)!.day)}
                </text>
              )}
            </svg>
            <div className="sr-only">
              <table>
                <caption>{title}</caption>
                <thead>
                  <tr>
                    <th scope="col">Week starting (Sydney)</th>
                    <th scope="col">Value</th>
                    <th scope="col">Numerator</th>
                    <th scope="col">Denominator</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.day}>
                      <th scope="row">{p.day}</th>
                      <td>
                        {p.value == null
                          ? "No answers"
                          : `${p.value.toFixed(1)}${agreement ? "%" : " per 100"}`}
                      </td>
                      <td>{agreement ? p.agreed : p.disputes}</td>
                      <td>{agreement ? p.checked : p.written}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
export function CategoryBar({
  mix,
}: {
  mix: { status: string; count: number }[];
}) {
  const total = mix.reduce((sum, part) => sum + part.count, 0);
  if (!total)
    return (
      <EmptyState
        icon={Target}
        title="No checked answers yet"
        description="The check status mix will appear once written answers have been checked."
      />
    );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Check status mix</h2>
        </CardTitle>
        <CardDescription>{total} checked written answers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="img"
          aria-label={mix
            .map(
              (p, i) =>
                `${statusLabels[i]}: ${p.count} (${((p.count / total) * 100).toFixed(1)}%)`,
            )
            .join("; ")}
          className="flex h-5 w-full overflow-hidden rounded-full"
        >
          {mix.map((p, i) => (
            <div
              key={p.status}
              className={colours[i]}
              style={{ width: `${(p.count / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {mix.map((p, i) => (
            <li key={p.status} className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${colours[i]}`}
              />
              <span>{statusLabels[i]}</span>
              <span className="ml-auto tabular-nums">
                {p.count} · {((p.count / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
