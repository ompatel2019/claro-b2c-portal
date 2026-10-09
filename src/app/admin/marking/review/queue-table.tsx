"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markManually, retryMarking } from "./actions";
import type { QueueRow } from "./data";
import { ageLabel, reasons } from "./shared";

export function QueueTable({
  rows,
  failed,
}: {
  rows: QueueRow[];
  failed: boolean;
}) {
  const columns: Column<QueueRow>[] = [
    {
      id: "age",
      header: "Age",
      sort: (r) => r.created,
      cell: (r) =>
        failed ? (
          ageLabel(r.created)
        ) : (
          <Link className="underline" href={`/admin/marking/review/${r.id}`}>
            {ageLabel(r.created)}
          </Link>
        ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: (r) =>
        r.reason === "failed" || r.reason === "unreadable" ? (
          <StatusPill
            pill={
              r.reason === "failed" ? "Couldn't mark" : "Couldn't read photo"
            }
          />
        ) : (
          <Badge variant="outline">{reasons[r.reason]}</Badge>
        ),
    },
    {
      id: "student",
      header: "Student",
      cell: (r) => (
        <Link
          className="block max-w-20 truncate underline"
          title={r.name}
          href={`/admin/students/${r.userId}`}
        >
          {r.name}
        </Link>
      ),
    },
    {
      id: "question",
      header: "Question",
      cell: (r) => {
        const content = (
          <div className="w-28" title={`${r.source}: ${r.stem}`}>
            <span className="block truncate font-medium">{r.source}</span>
            <span className="text-muted-foreground block truncate">
              {r.stem.slice(0, 60)}
              {r.stem.length > 60 ? "…" : ""}
            </span>
          </div>
        );
        return failed ? (
          content
        ) : (
          <Link className="block" href={`/admin/marking/review/${r.id}`}>
            {content}
          </Link>
        );
      },
    },
    { id: "ai", header: "AI mark", cell: (r) => r.ai ?? "—" },
    { id: "check", header: "Check mark", cell: (r) => r.check ?? "—" },
    {
      id: "delta",
      header: "Δ",
      cell: (r) =>
        r.ai != null && r.check != null ? Number(r.check) - Number(r.ai) : "—",
    },
    {
      id: "note",
      header: "Student note",
      cell: (r) =>
        r.note ? (
          <span className="block w-20 truncate" title={r.note}>
            {r.note.slice(0, 80)}
            {r.note.length > 80 ? "…" : ""}
          </span>
        ) : (
          "—"
        ),
    },
  ];
  if (failed)
    columns.push({
      id: "actions",
      header: "Actions",
      cell: (r) => (
        <div className="flex flex-wrap gap-2">
          {r.reason === "failed" && (
            <form action={retryMarking.bind(null, r.attemptId)}>
              <Button size="sm" variant="outline" type="submit">
                Retry marking
              </Button>
            </form>
          )}
          {r.photos.map((url, i) => (
            <a
              key={url}
              className="text-sm underline"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              View photo{r.photos.length > 1 ? ` ${i + 1}` : ""}
            </a>
          ))}
          <form action={markManually.bind(null, r.attemptId)}>
            <Button size="sm" variant="outline" type="submit">
              Mark manually
            </Button>
          </form>
        </div>
      ),
    });
  return (
    <div
      className="min-w-0 overflow-x-auto rounded-lg"
      role="region"
      aria-label="Review table, scroll horizontally"
      tabIndex={0}
    >
      <div className="min-w-[740px] [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-normal">
        <DataTable columns={columns} rows={rows} label="Marking review queue" />
      </div>
    </div>
  );
}
