"use client";
import { useEffect, useState } from "react";
import type { McGridRow } from "@/lib/results";
import { Check, Close } from "./icons";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
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
  position?: number;
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
  mcGrid,
}: {
  items: ResultItem[];
  views: React.ReactNode[];
  initial: number;
  mcGrid?: McGridRow[];
}) {
  const [index, setIndex] = useState(initial);
  const [table, setTable] = useState(false);
  useEffect(() => {
    let active = true;
    const selectHash = () => {
      const match = /^#q-(\d+)$/.exec(window.location.hash);
      if (!match || !active) return;
      const target = items.findIndex(
        (item) => item.position === Number(match[1]),
      );
      if (target >= 0) setIndex(target);
    };
    queueMicrotask(selectHash);
    window.addEventListener("hashchange", selectHash);
    return () => {
      active = false;
      window.removeEventListener("hashchange", selectHash);
    };
  }, [items]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest("[data-comment-navigation]")) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTyping(e.target)
      )
        return;
      const step = { j: -1, k: 1 }[e.key.toLowerCase()];
      if (!step) return;
      setIndex((i) => Math.min(items.length - 1, Math.max(0, i + step)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);
  const label = (it: ResultItem, i: number) =>
    `Question ${it.position ?? i + 1}${it.mark ? `, ${it.mark} marks` : ""}${it.pill ? `, ${it.pill}` : ""}`;
  return (
    <section className="space-y-4">
      {mcGrid && mcGrid.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Multiple choice answers</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from(
                { length: Math.ceil(mcGrid.length / 5) },
                (_, group) => (
                  <Table
                    className="[&_td]:px-1 [&_th]:px-1"
                    key={group}
                    aria-label={`Multiple choice answers ${group + 1}`}
                  >
                    <TableHeader>
                      <TableRow>
                        {["Q", "Your", "Correct", "Result"].map((h) => (
                          <TableHead key={h} scope="col">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mcGrid.slice(group * 5, group * 5 + 5).map((r) => (
                        <TableRow
                          key={r.position}
                          className="cursor-pointer"
                          onClick={() => {
                            setIndex(
                              items.findIndex(
                                (it) => it.position === r.position,
                              ),
                            );
                            document
                              .getElementById("results-questions")
                              ?.scrollIntoView({ block: "start" });
                          }}
                        >
                          <TableCell>
                            <button
                              type="button"
                              aria-label={`Review question ${r.position}`}
                              className="flex min-h-9 min-w-9 items-center justify-center rounded-full border font-semibold focus-visible:ring-2"
                            >
                              {r.position}
                            </button>
                          </TableCell>
                          <TableCell>{r.your}</TableCell>
                          <TableCell>{r.correct}</TableCell>
                          <TableCell>
                            {r.right == null ? (
                              "Pending"
                            ) : (
                              <span
                                className={cn(
                                  "flex items-center gap-1 text-xs",
                                  r.right ? "text-success" : "text-destructive",
                                )}
                              >
                                {r.right ? (
                                  <Check aria-hidden className="size-4" />
                                ) : (
                                  <Close aria-hidden className="size-4" />
                                )}
                                {r.right ? "Correct" : "Incorrect"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <div
        id="results-questions"
        className="flex scroll-mt-20 flex-wrap items-center justify-between gap-3"
      >
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
        <Table aria-label="Questions">
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
                    {it.position ?? i + 1}
                  </button>
                </TableCell>
                <TableCell>{it.type}</TableCell>
                <TableCell>{it.topic}</TableCell>
                <TableCell>{it.source}</TableCell>
                <TableCell className="tabular-nums">
                  {it.mark ?? "Pending"}
                </TableCell>
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
              {it.position ?? i + 1}
            </button>
          ))}
        </nav>
      )}
      <div key={index}>{views[index]}</div>
    </section>
  );
}
