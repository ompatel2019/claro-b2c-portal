"use client";
import { useState } from "react";
import { dateLabel } from "@/lib/practice";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const W = 600;
const H = 160;
const PAD = 8;
const LEFT = 88;
const BOTTOM = H - 24;
const colours = [
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--success)",
];

/** K10 ChartCard: title, hero number, an area or stacked bars per Sydney day. */
export function DailyChart({
  title,
  hero,
  points,
  kind,
}: {
  title: string;
  hero: string;
  points: { day: string; value: number; models?: Record<string, number> }[];
  kind: "area" | "bars";
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const format = (v: number) =>
    kind === "bars" ? `$${v.toFixed(2)}` : String(v);
  const current = points.find((p) => p.day === selected) ?? points.at(-1);
  const models = [
    ...new Set(points.flatMap((p) => Object.keys(p.models ?? {}))),
  ].sort();
  const max = Math.max(
    kind === "bars" ? 0.01 : 1,
    ...points.map((p) => p.value),
  );
  const step = (W - LEFT - PAD) / Math.max(1, points.length);
  const x = (i: number) => LEFT + (i + 0.5) * step;
  const y = (v: number) => PAD + (1 - v / max) * (BOTTOM - PAD);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`)
    .join("");
  const bar = step * 0.6;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <p className="text-2xl font-semibold tabular-nums">{hero}</p>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full max-w-[600px]"
          role="img"
          aria-label={
            models.length
              ? `${title}, Sydney dates, stacked by model`
              : `${title}, last 30 days`
          }
        >
          {[0, max].map((g) => (
            <g key={g}>
              <text
                x={LEFT - 8}
                y={y(g)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[22px] sm:text-[18px]"
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
                className="fill-muted-foreground text-[22px] sm:text-[18px]"
              >
                {dateLabel(points[0].day)}
              </text>
              <text
                x={W - PAD}
                y={H - 4}
                textAnchor="end"
                className="fill-muted-foreground text-[22px] sm:text-[18px]"
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
              <title>{`${dateLabel(p.day)} (Sydney) · ${format(p.value)}`}</title>
              {kind === "bars" ? (
                models.length ? (
                  models.map((model, index) => {
                    const value = p.models?.[model] ?? 0;
                    const base = models
                      .slice(0, index)
                      .reduce((sum, name) => sum + (p.models?.[name] ?? 0), 0);
                    return (
                      <rect
                        key={model}
                        x={x(i) - bar / 2}
                        y={y(base + value)}
                        width={bar}
                        height={y(base) - y(base + value)}
                        fill={colours[index % colours.length]}
                      >
                        <title>{`${dateLabel(p.day)} (Sydney) · ${model}: ${format(value)}`}</title>
                      </rect>
                    );
                  })
                ) : (
                  <rect
                    x={x(i) - bar / 2}
                    y={y(p.value)}
                    width={bar}
                    height={BOTTOM - y(p.value)}
                    rx={1.5}
                    className="fill-primary"
                  />
                )
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
        {models.length > 0 && (
          <ul
            aria-label="Models"
            className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"
          >
            {models.map((model, index) => (
              <li
                key={model}
                className="flex max-w-full min-w-0 shrink-0 items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: colours[index % colours.length] }}
                />
                <span className="min-w-0 wrap-anywhere">{model}</span>
              </li>
            ))}
          </ul>
        )}
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
                    {dateLabel(p.day)}
                  </option>
                ))}
              </select>
            </label>
            <output className="font-medium tabular-nums" aria-live="polite">
              {format(current.value)}
              {models.map((model) => (
                <span key={model} className="ml-2 inline-block wrap-anywhere">
                  {model}: {format(current.models?.[model] ?? 0)}
                </span>
              ))}
            </output>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
