"use client";
import Link from "next/link";
import { useState } from "react";
import { sortRows, type Sorting } from "@/lib/admin";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Wallet } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { computeSpend } from "./data";
import { usd, avgUsd } from "./helpers";

type Spend = ReturnType<typeof computeSpend>;
const numberClass = "text-right tabular-nums";
const labelClass = "w-full max-w-0 whitespace-normal wrap-anywhere";

export function ModelTable({ rows }: { rows: Spend["byModel"] }) {
  if (!rows.length)
    return (
      <EmptyState
        icon={Wallet}
        title="No model spend yet"
        description="Model calls and token usage in this range will appear here."
      />
    );
  return (
    <Card className="@container min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>By model</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          label="By model"
          rows={rows.map((r) => ({ ...r, id: r.model }))}
          columns={[
            {
              id: "model",
              header: "Model",
              cell: (r) => r.model,
              sort: (r) => r.model,
              className: labelClass,
            },
            {
              id: "calls",
              header: "Calls",
              cell: (r) => r.calls.toLocaleString("en-AU"),
              sort: (r) => r.calls,
              className: numberClass,
            },
            ...(
              ["input_tokens", "cached_tokens", "output_tokens"] as const
            ).map((id, i) => ({
              id,
              header: ["Input", "Cached", "Output tokens"][i],
              cell: (r: Spend["byModel"][number]) =>
                r[id].toLocaleString("en-AU"),
              sort: (r: Spend["byModel"][number]) => r[id],
              className: `hidden @min-[640px]:table-cell ${numberClass}`,
            })),
            {
              id: "usd",
              header: "USD",
              cell: (r) => usd(r.usd),
              sort: (r) => r.usd,
              className: `${numberClass} pr-5`,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
export function TaskTable({ groups }: { groups: Spend["byTask"] }) {
  const [sorting, setSorting] = useState<Sorting | null>(null);
  const columns = [
    { id: "task", header: "Task", className: labelClass },
    { id: "calls", header: "Calls", className: numberClass },
    { id: "usd", header: "USD", className: numberClass },
    {
      id: "avgPerCall",
      header: "Avg per call",
      className: `hidden sm:table-cell ${numberClass}`,
    },
  ] as const;
  const rows = groups.flatMap((g) => g.tasks);
  if (!rows.length)
    return (
      <EmptyState
        icon={Wallet}
        title="No task spend yet"
        description="Marking, admin and eval calls in this range will appear here."
      />
    );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>By task</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label="By task">
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={column.className}
                  aria-sort={
                    sorting?.id === column.id
                      ? sorting.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="uppercase"
                    onClick={() =>
                      setSorting(
                        sorting?.id !== column.id
                          ? { id: column.id, dir: "asc" }
                          : sorting.dir === "asc"
                            ? { id: column.id, dir: "desc" }
                            : null,
                      )
                    }
                  >
                    {column.header}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {groups.map((g) => {
            const sortBy = columns.find((c) => c.id === sorting?.id)?.id;
            const tasks =
              sorting && sortBy
                ? sortRows(g.tasks, (r) => r[sortBy], sorting.dir)
                : g.tasks;
            return (
              <TableBody key={g.name}>
                <TableRow className="bg-muted/50 font-medium">
                  <TableHead scope="rowgroup" className={labelClass}>
                    {g.name === "Marking" ? "Marking only" : g.name}
                  </TableHead>
                  <TableCell className={numberClass}>
                    {g.calls.toLocaleString("en-AU")}
                  </TableCell>
                  <TableCell className={numberClass}>{usd(g.usd)}</TableCell>
                  <TableCell className={`hidden sm:table-cell ${numberClass}`}>
                    {g.avgPerCall === null ? "No calls" : avgUsd(g.avgPerCall)}
                  </TableCell>
                </TableRow>
                {tasks.map((task) => (
                  <TableRow key={task.task}>
                    <TableCell className={`${labelClass} pl-6`}>
                      {task.task}
                    </TableCell>
                    <TableCell className={numberClass}>
                      {task.calls.toLocaleString("en-AU")}
                    </TableCell>
                    <TableCell className={numberClass}>
                      {usd(task.usd)}
                    </TableCell>
                    <TableCell
                      className={`hidden sm:table-cell ${numberClass}`}
                    >
                      {avgUsd(task.avgPerCall)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            );
          })}
        </Table>
      </CardContent>
    </Card>
  );
}
export function StudentTable({ rows }: { rows: Spend["topStudents"] }) {
  if (!rows.length)
    return (
      <EmptyState
        icon={Wallet}
        title="No student spend in the last 30 days"
        description="The ten students with the highest spend will appear here."
      />
    );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Top students, 30 days</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          label="Top students, 30 days"
          rows={rows}
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (r) => (
                <Link
                  href={`/admin/students/${encodeURIComponent(r.id)}`}
                  className="underline underline-offset-4"
                >
                  {r.name}
                </Link>
              ),
              sort: (r) => r.name,
              className: labelClass,
            },
            {
              id: "calls",
              header: "Calls",
              cell: (r) => r.calls,
              sort: (r) => r.calls,
              className: numberClass,
            },
            {
              id: "usd",
              header: "USD",
              cell: (r) => usd(r.usd),
              sort: (r) => r.usd,
              className: `${numberClass} pr-5`,
            },
            {
              id: "percent",
              header: "% of spend",
              cell: (r) => `${r.percent.toFixed(1)}%`,
              sort: (r) => r.percent,
              className: `hidden sm:table-cell ${numberClass}`,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
