"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/data-table";
import { Alert, CheckCircle, Pending } from "@/components/icons";
import { Badge } from "@/components/ui/badge";

type LatestRow = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  score: string;
  tone: "success" | "warning" | "destructive" | null;
  when: string;
  finished_at: string;
};

const href = (r: LatestRow) => `/admin/students/${r.user_id}#session-${r.id}`;
const columns: Column<LatestRow>[] = [
  {
    id: "student",
    header: "Student",
    sort: (r) => r.name.toLowerCase(),
    cell: (r) => (
      <Link
        className="font-medium underline-offset-4 hover:underline"
        href={href(r)}
      >
        {r.name}
      </Link>
    ),
  },
  {
    id: "kind",
    header: "Kind",
    sort: (r) => r.kind,
    cell: (r) => r.kind,
    className: "hidden sm:table-cell",
  },
  {
    id: "score",
    header: "Score",
    cell: (r) => {
      const Icon =
        r.tone === "success"
          ? CheckCircle
          : r.tone === "warning"
            ? Pending
            : Alert;
      return r.tone ? (
        <Badge variant={r.tone}>
          <Icon />
          {r.score}
        </Badge>
      ) : (
        r.score
      );
    },
  },
  {
    id: "when",
    header: "When",
    sort: (r) => r.finished_at,
    cell: (r) => r.when,
  },
];

/** §4.1 "Latest finished sessions": 10 rows; a row opens the session in the student detail. */
export function LatestSessions({ rows }: { rows: LatestRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      label="Latest finished sessions"
      columns={columns}
      rows={rows}
      onRow={(r) => router.push(href(r))}
    />
  );
}
