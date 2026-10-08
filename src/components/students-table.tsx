"use client";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { dateLabel } from "@/lib/practice";

export type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  joined: string;
  sessions: number;
  average_pct: number | null;
  last_active: string | null;
};

const columns: Column<StudentRow>[] = [
  {
    id: "name",
    header: "Name",
    sort: (s) => (s.full_name || "Unnamed").toLowerCase(),
    cell: (s) => (
      <Link className="font-medium underline" href={`/admin/students/${s.id}`}>
        {s.full_name || "Unnamed"}
      </Link>
    ),
  },
  { id: "email", header: "Email", cell: (s) => s.email || "No email" },
  {
    id: "joined",
    header: "Joined",
    sort: (s) => s.joined,
    cell: (s) => dateLabel(s.joined),
  },
  {
    id: "sessions",
    header: "Sessions",
    sort: (s) => s.sessions,
    cell: (s) => s.sessions,
  },
  {
    id: "avg",
    header: "Avg",
    sort: (s) => s.average_pct,
    cell: (s) => (s.average_pct == null ? "No scores" : `${s.average_pct}%`),
  },
  {
    id: "last",
    header: "Last active",
    sort: (s) => s.last_active,
    cell: (s) => (s.last_active ? dateLabel(s.last_active) : "Never"),
  },
];

export function StudentsTable({ students }: { students: StudentRow[] }) {
  return <DataTable label="Students" columns={columns} rows={students} />;
}
