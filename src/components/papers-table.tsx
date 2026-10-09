"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  retirePapers,
  undoRetirePapers,
} from "@/app/admin/content/papers/actions";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import Link from "next/link";
import { paperAverageLabel } from "@/lib/paper-list";
import { useOnline } from "@/lib/use-online";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import type { PaperListRow } from "@/lib/admin-papers";
import { dateLabel } from "@/lib/practice";
import { ORIGIN_LABELS } from "@/lib/question-bank";
import { StatusPill, STATUS_PILL } from "./status-pill";

const BASE = "/admin/content/papers";
const columns: Column<PaperListRow>[] = [
  {
    id: "title",
    header: "Title",
    sort: true,
    cell: (p) => (
      <Link
        className="block max-w-32 font-medium [overflow-wrap:anywhere] whitespace-normal underline-offset-4 hover:underline sm:max-w-xs sm:min-w-56"
        href={`${BASE}/${p.id}`}
      >
        {p.title}
      </Link>
    ),
  },
  {
    id: "year",
    className: "hidden sm:table-cell",
    header: "Year",
    sort: true,
    cell: (p) => p.year ?? "–",
  },
  {
    id: "source",
    className: "hidden 2xl:table-cell",
    header: "Source",
    sort: true,
    cell: (p) => p.source ?? "–",
  },
  {
    id: "origin",
    className: "hidden 2xl:table-cell",
    header: "Origin",
    sort: true,
    cell: (p) =>
      ORIGIN_LABELS[p.origin as keyof typeof ORIGIN_LABELS] ?? p.origin,
  },
  {
    id: "questions",
    className: "hidden sm:table-cell",
    header: "Questions",
    sort: true,
    cell: (p) => p.questions,
  },
  {
    id: "marks",
    className: "hidden sm:table-cell",
    header: "Total marks",
    sort: true,
    cell: (p) => (p.questions ? p.total_marks : 0),
  },
  {
    id: "time",
    className: "hidden sm:table-cell",
    header: "Time",
    sort: true,
    cell: (p) => `${p.time_limit_min} min`,
  },
  {
    id: "status",
    header: "Status",
    sort: true,
    cell: (p) => <StatusPill pill={STATUS_PILL[p.status]} />,
  },
  {
    id: "sits",
    className: "hidden sm:table-cell",
    header: "Sits (first / all)",
    sort: true,
    cell: (p) => `${p.first_sits} / ${p.all_sits}`,
  },
  {
    id: "avg",
    className: "hidden sm:table-cell",
    header: "Avg %",
    sort: true,
    cell: paperAverageLabel,
  },
  {
    id: "ranks",
    className: "hidden 2xl:table-cell",
    header: "Ranks",
    sort: true,
    cell: (p) => (p.ranks_enabled ? "On" : "Off"),
  },
  {
    id: "updated",
    className: "hidden 2xl:table-cell",
    header: "Updated",
    sort: true,
    cell: (p) => dateLabel(p.updated_at, true),
  },
];

export function PapersTable({
  rows,
  pager,
}: {
  rows: PaperListRow[];
  pager: Pager;
}) {
  const router = useRouter();
  const online = useOnline();
  const [retiring, setRetiring] = useState<{
    ids: string[];
    clear: () => void;
  } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const retire = () => {
    if (!retiring) return;
    start(async () => {
      setError("");
      try {
        const r = await retirePapers(retiring.ids);
        retiring.clear();
        setRetiring(null);
        toast.success(`${r.done} retired`, {
          action: {
            label: "Undo",
            onClick: () => {
              void undoRetirePapers(r.undo)
                .then((done) => {
                  toast.success(`${done} restored`);
                  router.refresh();
                })
                .catch(() => toast.error("Couldn't undo. Try again."));
            },
          },
        });
        router.refresh();
      } catch {
        setError("Couldn't retire papers. Try again.");
      }
    });
  };
  return (
    <>
      {!online && (
        <p role="status" className="bg-muted rounded-xl px-4 py-2 text-sm">
          {"You're offline. We'll save when you're back."}
        </p>
      )}
      <DataTable
        label="Papers"
        columns={columns}
        rows={rows}
        pager={pager}
        bulk={(ids, clear) => (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError("");
              setRetiring({ ids, clear });
            }}
          >
            Retire
          </Button>
        )}
        onRow={(p) => router.push(`${BASE}/${p.id}`)}
      />
      <AlertDialog
        open={!!retiring}
        onOpenChange={(o) => !o && !pending && setRetiring(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Retire {retiring?.ids.length} papers?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Students can no longer start these papers. Sits in progress keep
            working.
          </AlertDialogDescription>
          {error && (
            <Card className="p-3">
              <p role="alert">{error}</p>
            </Card>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button disabled={pending} onClick={retire}>
              {pending ? "Retiring…" : error ? "Try again" : "Retire"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
