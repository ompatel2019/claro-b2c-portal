"use client";
import Link from "next/link";
import { Close } from "@/components/icons";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import { dateLabel } from "@/lib/practice";
import type { StudentRow } from "@/lib/students";
import { Badge } from "@/components/ui/badge";

// Sorting is server-side by column id (STUDENT_KEYS); `sort: true` marks the header.
const columns: Column<StudentRow>[] = [
  {
    id: "name",
    header: "Name",
    sort: true,
    cell: (s) => (
      <Link
        className="font-medium underline-offset-4 hover:underline"
        href={`/admin/students/${s.id}`}
      >
        {s.full_name || "Unnamed"}
      </Link>
    ),
  },
  {
    id: "email",
    header: "Email",
    sort: true,
    cell: (s) => s.email || "No email",
  },
  {
    id: "year",
    header: "Year",
    sort: true,
    cell: (s) => s.year_level ?? "Not set",
  },
  {
    id: "school",
    header: "School",
    sort: true,
    cell: (s) => s.school || "Not set",
  },
  {
    id: "joined",
    header: "Joined",
    sort: true,
    cell: (s) => dateLabel(s.joined, true),
  },
  {
    id: "last",
    header: "Last active",
    sort: true,
    cell: (s) => (s.last_active ? dateLabel(s.last_active, true) : "Never"),
  },
  {
    id: "sessions7",
    header: "Sessions 7d",
    sort: true,
    cell: (s) => s.sessions_7d,
  },
  {
    id: "sessions",
    header: "Sessions total",
    sort: true,
    cell: (s) => s.sessions_total,
  },
  {
    id: "answered",
    header: "Questions answered",
    sort: true,
    cell: (s) => s.answered,
  },
  {
    id: "avg",
    header: "Avg % (30 days)",
    sort: true,
    cell: (s) => (s.avg_30 == null ? "No marks" : `${s.avg_30}%`),
  },
  { id: "streak", header: "Streak", sort: true, cell: (s) => s.streak },
  {
    id: "disputes",
    header: "Open disputes",
    sort: true,
    cell: (s) => s.open_disputes,
  },
  {
    id: "spend",
    header: "AI spend (all time)",
    sort: true,
    cell: (s) => `$${s.ai_spend.toFixed(2)}`,
  },
  {
    id: "blocked",
    header: "Blocked",
    sort: true,
    cell: (s) =>
      s.blocked ? (
        <Badge variant="destructive">
          <Close />
          Blocked
        </Badge>
      ) : null,
  },
];

export function StudentsTable({
  students,
  pager,
}: {
  students: StudentRow[];
  pager: Pager;
}) {
  const router = useRouter();
  const responsive = columns.map((c) => ({
    ...c,
    cell:
      c.id === "name"
        ? (s: StudentRow) => (
            <>
              {c.cell(s)}
              <details
                className="mt-1 text-xs 2xl:hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <summary className="cursor-pointer">More details</summary>
                <dl className="space-y-1 py-2">
                  {columns
                    .filter((column) => !["name", "last"].includes(column.id))
                    .map((column) => (
                      <div
                        key={column.id}
                        className={
                          [
                            "email",
                            "year",
                            "sessions7",
                            "avg",
                            "blocked",
                          ].includes(column.id)
                            ? "sm:hidden"
                            : undefined
                        }
                      >
                        <dt className="text-muted-foreground">
                          {column.header}
                        </dt>
                        <dd className="wrap-anywhere">
                          {column.id === "blocked" && !s.blocked
                            ? "No"
                            : column.cell(s)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
            </>
          )
        : c.cell,
    className:
      c.id === "name"
        ? "max-w-48 whitespace-normal wrap-anywhere max-sm:max-w-32"
        : c.id === "last"
          ? "max-sm:px-2"
          : c.id === "email"
            ? "hidden max-w-56 whitespace-normal break-all sm:table-cell"
            : ["year", "sessions7", "avg", "blocked"].includes(c.id)
              ? "hidden whitespace-normal sm:table-cell"
              : "hidden whitespace-normal 2xl:table-cell",
  }));
  return (
    <DataTable
      label="Students"
      columns={responsive}
      rows={students}
      pager={pager}
      selectable
      onRow={(s) => router.push(`/admin/students/${s.id}`)}
    />
  );
}
