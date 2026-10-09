"use client";
import { useState } from "react";
import Link from "next/link";
import { trend, type Marked, type Range } from "@/lib/home";
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

/** §3.1 score trend: daily average % as an area, the previous period dashed, MC/Short/Extended % below. */
export function ScoreTrend({ rows, today }: { rows: Marked[]; today: string }) {
  const [range, setRange] = useState<Range>("30");
  const t = trend(rows, today, range);
  const x = (day: string) =>
    PAD +
    ((Date.parse(day) - Date.parse(t.from)) /
      86_400_000 /
      Math.max(1, t.span - 1)) *
      (W - 2 * PAD);
  const y = (pct: number) => PAD + (1 - pct / 100) * (H - 2 * PAD);
  const line = (ps: { day: string; pct: number }[]) =>
    ps.map((p, i) => `${i ? "L" : "M"}${x(p.day)},${y(p.pct)}`).join("");
  const area = t.points.length
    ? `${line(t.points)}L${x(t.points.at(-1)!.day)},${H - PAD}L${x(t.points[0].day)},${H - PAD}Z`
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
      {t.points.length ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-44 w-full overflow-visible"
          aria-labelledby="score-trend-title"
          data-range={range}
        >
          <title id="score-trend-title">
            {`Score trend, ${RANGES.find((r) => r.value === range)!.label}`}
          </title>
          {[0, 50, 100].map((g) => (
            <line
              key={g}
              x1={PAD}
              x2={W - PAD}
              y1={y(g)}
              y2={y(g)}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
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
        <p className="text-muted-foreground py-10 text-center text-sm">
          No marked work in this range.
        </p>
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
