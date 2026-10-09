"use client";
import { useState } from "react";
import { ChevronDown } from "@/components/icons";
import { Button } from "./button";
import { addDays } from "@/lib/activity";
import { cn } from "@/lib/utils";

/** Compact day picker; UTC is used for calendar arithmetic, never the browser's timezone. */
export function Calendar({
  value,
  onChange,
  today,
  label,
}: {
  value: string;
  onChange: (day: string) => void;
  today: string;
  label: string;
}) {
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const first = `${month}-01`;
  const start = addDays(
    first,
    -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7),
  );
  const move = (n: number) => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  return (
    <div role="group" aria-label={label} className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Previous month"
          onClick={() => move(-1)}
        >
          <ChevronDown aria-hidden className="size-4 rotate-90" />
        </Button>
        <span className="font-semibold" aria-live="polite">
          {new Date(`${first}T00:00:00Z`).toLocaleDateString("en-AU", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Next month"
          onClick={() => move(1)}
        >
          <ChevronDown aria-hidden className="size-4 -rotate-90" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="text-muted-foreground text-center text-xs"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((day) => (
          <button
            key={day}
            type="button"
            aria-label={day}
            aria-pressed={day === value}
            aria-current={day === today ? "date" : undefined}
            onClick={() => onChange(day)}
            className={cn(
              "h-8 rounded-md text-xs focus-visible:outline-2 focus-visible:outline-offset-2",
              day === value ? "bg-ink text-white" : "hover:bg-muted",
              day.slice(0, 7) !== month && "text-muted-foreground",
            )}
          >
            {Number(day.slice(-2))}
          </button>
        ))}
      </div>
    </div>
  );
}
