"use client";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { ChevronDown } from "@/components/icons";
import type { Pager } from "@/lib/admin";

export type StaticRow = {
  id: string;
  cells: Record<string, React.ReactNode>;
  children?: StaticRow[];
  /** Plain values for sorting and searching rendered cells. */
  keys?: Record<string, string | number | null>;
};

/** DataTable fed from a server component: cells are rendered nodes, sort keys are plain values. */
export function StaticTable({
  label,
  columns,
  rows,
  pager,
}: {
  label: string;
  columns: {
    id: string;
    header: string;
    sortable?: boolean;
    className?: string;
  }[];
  rows: StaticRow[];
  pager?: Pager;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const cols: Column<StaticRow>[] = columns.map((c, i) => ({
    id: c.id,
    header: c.header,
    className: c.className,
    cell: (r) =>
      i === 0 && r.children?.length ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 text-left"
          aria-expanded={open.has(r.id)}
          aria-controls={`subtopics-${r.id}`}
          onClick={() => toggle(r.id)}
        >
          <ChevronDown aria-hidden className="size-4 shrink-0" />
          {r.cells[c.id]} <span className="sr-only">subtopics</span>
        </button>
      ) : (
        r.cells[c.id]
      ),
    sort: c.sortable
      ? pager
        ? true
        : (r) => r.keys?.[c.id] ?? null
      : undefined,
  }));
  return (
    <DataTable
      label={label}
      rows={rows}
      pager={pager}
      columns={cols}
      renderDetail={(r) =>
        r.children?.length && open.has(r.id) ? (
          <div id={`subtopics-${r.id}`}>
            <StaticTable
              label={`${label}: subtopics`}
              columns={columns}
              rows={r.children}
            />
          </div>
        ) : null
      }
    />
  );
}
