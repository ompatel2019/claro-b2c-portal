"use client";
import Link from "next/link";
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
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>By model</h2>
        </CardTitle>
      </CardHeader>
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
          ...(["input_tokens", "cached_tokens", "output_tokens"] as const).map(
            (id, i) => ({
              id,
              header: ["Input", "Cached", "Output tokens"][i],
              cell: (r: Spend["byModel"][number]) =>
                r[id].toLocaleString("en-AU"),
              sort: (r: Spend["byModel"][number]) => r[id],
              className: `hidden xl:table-cell ${numberClass}`,
            }),
          ),
          {
            id: "usd",
            header: "USD",
            cell: (r) => usd(r.usd),
            sort: (r) => r.usd,
            className: numberClass,
          },
        ]}
      />
    </Card>
  );
}
export function TaskTable({ groups }: { groups: Spend["byTask"] }) {
  const rows = groups
    .flatMap((g) => g.tasks)
    .map((r) => ({ ...r, id: r.task }));
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
        <Table aria-label="Task subtotals">
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead className={numberClass}>Calls</TableHead>
              <TableHead className={numberClass}>USD</TableHead>
              <TableHead className={`hidden sm:table-cell ${numberClass}`}>
                Avg per call
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.name} className="font-medium">
                <TableCell className={labelClass}>
                  {g.name === "Marking" ? "Marking only" : g.name}
                </TableCell>
                <TableCell className={numberClass}>{g.calls}</TableCell>
                <TableCell className={numberClass}>{usd(g.usd)}</TableCell>
                <TableCell className={`hidden sm:table-cell ${numberClass}`}>
                  {g.avgPerCall === null ? "No calls" : avgUsd(g.avgPerCall)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <DataTable
        label="By task"
        rows={rows}
        columns={[
          {
            id: "task",
            header: "Task",
            cell: (r) => r.task,
            sort: (r) => r.task,
            className: labelClass,
          },
          {
            id: "calls",
            header: "Calls",
            cell: (r) => r.calls.toLocaleString("en-AU"),
            sort: (r) => r.calls,
            className: numberClass,
          },
          {
            id: "usd",
            header: "USD",
            cell: (r) => usd(r.usd),
            sort: (r) => r.usd,
            className: numberClass,
          },
          {
            id: "avg",
            header: "Avg per call",
            cell: (r) => avgUsd(r.avgPerCall),
            sort: (r) => r.avgPerCall,
            className: `hidden sm:table-cell ${numberClass}`,
          },
        ]}
      />
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
            className: numberClass,
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
    </Card>
  );
}
