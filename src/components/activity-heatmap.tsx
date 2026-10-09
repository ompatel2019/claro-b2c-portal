"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  addDays,
  dayLabel,
  heatmapWeeks,
  monthLabels,
  shade,
  SHADE_LABELS,
  SHADES,
  type ActivityDay,
} from "@/lib/activity";
import { plural } from "@/lib/practice";
import { Card, CardContent } from "./ui/card";

const CELL = 14; // 11 px cell + 3 px gap

/** §2.3 K11: a GitHub-style year of active Sydney days, with streaks above. */
export function ActivityHeatmap({
  days,
  today,
  current,
  longest,
  link = "/student/activity?date=",
  error,
  errorContent,
}: {
  days: ActivityDay[];
  today: string;
  current: number;
  longest: number;
  /** Prefix for a day's link; the ISO date is appended. */
  link?: string;
  error?: boolean;
  errorContent?: React.ReactNode;
}) {
  const allWeeks = heatmapWeeks(today);
  const [weekCount, setWeekCount] = useState(53);
  const [offset, setOffset] = useState(0);
  const end = Math.max(weekCount, allWeeks.length - offset);
  const weeks = allWeeks.slice(Math.max(0, end - weekCount), end);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const [focus, setFocus] = useState(today);
  const lastDay = weeks.flat().findLast((day) => day !== null)!;
  const focusDay = weeks.some((week) => week.includes(focus)) ? focus : lastDay;
  const [tip, setTip] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const from = allWeeks[0][0]!;
  const active = days.filter(
    (d) => d.day >= from && d.questions + d.cards > 0,
  ).length;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      // Keep whole weeks visible, leaving room for weekday labels.
      const count = Math.max(
        1,
        Math.min(53, Math.floor((entry.contentRect.width - 32) / CELL)),
      );
      const resizedWeeks = heatmapWeeks(today);
      const nextEnd = Math.max(count, resizedWeeks.length - offset);
      const nextWeeks = resizedWeeks.slice(
        Math.max(0, nextEnd - count),
        nextEnd,
      );
      const focused = document.activeElement as HTMLElement | null;
      if (
        grid.current?.contains(focused) &&
        !nextWeeks.flat().includes(focused?.dataset.day ?? "")
      ) {
        const day = nextWeeks.flat().findLast((day) => day !== null)!;
        grid.current.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus();
      }
      setWeekCount(count);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, today, offset]);

  function move(e: React.KeyboardEvent, day: string) {
    const step = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = weeks.flat().includes(addDays(day, step))
      ? addDays(day, step)
      : day;
    setFocus(next);
    grid.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
  }

  const labels = monthLabels(weeks).filter((m, i, labels) => {
    const end = labels[i + 1]?.col ?? weeks.length;
    return (end - m.col) * CELL >= 28;
  });
  const tipDay = tip ? byDay.get(tip) : undefined;
  const [col, row] = tip
    ? [
        weeks.findIndex((w) => w.includes(tip)),
        (new Date(`${tip}T00:00:00Z`).getUTCDay() + 6) % 7,
      ]
    : [0, 0];

  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="sr-only">Activity</h2>
        {!error && (
          <p className="text-sm">
            Current streak <strong>{plural(current, "day")}</strong> · Longest{" "}
            <strong>{plural(longest, "day")}</strong> ·{" "}
            {plural(active, "active day")} in the last year
          </p>
        )}
        {error ? (
          (errorContent ?? (
            <p
              role="alert"
              className="bg-destructive-soft text-destructive rounded-xl p-3 text-sm"
            >
              We couldn’t load your activity. Refresh to try again.
            </p>
          ))
        ) : (
          <div
            ref={container}
            data-testid="activity-heatmap"
            className="min-w-0 pb-1"
          >
            <div className="relative w-max pt-5 pl-8 text-[11px]">
              {labels.map((m) => (
                <span
                  key={m.col}
                  data-month-label
                  aria-hidden
                  className="text-muted-foreground absolute top-0"
                  style={{ left: 32 + m.col * CELL }}
                >
                  {m.label}
                </span>
              ))}
              {["Mon", "Wed", "Fri"].map((d, i) => (
                <span
                  key={d}
                  aria-hidden
                  className="text-muted-foreground absolute left-0 leading-[11px]"
                  style={{ top: 20 + i * 2 * CELL }}
                >
                  {d}
                </span>
              ))}
              <div
                ref={grid}
                role="group"
                aria-label={`Activity from ${weeks[0][0]} to ${lastDay}`}
                className="grid auto-cols-[11px] grid-flow-col grid-rows-[repeat(7,11px)] gap-[3px]"
                onMouseLeave={() => setTip(null)}
              >
                {weeks.flat().map((day, i) => {
                  if (!day) return <span key={i} aria-hidden />;
                  const d = byDay.get(day);
                  const count = (d?.questions ?? 0) + (d?.cards ?? 0);
                  const label = dayLabel(day, d?.questions, d?.cards);
                  return (
                    <Link
                      key={day}
                      href={`${link}${day}`}
                      prefetch={false}
                      data-day={day}
                      aria-label={`${label} (${SHADE_LABELS[shade(count)]})`}
                      tabIndex={day === focusDay ? 0 : -1}
                      onKeyDown={(e) => move(e, day)}
                      onFocus={() => {
                        setFocus(day);
                        setTip(day);
                      }}
                      onBlur={() => setTip(null)}
                      onMouseEnter={() => setTip(day)}
                      className="focus-visible:outline-ink size-[11px] rounded-[2px] focus-visible:outline-2"
                      style={{ background: SHADES[shade(count)] }}
                    />
                  );
                })}
              </div>
              {tip && col >= 0 && (
                <div
                  role="tooltip"
                  className="bg-ink pointer-events-none absolute left-0 z-10 w-max max-w-full -translate-y-full rounded-md px-2 py-1 text-xs whitespace-normal text-white"
                  style={{
                    top: 20 + row * CELL - 4,
                  }}
                >
                  {dayLabel(tip, tipDay?.questions, tipDay?.cards)}
                </div>
              )}
            </div>
          </div>
        )}
        {!error && weekCount < allWeeks.length && (
          <div className="flex justify-between gap-2 text-xs">
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={end === weekCount}
              onClick={() =>
                setOffset(Math.min(53 - weekCount, offset + weekCount))
              }
            >
              Earlier weeks
            </button>
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={end === allWeeks.length}
              onClick={() => setOffset(Math.max(0, offset - weekCount))}
            >
              Later weeks
            </button>
          </div>
        )}
        <div className="text-muted-foreground flex flex-col-reverse items-start gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>
            {active === 0 &&
              !error &&
              "Answer a question or review a flashcard to start your streak."}
          </span>
          <span className="flex items-center gap-1" aria-hidden>
            Less
            {SHADES.map((c) => (
              <span
                key={c}
                className="size-[11px] rounded-[2px]"
                style={{ background: c }}
              />
            ))}
            More
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
