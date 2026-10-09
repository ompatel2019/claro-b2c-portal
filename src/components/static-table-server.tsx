import { pageOf, tableParams } from "@/lib/admin";
import { History } from "@/components/icons";
import { EmptyState } from "./empty-state";
import { StaticTable, type StaticRow } from "./static-table";

/** Filter and page rendered cells on the server using their plain search/sort keys. */
export function ServerTable({
  params,
  label,
  columns,
  rows,
}: {
  params: Record<string, string | undefined>;
  label: string;
  columns: React.ComponentProps<typeof StaticTable>["columns"];
  rows: StaticRow[];
}) {
  const fallback = { id: columns[0].id, dir: "asc" as const };
  const { sort, page } = tableParams(params, fallback);
  const keys = Object.fromEntries(
    columns
      .filter((c) => c.sortable)
      .map((c) => [c.id, (r: StaticRow) => r.keys?.[c.id] ?? null]),
  );
  const q = params.q?.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      !q ||
      `${r.id} ${Object.values(r.keys ?? {}).join(" ")} ${(r.children ?? []).map((c) => Object.values(c.keys ?? {}).join(" ")).join(" ")}`
        .toLowerCase()
        .includes(q),
  );
  if (!filtered.length)
    return (
      <EmptyState
        icon={History}
        title={q ? "No rows match" : `No ${label.toLowerCase()} yet`}
        description={
          q
            ? "Clear search to see all rows."
            : "This student has no activity here yet."
        }
      />
    );
  const paged = pageOf(filtered, keys, sort, page, fallback);
  return (
    <StaticTable
      label={label}
      columns={columns}
      rows={paged.rows}
      pager={paged.pager}
    />
  );
}
