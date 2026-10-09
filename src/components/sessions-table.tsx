"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cards, Sprint } from "@/components/icons";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import { dateLabel, percentage, scoreTone, timer } from "@/lib/practice";
import { sessionKind } from "@/lib/students";
import { StatusPill, type Pill } from "./status-pill";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { UrlSheet } from "./url-sheet";

export type SessionItem = {
  id: string;
  kind: string;
  study: boolean;
  title: string;
  score: number | null;
  max: number | null;
  items: string;
  elapsed_s: number;
  started_at: string;
  status: Pill;
};

const columns: Column<SessionItem>[] = [
  {
    id: "kind",
    header: "Kind",
    sort: true,
    cell: (s) => (
      <span className="inline-flex items-center gap-2">
        {s.kind === "flashcards" ? (
          <Cards aria-hidden className="text-muted-foreground size-4" />
        ) : (
          <Sprint aria-hidden className="text-muted-foreground size-4" />
        )}
        {sessionKind(s.kind)}
      </span>
    ),
  },
  { id: "title", header: "Title", sort: true, cell: (s) => s.title },
  {
    id: "score",
    header: "Score",
    sort: true,
    cell: (s) =>
      s.study ? (
        "—"
      ) : !s.max || s.score == null ? (
        "No score yet"
      ) : (
        <Badge variant={scoreTone((100 * s.score) / s.max)}>
          {percentage(s.score, s.max)}
        </Badge>
      ),
  },
  { id: "items", header: "Items", sort: true, cell: (s) => s.items },
  { id: "time", header: "Time", sort: true, cell: (s) => timer(s.elapsed_s) },
  {
    id: "date",
    header: "Date",
    sort: true,
    cell: (s) => dateLabel(s.started_at, true),
  },
  {
    id: "status",
    header: "Status",
    sort: true,
    cell: (s) => <StatusPill pill={s.status} />,
  },
  { id: "action", header: "Action", cell: () => null },
];

/** §4.3 Sessions tab: the §3.12 table, read-only; a row opens the report Sheet (?session=). */
export function SessionsTable({
  rows,
  pager,
  report,
}: {
  rows: SessionItem[];
  pager: Pager;
  /** The open session's report (server-rendered), or null when none is selected. */
  report: { title: string; body: React.ReactNode } | null;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const open = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("session", id);
    router.push(`${path}?${p}`, { scroll: false });
  };
  return (
    <>
      <DataTable
        label="Sessions"
        columns={columns.map((c) => ({
          ...c,
          className:
            c.id === "title"
              ? "max-sm:max-w-32 whitespace-normal break-words sm:min-w-48"
              : ["score", "action"].includes(c.id)
                ? "max-sm:px-2"
                : ["kind", "time"].includes(c.id)
                  ? "hidden xl:table-cell"
                  : "hidden sm:table-cell",
          cell:
            c.id === "action"
              ? (s: SessionItem) => (
                  <button
                    type="button"
                    className={buttonVariants({
                      variant: "outline",
                      size: "xs",
                    })}
                    onClick={() => open(s.id)}
                  >
                    View<span className="sr-only"> {s.title}</span>
                  </button>
                )
              : c.cell,
        }))}
        rows={rows}
        pager={pager}
        onRow={(s) => open(s.id)}
      />
      {report && (
        <UrlSheet parameter="session" title={report.title}>
          {report.body}
        </UrlSheet>
      )}
    </>
  );
}
