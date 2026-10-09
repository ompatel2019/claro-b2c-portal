"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, CheckCircle, Clock, ChevronDown, ChevronUp } from "./icons";
import { DataTable, type Column, type TableSorting } from "./data-table";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { dateLabel, scoreTone } from "@/lib/practice";
import {
  practiseHref,
  verbRows,
  type TopicProgress,
  type Breakdown,
} from "@/lib/progress";

/** Keep the compact topic and verb tables shareable without duplicating table sorting. */
function useTableSort(key: string, columns: string[]) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const [id, dir] = (params.get(key) ?? "").split(":");
  const sorting: TableSorting =
    columns.includes(id) && (dir === "asc" || dir === "desc")
      ? { id, dir }
      : null;
  return {
    sorting,
    onSortChange(next: TableSorting) {
      const query = new URLSearchParams(params.toString());
      if (next) query.set(key, `${next.id}:${next.dir}`);
      else query.delete(key);
      router.replace(`${pathname}${query.size ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
  };
}

export function ProgressScore({
  pct,
  bar = false,
}: {
  pct: number | null;
  bar?: boolean;
}) {
  if (pct === null)
    return <span className="text-muted-foreground text-xs">No marks yet</span>;
  const tone = scoreTone(pct);
  const Icon =
    tone === "success" ? CheckCircle : tone === "warning" ? Clock : Alert;
  const word =
    tone === "success"
      ? "Strong"
      : tone === "warning"
        ? "Building"
        : "Needs practice";
  return (
    <div className="flex flex-col gap-1.5">
      <Badge variant={tone}>
        <Icon aria-hidden />
        {Math.round(pct)}%<span className="sr-only"> · {word}</span>
      </Badge>
      {bar && (
        <div
          className="bg-muted h-1.5 w-16 overflow-hidden rounded-full"
          aria-hidden
        >
          <div
            className={`h-full rounded-full ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive"}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function TopicProgressTable({ rows }: { rows: TopicProgress[] }) {
  const sort = useTableSort("topicsSort", [
    "name",
    "answered",
    "marks",
    "pct",
    "last",
  ]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const parents = rows.filter((r) => !r.parent_id);
  const columns: Column<TopicProgress>[] = [
    {
      id: "name",
      header: "Topic",
      sort: (r) => r.name,
      className: "w-full min-w-0 max-w-[10rem] whitespace-normal",
      cell: (r) =>
        r.parent_id ? (
          <span className="block py-2 pl-2">{r.name}</span>
        ) : (
          <button
            className="flex w-full items-center gap-2 py-2 text-left font-semibold"
            aria-expanded={open.has(r.id)}
            aria-controls={open.has(r.id) ? `topic-${r.id}` : undefined}
            onClick={() =>
              setOpen((s) => {
                const next = new Set(s);
                if (next.has(r.id)) next.delete(r.id);
                else next.add(r.id);
                return next;
              })
            }
          >
            {open.has(r.id) ? (
              <ChevronUp className="size-4 shrink-0" />
            ) : (
              <ChevronDown className="size-4 shrink-0" />
            )}
            {r.name}
          </button>
        ),
    },
    {
      id: "answered",
      header: "Answered",
      sort: (r) => r.answered,

      cell: (r) => r.answered,
    },
    {
      id: "marks",
      header: "Marks",
      sort: (r) => r.earned,

      cell: (r) => `${r.earned} / ${r.possible}`,
    },
    {
      id: "pct",
      header: "%",
      sort: (r) => r.pct,
      cell: (r) =>
        r.possible ? (
          <ProgressScore pct={r.pct} bar />
        ) : (
          <span className="text-muted-foreground text-xs whitespace-normal">
            Not started
          </span>
        ),
    },
    {
      id: "last",
      header: "Last practised",
      sort: (r) => r.last_answered,

      cell: (r) =>
        r.last_answered ? dateLabel(r.last_answered, true) : "Not started",
    },
    {
      id: "action",
      header: "",
      cell: (r) => (
        <Link
          aria-label={`${r.answered ? "Practise" : "Start"} ${r.name}`}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "px-2",
          })}
          href={practiseHref(r)}
        >
          {r.answered ? "Practise" : "Start"}
        </Link>
      ),
    },
  ];
  return (
    <DataTable
      student
      {...sort}
      label="Marks by topic"
      columns={columns}
      rows={parents}
      renderDetail={(r) =>
        open.has(r.id) ? (
          <div id={`topic-${r.id}`} className="bg-surface p-2">
            <DataTable
              student
              {...sort}
              label={`${r.name} subtopics`}
              columns={columns}
              rows={rows.filter((t) => t.parent_id === r.id)}
            />
          </div>
        ) : null
      }
    />
  );
}

export function VerbProgressTable({ rows }: { rows: Breakdown[] }) {
  const shown = verbRows(rows);
  const sort = useTableSort("verbsSort", ["verb", "answered", "pct"]);
  return (
    <DataTable
      student
      {...sort}
      label="By directive verb"
      rows={shown}
      columns={[
        {
          id: "verb",
          header: "Verb",
          sort: (r) => r.id,
          className: "w-full whitespace-normal",
          cell: (r) => r.id,
        },
        {
          id: "answered",
          header: "Answered",
          sort: (r) => r.answered,

          cell: (r) => r.answered,
        },
        {
          id: "pct",
          header: "Avg %",
          sort: (r) => r.pct,
          cell: (r) => <ProgressScore pct={r.pct} />,
        },
        {
          id: "action",
          header: "",
          cell: (r) =>
            r.id === shown[0]?.id ? (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/student/sprint?type=short&verb=${encodeURIComponent(r.id)}`}
              >
                Practise
              </Link>
            ) : null,
        },
      ]}
    />
  );
}
