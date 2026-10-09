"use client";
import { DataTable, type Column } from "@/components/data-table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { durationLabel, runDateLabel, type RunSummary } from "./summary";

const numberLabel = (value: number | null, percent = false) =>
  value == null ? (
    <span title="No comparable marks">—</span>
  ) : percent ? (
    `${(value * 100).toFixed(1)}%`
  ) : (
    value.toFixed(2)
  );
const columns: Column<RunSummary>[] = [
  {
    id: "date",
    className: "px-1.5",
    header: "Date",
    sort: (r) => r.stamp,
    cell: (r) => (
      <div className="w-28 whitespace-normal">
        <span>{runDateLabel(r.stamp)}</span>
        <span className="text-muted-foreground mt-1 block max-w-64 text-xs wrap-anywhere whitespace-normal">
          {r.label}
          {r.subset && <span className="ml-1 font-medium">· subset</span>}
        </span>
      </div>
    ),
  },
  {
    id: "model",
    className: "px-1.5",
    header: "Model",
    sort: (r) => r.model,
    cell: (r) => (
      <span title={r.model} className="block max-w-32 whitespace-normal">
        {r.model.replace(/^[^/]+\//, "")}
      </span>
    ),
  },
  {
    id: "thinking",
    className: "px-1.5",
    header: "Thinking",
    sort: (r) => r.thinking ?? null,
    cell: (r) => (
      <span className="block max-w-24 whitespace-normal">
        {r.thinking?.split("/").join("/\u200b") ?? "Not recorded"}
      </span>
    ),
  },
  {
    id: "passes",
    className: "px-1.5",
    header: "Passes",
    sort: (r) => r.passes,
    cell: (r) => (
      <span className="block max-w-16 whitespace-normal">{r.passes}</span>
    ),
  },
  {
    id: "items",
    className: "text-right tabular-nums px-1.5",
    header: "Items",
    sort: (r) => r.items,
    cell: (r) => (
      <span>
        {r.items}
        <span className="text-muted-foreground block max-w-16 text-xs whitespace-normal">
          {r.n} comparable
        </span>
      </span>
    ),
  },
  {
    id: "exact",
    className: "text-right tabular-nums px-1.5",
    header: "Exact %",
    sort: (r) => r.exact,
    cell: (r) => numberLabel(r.exact, true),
  },
  {
    id: "agreement",
    className: "text-right tabular-nums px-1.5",
    header: "Agree %",
    sort: (r) => r.agreement,
    cell: (r) => numberLabel(r.agreement, true),
  },
  {
    id: "mean",
    className: "text-right tabular-nums px-1.5",
    header: "Mean |Δ|",
    sort: (r) => r.meanDelta,
    cell: (r) => numberLabel(r.meanDelta),
  },
  {
    id: "total",
    className: "text-right tabular-nums px-1.5",
    header: "Total |Δ|",
    sort: (r) => r.totalDelta,
    cell: (r) => numberLabel(r.totalDelta),
  },
  {
    id: "cost",
    className: "text-right tabular-nums px-1.5",
    header: "Cost",
    sort: (r) => r.cost,
    cell: (r) => `$${r.cost.toFixed(4)}`,
  },
  {
    id: "duration",
    className: "text-right tabular-nums px-1.5",
    header: "Marking time",
    sort: (r) => r.seconds,
    cell: (r) => (
      <span title="summed per answer">{durationLabel(r.seconds)}</span>
    ),
  },
  {
    id: "by",
    className: "px-1.5",
    header: "By",
    sort: (r) => r.by,
    cell: (r) => r.by,
  },
];
export function RunsTable({ rows }: { rows: RunSummary[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Eval runs</h2>
        </CardTitle>
        <CardDescription>
          Dates are Sydney time. Same band; within ±1 mark on 6+. Metrics use
          all valid marks and expectations; cost includes judging. CLI marking
          time is summed per answer across 6 concurrent workers.
          Grade/check/reconcile thinking is shown when efforts differ.
        </CardDescription>
      </CardHeader>
      <DataTable label="Eval runs" rows={rows} columns={columns} />
    </Card>
  );
}
