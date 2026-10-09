"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "@/components/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Sort key; missing values always sort last. Omit for unsortable columns. */
  sort?: (row: T) => string | number | null;
  className?: string;
};

/** Sorts rows by a column; null keys go last in both directions. */
export function sortRows<T>(
  rows: T[],
  key: (row: T) => string | number | null,
  dir: "asc" | "desc",
) {
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * (dir === "asc" ? 1 : -1);
  });
}

/** Admin table: 48px rows, header click sorts asc → desc → off. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  label,
  onRow,
}: {
  columns: Column<T>[];
  rows: T[];
  label: string;
  onRow?: (row: T) => void;
}) {
  const [sorting, setSorting] = useState<{
    id: string;
    dir: "asc" | "desc";
  } | null>(null);
  const sortBy = columns.find((c) => c.id === sorting?.id)?.sort;
  const shown = sorting && sortBy ? sortRows(rows, sortBy, sorting.dir) : rows;
  const toggle = (id: string) =>
    setSorting((s) =>
      s?.id !== id
        ? { id, dir: "asc" }
        : s.dir === "asc"
          ? { id, dir: "desc" }
          : null,
    );
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => {
              const dir = sorting?.id === c.id ? sorting.dir : undefined;
              return (
                <TableHead
                  key={c.id}
                  className={c.className}
                  aria-sort={
                    dir === "asc"
                      ? "ascending"
                      : dir === "desc"
                        ? "descending"
                        : undefined
                  }
                >
                  {c.sort ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase"
                      onClick={() => toggle(c.id)}
                    >
                      {c.header}
                      {dir === "asc" && <ArrowUp className="size-3" />}
                      {dir === "desc" && <ArrowDown className="size-3" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow
              key={row.id}
              className={onRow ? "cursor-pointer" : undefined}
              onClick={(e) => {
                if (
                  !(e.target as HTMLElement).closest(
                    "a, button, input, select, textarea, [role=button], [role=menuitem]",
                  )
                )
                  onRow?.(row);
              }}
            >
              {columns.map((c) => (
                <TableCell key={c.id} className={c.className}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
