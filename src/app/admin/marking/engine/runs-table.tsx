"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { sortRows, type Column } from "@/components/data-table";
import type { Sorting } from "@/lib/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    className: "px-1 whitespace-normal wrap-anywhere",
    header: "Date",
    sort: (r) => r.sortStamp,
    cell: (r) => (
      <div className="whitespace-normal">
        <span>
          {runDateLabel(r.stamp)}
          {r.status && r.status !== "completed" && (
            <Badge variant="outline">{r.status}</Badge>
          )}
        </span>
        <span className="text-muted-foreground mt-1 block max-w-64 text-[10px] wrap-anywhere whitespace-normal">
          {r.label}
          {r.subset && <span className="ml-1 font-medium">· subset</span>}
        </span>
      </div>
    ),
  },
  {
    id: "model",
    className: "px-1 whitespace-normal wrap-anywhere",
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
    className: "px-1 whitespace-normal wrap-anywhere",
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
    className: "px-1 whitespace-normal wrap-anywhere",
    header: "Passes",
    sort: (r) => r.passes,
    cell: (r) => (
      <span className="block max-w-16 whitespace-normal">{r.passes}</span>
    ),
  },
  {
    id: "items",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Items",
    sort: (r) => r.items,
    cell: (r) => (
      <span>
        {r.items}
        {r.n !== r.items && (
          <span
            className="text-muted-foreground block text-[10px] whitespace-nowrap"
            title={`${r.n} items with valid marks and expectations used for comparison metrics`}
          >
            {r.n} scored
          </span>
        )}
      </span>
    ),
  },
  {
    id: "exact",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Exact %",
    sort: (r) => r.exact,
    cell: (r) => numberLabel(r.exact, true),
  },
  {
    id: "agreement",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Agree %",
    sort: (r) => r.agreement,
    cell: (r) => numberLabel(r.agreement, true),
  },
  {
    id: "mean",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Mean |Δ|",
    sort: (r) => r.meanDelta,
    cell: (r) => numberLabel(r.meanDelta),
  },
  {
    id: "total",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Total |Δ|",
    sort: (r) => r.totalDelta,
    cell: (r) => numberLabel(r.totalDelta),
  },
  {
    id: "cost",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Cost",
    sort: (r) => r.cost,
    cell: (r) => `$${r.cost.toFixed(4)}`,
  },
  {
    id: "duration",
    className: "text-right tabular-nums px-1 whitespace-normal wrap-anywhere",
    header: "Duration",
    sort: (r) => r.seconds,
    cell: (r) => (
      <span
        title={r.web ? "elapsed duration" : "Marking time: summed per answer"}
      >
        {durationLabel(r.seconds)}
        {!r.web && (
          <span className="text-muted-foreground block text-[10px]">
            Marking time
          </span>
        )}
      </span>
    ),
  },
  {
    id: "by",
    className: "px-1 whitespace-normal wrap-anywhere",
    header: "By",
    sort: (r) => r.by,
    cell: (r) => r.by,
  },
];
export function RunsTable({ rows }: { rows: RunSummary[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const selection = (row: RunSummary) => (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        aria-label={`Select ${row.label} (${row.id})`}
        checked={selected.includes(row.id)}
        disabled={selected.length === 2 && !selected.includes(row.id)}
        onChange={() =>
          setSelected((current) =>
            current.includes(row.id)
              ? current.filter((id) => id !== row.id)
              : current.length < 2
                ? [...current, row.id]
                : current,
          )
        }
      />
      <span>Select</span>
    </label>
  );
  const [sorting, setSorting] = useState<Sorting | null>(null);
  const sortBy = columns.find((c) => c.id === sorting?.id)?.sort;
  const shown =
    sorting && typeof sortBy === "function"
      ? sortRows(rows, sortBy, sorting.dir)
      : rows;
  const toggle = (id: string) =>
    setSorting((current) =>
      current?.id !== id
        ? { id, dir: "asc" }
        : current.dir === "asc"
          ? { id, dir: "desc" }
          : null,
    );
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
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Select two runs ({selected.length}/2)</span>
          <Button
            disabled={selected.length !== 2}
            onClick={() =>
              router.push(
                `/admin/marking/engine?tab=runs&a=${encodeURIComponent(selected[0])}&b=${encodeURIComponent(selected[1])}`,
              )
            }
          >
            Compare
          </Button>
        </div>
      </CardHeader>
      <div data-testid="runs-region" className="min-w-0">
        <ul aria-label="Eval runs" className="divide-y px-4 md:hidden">
          {shown.map((row) => (
            <li
              key={row.id}
              className="min-w-0 space-y-2 py-4 text-sm wrap-anywhere"
            >
              {selection(row)}
              {columns[0].cell(row)}
              <div>{columns[1].cell(row)}</div>
              <div className="text-muted-foreground flex flex-wrap gap-x-4 text-xs">
                <span>Thinking: {row.thinking ?? "Not recorded"}</span>
                <span>Passes: {row.passes}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {columns.slice(4).map((column) => (
                  <div key={column.id} className="min-w-0">
                    <dt className="text-muted-foreground text-xs">
                      {column.id === "duration" ? "Time" : column.header}
                    </dt>
                    <dd className="tabular-nums">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden md:block [&_td]:px-1 [&_th]:px-1">
          <Table aria-label="Eval runs" className="table-fixed text-xs">
            <colgroup>
              {[16, 13, 9, 8, 6, 7, 7, 7, 7, 8, 7, 5].map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
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
                      className="w-full [text-align:inherit] whitespace-normal text-inherit"
                      onClick={() => toggle(column.id)}
                    >
                      {column.header}
                      {sorting?.id === column.id && (
                        <span aria-hidden="true">
                          {sorting.dir === "asc" ? " ↑" : " ↓"}
                        </span>
                      )}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      {column.id === "date" && selection(row)}
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
