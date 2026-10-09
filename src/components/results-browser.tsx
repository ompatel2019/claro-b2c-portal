"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isTyping } from "./session-shell";
import { StatusPill, type Pill } from "./status-pill";
import { Toggle } from "./ui/toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

export type ResultItem = {
  type: string;
  topic: string;
  source: string;
  mark: string | null;
  tone: string;
  pill: Pill | null;
};

/** §3.4 question strip (or compact table) and the selected question; J / K move between questions. */
export function ResultsBrowser({
  items,
  views,
  initial,
}: {
  items: ResultItem[];
  views: React.ReactNode[];
  initial: number;
}) {
  const [index, setIndex] = useState(initial);
  const [table, setTable] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const step = { j: -1, k: 1 }[e.key.toLowerCase()];
      if (!step) return;
      setIndex((i) => Math.min(items.length - 1, Math.max(0, i + step)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);
  const label = (it: ResultItem, i: number) =>
    `Question ${i + 1}${it.mark ? `, ${it.mark} marks` : ""}${it.pill ? `, ${it.pill}` : ""}`;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Your answers</h2>
        <Toggle
          variant="outline"
          size="sm"
          pressed={table}
          onPressedChange={setTable}
        >
          Table view
        </Toggle>
      </div>
      {table ? (
        <Table>
          <TableHeader>
            <TableRow>
              {["#", "Type", "Topic", "Source", "Mark", "Status"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, i) => (
              <TableRow
                key={i}
                aria-selected={i === index}
                className="aria-selected:bg-accent cursor-pointer"
                onClick={() => setIndex(i)}
              >
                <TableCell>
                  <button
                    type="button"
                    aria-label={label(it, i)}
                    className="font-medium"
                  >
                    {i + 1}
                  </button>
                </TableCell>
                <TableCell>{it.type}</TableCell>
                <TableCell>{it.topic}</TableCell>
                <TableCell>{it.source}</TableCell>
                <TableCell className="tabular-nums">{it.mark ?? "–"}</TableCell>
                <TableCell>
                  {it.pill && <StatusPill pill={it.pill} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <nav aria-label="Questions" className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              title={it.pill ?? undefined}
              aria-label={label(it, i)}
              aria-current={i === index ? "true" : undefined}
              onClick={() => setIndex(i)}
              className={cn(
                "size-9 rounded-full border bg-white text-sm font-medium tabular-nums",
                it.tone,
                i === index && "ring-primary ring-2 ring-offset-2",
              )}
            >
              {i + 1}
            </button>
          ))}
        </nav>
      )}
      <div key={index}>{views[index]}</div>
    </section>
  );
}
