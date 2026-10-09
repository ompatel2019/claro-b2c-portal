"use client";
import { useId, useState } from "react";
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
const W = 600,
  H = 180,
  PAD = 8,
  LEFT = 60,
  BOTTOM = H - 28;
export type ScorePoint = {
  id: string;
  day: string;
  at?: string;
  pct: number;
  label: string;
  href: string | null;
};

/** Shared plot for Home's daily averages and Progress's individual sessions. */
function ScorePlot({
  points,
  previous = [],
  from,
  to,
  title,
  range,
  area = false,
  sessions = false,
}: {
  points: ScorePoint[];
  previous?: { day: string; pct: number }[];
  from: string;
  to: string;
  title: string;
  range: string;
  area?: boolean;
  sessions?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const current = points.find((p) => p.id === selected) ?? points.at(-1);
  const start = Date.parse(
    sessions ? (points[0]?.at ?? points[0]?.day ?? from) : from,
  );
  const end = Date.parse(
    sessions ? (points.at(-1)?.at ?? points.at(-1)?.day ?? to) : to,
  );
  const span = Math.max(1, end - start);
  const x = (p: { day: string; at?: string }) =>
    LEFT +
    (sessions && start === end
      ? 0.5
      : (Date.parse(p.at ?? p.day) - start) / span) *
      (W - LEFT - PAD);
  const y = (pct: number) => PAD + (1 - pct / 100) * (BOTTOM - PAD);
  const line = (ps: { day: string; at?: string; pct: number }[]) =>
    ps.map((p, i) => `${i ? "L" : "M"}${x(p)},${y(p.pct)}`).join("");
  const dot = (p: ScorePoint) => (
    <>
      <title>{p.label}</title>
      <circle cx={x(p)} cy={y(p.pct)} r={14} fill="transparent" />
      <circle
        cx={x(p)}
        cy={y(p.pct)}
        r={4}
        className="fill-primary group-focus-visible:stroke-ink stroke-white"
        strokeWidth={2}
      />
    </>
  );
  return (
    <div className="space-y-3">
      {sessions && current && (
        <div>
          <p className="text-3xl font-semibold tabular-nums">
            {Math.round(current.pct)}%
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {selected ? "Selected session" : "Latest session"}
          </p>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        data-range={range}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc
          id={`${id}-desc`}
        >{`Percentage axis: 0%, 50%, 100%. Date axis: ${from} to ${to}.`}</desc>
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
            />
          </g>
        ))}
        <text
          x={LEFT}
          y={H - 4}
          fontSize={20}
          className="fill-muted-foreground"
        >
          {dateLabel(sessions ? (points[0]?.day ?? from) : from)}
        </text>
        <text
          x={W - PAD}
          y={H - 4}
          textAnchor="end"
          fontSize={20}
          className="fill-muted-foreground"
        >
          {dateLabel(sessions ? (points.at(-1)?.day ?? to) : to)}
        </text>
        {previous.length > 1 && (
          <path
            data-testid="previous-period"
            d={line(previous)}
            fill="none"
            className="stroke-muted-foreground"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
        )}
        {area && points.length > 0 && (
          <path
            d={`${line(points)}L${x(points.at(-1)!)},${BOTTOM}L${x(points[0])},${BOTTOM}Z`}
            className="fill-primary/15"
          />
        )}
        <path
          d={line(points)}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
        />
        {points.map((p) =>
          p.href ? (
            <Link
              key={p.id}
              href={p.href}
              aria-label={p.label}
              onMouseEnter={() => setSelected(p.id)}
              onFocus={() => setSelected(p.id)}
              className="group outline-none"
            >
              {dot(p)}
            </Link>
          ) : (
            <g
              key={p.id}
              tabIndex={0}
              aria-label={p.label}
              onMouseEnter={() => setSelected(p.id)}
              onFocus={() => setSelected(p.id)}
              className="group outline-none"
            >
              {dot(p)}
            </g>
          ),
        )}
      </svg>
      {sessions && current && (
        <p
          role="tooltip"
          className="bg-muted rounded-lg px-3 py-2 text-xs leading-5"
        >
          {current.label}
        </p>
      )}
    </div>
  );
}

/** Individual finished-session scores; single-answer sessions have no report link. */
export function SessionScoreTrend({
  points,
  from,
  today,
  range,
}: {
  points: ScorePoint[];
  from: string;
  today: string;
  range: string;
}) {
  return (
    <ScorePlot
      points={points}
      from={from}
      to={today}
      title="Score history"
      range={range}
      sessions
    />
  );
}

/** §3.1 daily average % with a dashed previous period and per-type summaries. */
export function ScoreTrend({ rows, today }: { rows: Marked[]; today: string }) {
  const [range, setRange] = useState<Range>("30");
  const t = trend(rows, today, range);
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
        <ScorePlot
          points={t.points.map((p) => ({
            ...p,
            id: p.day,
            href: `/student/activity?date=${p.day}`,
            label: `${p.day}: ${Math.round(p.pct)}%`,
          }))}
          previous={t.previous}
          from={t.from}
          to={today}
          title={`Score trend, ${RANGES.find((r) => r.value === range)!.label}`}
          range={range}
          area
        />
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
                    href={`/student/activity?date=${p.day}`}
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
