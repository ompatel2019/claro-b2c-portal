"use client";
import { useState } from "react";
import { dateLabel } from "@/lib/practice";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const W = 600;
const H = 160;
const PAD = 8;
const LEFT = 88;
const BOTTOM = H - 24;

/** K10 ChartCard for a fixed 30-day window: title, hero number, an area or bars per Sydney day. */
export function DailyChart({
  title,
  hero,
  points,
  kind,
}: {
  title: string;
  hero: string;
  points: { day: string; value: number }[];
  kind: "area" | "bars";
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const format = (v: number) =>
    kind === "bars" ? `$${v.toFixed(2)}` : String(v);
  const current = points.find((p) => p.day === selected) ?? points.at(-1);
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = (W - LEFT - PAD) / Math.max(1, points.length);
  const x = (i: number) => LEFT + (i + 0.5) * step;
  const y = (v: number) => PAD + (1 - v / max) * (BOTTOM - PAD);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`)
    .join("");
  const bar = Math.max(2, step * 0.6);
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <p className="text-2xl font-semibold tabular-nums">{hero}</p>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full overflow-visible"
          role="img"
          aria-label={`${title}, last 30 days`}
        >
          {[0, max].map((g) => (
            <g key={g}>
              <text
                x={LEFT - 8}
                y={y(g)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={18}
                className="fill-muted-foreground"
              >
                {format(g)}
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
          {points.length > 0 && (
            <>
              <text
                x={LEFT}
                y={H - 4}
                fontSize={18}
                className="fill-muted-foreground"
              >
                {dateLabel(points[0].day)}
              </text>
              <text
                x={W - PAD}
                y={H - 4}
                textAnchor="end"
                fontSize={18}
                className="fill-muted-foreground"
              >
                {dateLabel(points.at(-1)!.day)}
              </text>
            </>
          )}
          {kind === "area" && points.length > 1 && (
            <>
              <path
                d={`${line}L${x(points.length - 1)},${BOTTOM}L${x(0)},${BOTTOM}Z`}
                className="fill-primary/15"
              />
              <path
                d={line}
                fill="none"
                className="stroke-primary"
                strokeWidth={2}
              />
            </>
          )}
          {points.map((p, i) => (
            <g
              key={p.day}
              onMouseEnter={() => setSelected(p.day)}
              onClick={() => setSelected(p.day)}
            >
              <title>{`${dateLabel(p.day, true)} · ${format(p.value)}`}</title>
              {kind === "bars" ? (
                <rect
                  x={x(i) - bar / 2}
                  y={y(p.value)}
                  width={bar}
                  height={BOTTOM - y(p.value)}
                  rx={1.5}
                  className="fill-primary"
                />
              ) : (
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r={8}
                  className="hover:fill-primary/30 fill-transparent"
                />
              )}
            </g>
          ))}
        </svg>
        {current && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="text-muted-foreground flex items-center gap-2">
              Day
              <select
                aria-label={`${title} day`}
                className="field h-9 w-auto bg-white py-0"
                value={current.day}
                onChange={(e) => setSelected(e.target.value)}
              >
                {points.map((p) => (
                  <option key={p.day} value={p.day}>
                    {dateLabel(p.day, true)}
                  </option>
                ))}
              </select>
            </label>
            <output className="font-medium tabular-nums" aria-live="polite">
              {format(current.value)}
            </output>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
