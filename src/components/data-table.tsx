"use client";
import { Fragment, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TablePagination } from "./table-pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sortRows, type Pager, type Sorting } from "@/lib/admin";
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
  /** Sort key (missing values sort last), or `true` when the server sorts by this column id. */
  sort?: ((row: T) => string | number | null) | true;
  className?: string;
};

export { sortRows } from "@/lib/admin";

export type TableSorting = Sorting | null;

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  label: string;
  onRow?: (row: T) => void;
  pager?: Pager;
  /** Independent URL state for multiple server-paged tables on one page. */
  paramPrefix?: string;
  selectable?: boolean;
  /** Opt-in actions for selected rows on the current page. */
  bulk?: (ids: string[], clear: () => void) => React.ReactNode;
  /** A full-width row under a row (e.g. expanded subtopics). */
  renderDetail?: (row: T) => React.ReactNode;
  /** Student-app density: taller rows. */
  student?: boolean;
  /** Controlled local sorting (e.g. kept in the URL by the caller). */
  sorting?: TableSorting;
  onSortChange?: (sorting: TableSorting) => void;
};

/** Router hooks are confined to the opt-in server paging component. */
export function DataTable<T extends { id: string }>(props: Props<T>) {
  return props.pager ? (
    <PagedTable {...props} pager={props.pager} />
  ) : (
    <LocalTable {...props} />
  );
}

function LocalTable<T extends { id: string }>(props: Props<T>) {
  const [local, setLocal] = useState<TableSorting>(null);
  const sorting = props.sorting === undefined ? local : props.sorting;
  const sortBy = props.columns.find((c) => c.id === sorting?.id)?.sort;
  const shown =
    sorting && typeof sortBy === "function"
      ? sortRows(props.rows, sortBy, sorting.dir)
      : props.rows;
  const toggle = (id: string) => {
    const next: TableSorting =
      sorting?.id !== id
        ? { id, dir: "asc" }
        : sorting.dir === "asc"
          ? { id, dir: "desc" }
          : null;
    if (props.onSortChange) props.onSortChange(next);
    else setLocal(next);
  };
  return (
    <TableView {...props} rows={shown} sorting={sorting} toggle={toggle} />
  );
}

function PagedTable<T extends { id: string }>(
  props: Props<T> & { pager: Pager },
) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const { pager } = props;
  const navigate = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes))
      next.set(`${props.paramPrefix ?? ""}${key}`, value);
    router.push(`${path}?${next}`, { scroll: false });
  };
  const toggle = (id: string) =>
    navigate({
      sort: id,
      dir: pager.sort.id === id && pager.sort.dir === "asc" ? "desc" : "asc",
      page: "1",
    });
  return (
    <>
      <TableView
        key={params.toString()}
        {...props}
        sorting={pager.sort}
        toggle={toggle}
      />
      <TablePagination
        pager={pager}
        label={props.label}
        paramPrefix={props.paramPrefix}
      />
    </>
  );
}

function TableView<T extends { id: string }>({
  columns,
  rows: shown,
  label,
  onRow,
  sorting,
  toggle,
  selectable: selectRows,
  bulk,
  renderDetail,
  student,
}: Props<T> & { sorting: Sorting | null; toggle: (id: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectable = selectRows || !!bulk;
  return (
    <div className="bg-card min-w-0 overflow-hidden rounded-2xl border">
      {selectable && selected.size > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-b px-5 py-2 text-sm"
        >
          {selected.size} selected
          {bulk?.([...selected], () => setSelected(new Set()))}
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}
      <Table aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  className="accent-primary size-4"
                  checked={
                    shown.length > 0 && shown.every((r) => selected.has(r.id))
                  }
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selected.size > 0 &&
                        !shown.every((r) => selected.has(r.id));
                  }}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(shown.map((r) => r.id))
                        : new Set(),
                    )
                  }
                />
              </TableHead>
            )}
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
          {shown.map((row) => {
            const detail = renderDetail?.(row);
            return (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(student && "h-14", onRow && "cursor-pointer")}
                  onClick={(e) => {
                    if (
                      !(e.target as HTMLElement).closest(
                        "a, button, input, select, textarea, [role=button], [role=menuitem]",
                      )
                    )
                      onRow?.(row);
                  }}
                >
                  {selectable && (
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.id}`}
                        className="accent-primary size-4"
                        checked={selected.has(row.id)}
                        onChange={(e) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.id} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
                {detail && (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (selectable ? 1 : 0)}
                      className="p-0 whitespace-normal"
                    >
                      {detail}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
