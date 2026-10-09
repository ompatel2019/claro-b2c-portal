"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Message } from "@/components/icons";
import { bulkFeedback, undoFeedback } from "@/app/admin/feedback/actions";
import { DataTable, type Column } from "@/components/data-table";
import { ago, FEEDBACK_KIND, type Pager } from "@/lib/admin";
import type { FeedbackRow } from "@/lib/admin-feedback";
import { FeedbackDetail, type FeedbackDetailRow } from "./feedback-detail";
import { StatusPill, STATUS_PILL } from "./status-pill";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

const kind = (k: string) => FEEDBACK_KIND[k as keyof typeof FEEDBACK_KIND] ?? k;
const columns = (
  open: (id: string) => void,
  href: (id: string) => string,
  now: Date,
): Column<FeedbackRow>[] => [
  {
    id: "age",
    className: "hidden sm:table-cell",
    header: "Age",
    sort: true,
    cell: (r) => ago(r.created_at, now),
  },
  {
    id: "kind",
    className: "hidden sm:table-cell",
    header: "Kind",
    sort: true,
    cell: (r) => kind(r.kind),
  },
  {
    id: "student",
    className: "hidden sm:table-cell",
    header: "Student",
    sort: true,
    cell: (r) => (
      <Link
        className="underline-offset-4 hover:underline"
        href={`/admin/students/${r.user_id}`}
      >
        {r.name}
      </Link>
    ),
  },
  {
    id: "message",
    sort: true,
    className: "max-sm:w-full max-sm:max-w-40 max-sm:px-2",
    header: "Message",
    cell: (r) => (
      <Link
        className="line-clamp-2 max-w-md break-words whitespace-normal underline-offset-4 hover:underline"
        href={href(r.id)}
        onClick={(e) => {
          e.preventDefault();
          open(r.id);
        }}
      >
        {r.message}
      </Link>
    ),
  },
  {
    id: "page",
    className: "hidden 2xl:table-cell",
    header: "Page",
    sort: true,
    cell: (r) => (
      <span className="text-muted-foreground block max-w-40 truncate">
        {r.page_path ?? ""}
      </span>
    ),
  },
  {
    id: "linked",
    className: "hidden sm:table-cell",
    header: "Linked item",
    sort: true,
    cell: (r) => r.linked,
  },
  {
    id: "shots",
    className: "hidden sm:table-cell",
    header: "Screenshots",
    sort: true,
    cell: (r) => (r.screenshots ? `📎 ${r.screenshots}` : ""),
  },
  {
    id: "status",
    className: "max-sm:px-2",
    header: "Status",
    sort: true,
    cell: (r) => <StatusPill pill={STATUS_PILL[r.status]} />,
  },
];

export type FeedbackItem = FeedbackDetailRow & {
  name: string;
  kind: string;
  screenshots: string[];
  missingScreenshots: number;
  created_at: string;
  attempt: { id: string; status: string } | null;
};

/** §4.10 inbox table with bulk triage/resolve; a row opens the Sheet through ?id=. */
export function FeedbackTable({
  rows,
  pager,
  status,
  item,
  adminId,
  now,
}: {
  rows: FeedbackRow[];
  pager: Pager;
  status: string;
  item: FeedbackItem | null;
  adminId: string;
  now: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const itemHref = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("id", id);
    return `${path}?${p}`;
  };
  const open = (id?: string) => {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("id", id);
    else p.delete("id");
    router.push(`${path}?${p}`, { scroll: false });
  };
  const bulk = (ids: string[], to: "triaged" | "resolved", clear: () => void) =>
    start(async () => {
      setError(null);
      const r = await bulkFeedback(ids, to).catch(() => ({
        error: "Try again.",
      }));
      if ("error" in r) {
        setError("Couldn’t update this. Try again.");
        return;
      }
      toast.success(`${r.done} ${to}`, {
        duration: 4000,
        action: {
          label: "Undo",
          onClick: () =>
            start(async () => {
              try {
                const undone = await undoFeedback(r.undo);
                if ("error" in undone) {
                  setError(undone.error);
                  router.refresh();
                  return;
                }
                toast.success("Feedback change undone");
                router.refresh();
              } catch {
                setError("Couldn’t undo this. Try again.");
              }
            }),
        },
      });
      clear();
      router.refresh();
    });
  return (
    <>
      {error && (
        <p role="alert" className="bg-card rounded-2xl border p-5 text-sm">
          {error}
        </p>
      )}
      <DataTable
        label="Feedback"
        columns={columns(open, itemHref, new Date(now))}
        rows={rows}
        pager={pager}
        onRow={(r) => open(r.id)}
        bulk={(ids, clear) => (
          <>
            {status !== "triaged" && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => bulk(ids, "triaged", clear)}
              >
                Mark triaged
              </Button>
            )}
            {status !== "resolved" && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => bulk(ids, "resolved", clear)}
              >
                Resolve
              </Button>
            )}
          </>
        )}
      />
      <Sheet open={!!item} onOpenChange={(o) => !o && open()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {item && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2 break-words">
                  <Message aria-hidden className="size-4" />
                  {kind(item.kind)} from {item.name}
                  <StatusPill pill={STATUS_PILL[item.status]} />
                </SheetTitle>
                <p className="text-muted-foreground text-xs">
                  {ago(item.created_at, new Date(now))}
                </p>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 text-sm">
                <FeedbackDetail
                  key={item.id}
                  draftKey={`claro.feedback.${adminId}.${item.id}`}
                  row={item}
                  photos={item.screenshots}
                  missingScreenshots={item.missingScreenshots}
                  attempt={item.attempt}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
