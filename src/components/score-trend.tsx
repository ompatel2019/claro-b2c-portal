"use client";
import { useState } from "react";
import Link from "next/link";
import { trend, type Marked, type Range } from "@/lib/home";
import { dateLabel } from "@/lib/practice";
import { TYPE_LABEL } from "@/lib/results";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
const W = 600;
const H = 180;
const PAD = 8;
const LEFT = 60;
const BOTTOM = H - 28;

/** §3.1 score trend: daily average % as an area, the previous period dashed, MC/Short/Extended % below. */
export function ScoreTrend({ rows, today }: { rows: Marked[]; today: string }) {
  const [range, setRange] = useState<Range>("30");
  const t = trend(rows, today, range);
  const x = (day: string) =>
    LEFT +
    ((Date.parse(day) - Date.parse(t.from)) /
      86_400_000 /
      Math.max(1, t.span - 1)) *
      (W - LEFT - PAD);
  const y = (pct: number) => PAD + (1 - pct / 100) * (BOTTOM - PAD);
  const line = (ps: { day: string; pct: number }[]) =>
    ps.map((p, i) => `${i ? "L" : "M"}${x(p.day)},${y(p.pct)}`).join("");
  const area = t.points.length
    ? `${line(t.points)}L${x(t.points.at(-1)!.day)},${BOTTOM}L${x(t.points[0].day)},${BOTTOM}Z`
    : "";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-[13px]">
          Daily average of marked work
        </p>
        <Select
          items={RANGES}
          value={range}
          onValueChange={(v) => setRange(v as Range)}
        >
          <SelectTrigger aria-label="Range" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {t.points.length >= 3 ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-44 w-full overflow-visible"
          aria-labelledby="score-trend-title"
          aria-describedby="score-trend-description"
          data-range={range}
        >
          <title id="score-trend-title">
            {`Score trend, ${RANGES.find((r) => r.value === range)!.label}`}
          </title>
          <desc id="score-trend-description">
            {`Percentage axis: 0%, 50%, 100%. Date axis: ${t.from} to ${today}.`}
          </desc>
          {[0, 50, 100].map((g) => (
            <g key={g}>
              <text
                x={LEFT - 8}
                y={y(g)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={20}
                className="fill-muted-foreground"
              >
                {g}%
              </text>
              <line
                x1={LEFT}
                x2={W - PAD}
                y1={y(g)}
                y2={y(g)}
                className="stroke-border"
                strokeWidth={1}
              />
            </g>
          ))}
          <text
            x={LEFT}
            y={H - 4}
            fontSize={20}
            className="fill-muted-foreground"
          >
            {dateLabel(t.from)}
          </text>
          <text
            x={W - PAD}
            y={H - 4}
            textAnchor="end"
            fontSize={20}
            className="fill-muted-foreground"
          >
            {dateLabel(today)}
          </text>
          {t.previous.length > 1 && (
            <path
              data-testid="previous-period"
              d={line(t.previous)}
              fill="none"
              className="stroke-muted-foreground"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          )}
          <path d={area} className="fill-primary/15" />
          <path
            d={line(t.points)}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
          />
          {t.points.map((p) => (
            <Link
              key={p.day}
              href={`/activity?date=${p.day}`}
              aria-label={`${p.day}: ${Math.round(p.pct)}%`}
              className="group outline-none"
            >
              <circle cx={x(p.day)} cy={y(p.pct)} r={14} fill="transparent" />
              <circle
                cx={x(p.day)}
                cy={y(p.pct)}
                r={4}
                className="fill-primary group-focus-visible:stroke-ink stroke-white"
                strokeWidth={2}
              />
            </Link>
          ))}
        </svg>
      ) : (
        <div className="space-y-3 py-10 text-center text-sm">
          <p className="text-muted-foreground">
            {t.points.length
              ? "Mark work on at least 3 days to see a trend."
              : "No marked work in this range."}
          </p>
          {t.points.length > 0 && (
            <ul className="space-y-2">
              {t.points.map((p) => (
                <li key={p.day}>
                  <Link
                    href={`/activity?date=${p.day}`}
                    className="underline underline-offset-4"
                  >
                    {p.day}: {Math.round(p.pct)}%
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-3 text-sm">
        {t.byType.map((b) => (
          <div key={b.type}>
            <dt className="text-muted-foreground text-[13px]">
              {b.type === "mcq" ? "MC" : TYPE_LABEL[b.type].split(" ")[0]}
            </dt>
            <dd className="font-semibold tabular-nums">
              {b.pct == null ? "No marks yet" : `${Math.round(b.pct)}%`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
