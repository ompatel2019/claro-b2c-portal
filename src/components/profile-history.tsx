"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DataTable, type Column } from "./data-table";
import { StatusPill, STATUS_PILL } from "./status-pill";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Alert, Pending, CheckCircle, Message, Help } from "@/components/icons";
import { EmptyState } from "./empty-state";
import { dateLabel } from "@/lib/practice";
import { reviewOutcome } from "@/lib/profile";
import type { Pager } from "@/lib/admin";
export type FeedbackRow = {
  id: string;
  created_at: string;
  kind: string;
  message: string;
  status: keyof typeof STATUS_PILL;
  admin_note: string | null;
};
export type ReviewRow = {
  id: string;
  created_at: string;
  question: string;
  student_note: string | null;
  status: string;
  ai_mark: number | null;
  final_mark: number | null;
  href: string | null;
};
const kinds: Record<string, string> = {
  general: "General",
  bug: "Bug",
  content: "Content error",
  marking: "Marking",
  feature: "Feature idea",
};
const labelClass = "w-full max-w-0 whitespace-normal wrap-anywhere";
const hiddenColumn = "hidden @min-[640px]:table-cell";
const wrap = `${hiddenColumn} max-w-64 min-w-40 whitespace-normal wrap-anywhere`;
const detailsClass = "text-muted-foreground text-xs @min-[640px]:hidden";
const feedbackColumns: Column<FeedbackRow>[] = [
  {
    id: "created_at",
    header: "Date",
    className: hiddenColumn,
    sort: true,
    cell: (r) => dateLabel(r.created_at, true),
  },
  {
    id: "kind",
    header: "Type",
    className: hiddenColumn,
    sort: true,
    cell: (r) => kinds[r.kind] ?? r.kind,
  },
  {
    id: "message",
    header: "Message",
    className: labelClass,
    cell: (r) => (
      <>
        <div title={r.message}>
          {r.message.length > 160 ? `${r.message.slice(0, 160)}…` : r.message}
        </div>
        <div className={detailsClass}>
          {dateLabel(r.created_at, true)} · {kinds[r.kind] ?? r.kind} · Status:{" "}
          {STATUS_PILL[r.status]}
        </div>
        <div className={detailsClass}>
          Reply from the team: {r.admin_note || "No reply yet"}
        </div>
      </>
    ),
  },
  {
    id: "status",
    header: "Status",
    className: hiddenColumn,
    sort: true,
    cell: (r) => <StatusPill pill={STATUS_PILL[r.status]} />,
  },
  {
    id: "admin_note",
    header: "Reply from the team",
    className: wrap,
    cell: (r) => r.admin_note || "No reply yet",
  },
];
const reviewColumns: Column<ReviewRow>[] = [
  {
    id: "created_at",
    header: "Date",
    className: hiddenColumn,
    sort: true,
    cell: (r) => dateLabel(r.created_at, true),
  },
  {
    id: "question",
    header: "Question",
    className: labelClass,
    cell: (r) => (
      <>
        <div>
          {r.href ? (
            <Link href={r.href} className="underline underline-offset-4">
              {r.question}
            </Link>
          ) : (
            r.question
          )}
        </div>
        <div className={detailsClass}>
          {dateLabel(r.created_at, true)} · Status: {reviewOutcome(r)}
        </div>
        <div className={detailsClass}>Your note: {r.student_note || "—"}</div>
      </>
    ),
  },
  {
    id: "student_note",
    header: "Your note",
    className: wrap,
    cell: (r) => r.student_note,
  },
  {
    id: "status",
    header: "Status",
    className: hiddenColumn,
    sort: true,
    cell: (r) => {
      const outcome = reviewOutcome(r);
      const Icon = outcome === "Being checked" ? Pending : CheckCircle;
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 text-xs ${outcome === "Being checked" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
        >
          <Icon className="size-3" aria-hidden />
          {outcome}
        </span>
      );
    },
  },
];
export function ProfileLoadError() {
  const router = useRouter();
  return (
    <div className="grid justify-items-start gap-3">
      <p role="alert" className="flex items-center gap-2">
        <Alert className="size-4" />
        {"Couldn't load this. Try again"}
      </p>
      <Button variant="outline" onClick={() => router.refresh()}>
        Try again
      </Button>
    </div>
  );
}
function HistorySort({
  kind,
  title,
  pager,
}: {
  kind: "feedback" | "reviews";
  title: string;
  pager: Pager;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const columns = kind === "feedback" ? feedbackColumns : reviewColumns;
  return (
    <label className="flex min-w-0 flex-wrap items-center gap-2 @min-[640px]:hidden">
      <span>Sort {title.toLowerCase()}</span>
      <select
        className="bg-background min-h-11 max-w-full min-w-0 rounded-md border px-3 text-sm"
        value={`${pager.sort.id}:${pager.sort.dir}`}
        onChange={(event) => {
          const [id, dir] = event.target.value.split(":");
          const next = new URLSearchParams(params.toString());
          next.set(`${kind}_sort`, id);
          next.set(`${kind}_dir`, dir);
          next.set(`${kind}_page`, "1");
          router.push(`${path}?${next}`, { scroll: false });
        }}
      >
        {columns
          .filter((column) => column.sort)
          .flatMap((column) =>
            (["asc", "desc"] as const).map((dir) => (
              <option key={`${column.id}:${dir}`} value={`${column.id}:${dir}`}>
                {column.header} ·{" "}
                {column.id === "created_at"
                  ? dir === "asc"
                    ? "oldest first"
                    : "newest first"
                  : dir === "asc"
                    ? "ascending"
                    : "descending"}
              </option>
            )),
          )}
      </select>
    </label>
  );
}
export function ProfileHistory({
  kind,
  rows,
  pager,
  error,
}: {
  kind: "feedback" | "reviews";
  rows: FeedbackRow[] | ReviewRow[];
  pager: Pager;
  error?: boolean;
}) {
  const title = kind === "feedback" ? "Your feedback" : "Marks you questioned";
  return (
    <Card className="@container min-w-0 p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {error ? (
        <ProfileLoadError />
      ) : pager.total === 0 ? (
        <EmptyState
          icon={kind === "feedback" ? Message : Help}
          title={
            kind === "feedback"
              ? "Nothing sent yet."
              : "No marks questioned yet."
          }
          description={
            kind === "feedback"
              ? "Your messages and replies from the team will appear here."
              : "Marks you question and their outcomes will appear here."
          }
        />
      ) : (
        <>
          <HistorySort kind={kind} title={title} pager={pager} />
          {kind === "feedback" ? (
            <DataTable
              student
              label={title}
              columns={feedbackColumns}
              rows={rows as FeedbackRow[]}
              pager={pager}
              paramPrefix={`${kind}_`}
            />
          ) : (
            <DataTable
              student
              label={title}
              columns={reviewColumns}
              rows={rows as ReviewRow[]}
              pager={pager}
              paramPrefix={`${kind}_`}
            />
          )}
        </>
      )}
    </Card>
  );
}
