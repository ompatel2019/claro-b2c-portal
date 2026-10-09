"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkQuestions,
  undoQuestionChanges,
  type QuestionUndo,
  mergeDraft,
} from "@/app/admin/content/questions/actions";
import { TablePagination } from "./table-pagination";
import type { Pager } from "@/lib/admin";
import { EmptyState } from "./empty-state";
import { QuestionFile } from "./icons";
import { diffWords } from "@/lib/question-bank";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";

const subscribeToHydration = () => () => {};

export type ReviewPair = {
  draft: { id: string; stem: string; source: string; status: string };
  row: { id: string; stem: string; source: string; status: string };
  score: number;
};

function Diff({ parts }: { parts: { text: string; changed: boolean }[] }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.changed ? (
          <mark key={i} className="bg-warning-soft text-ink rounded px-0.5">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

/** §4.4 Import review: closest match side by side, a threshold slider and the three actions. */
export function ImportReview({
  rows,
  threshold,
  pager,
  filtered,
}: {
  rows: ReviewPair[];
  threshold: number;
  pager: Pager;
  filtered: boolean;
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(threshold);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const base = "/admin/content/questions";
  const act = (fn: () => Promise<QuestionUndo[]>, done: string) =>
    start(async () => {
      try {
        const undo = await fn();
        toast.success(done, {
          duration: 4000,
          action: undo.length
            ? {
                label: "Undo",
                onClick: () =>
                  start(async () => {
                    try {
                      await undoQuestionChanges(undo);
                      router.refresh();
                    } catch {
                      toast.error("Couldn't undo. Reload and try again.");
                    }
                  }),
              }
            : undefined,
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t apply that. Try again.",
        );
      }
    });
  return (
    <div className="min-w-0 space-y-4">
      <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
        Similarity threshold
        <input
          type="range"
          min={0.6}
          max={0.99}
          step={0.01}
          value={value}
          aria-valuetext={`${Math.round(value * 100)}%`}
          onChange={(e) => {
            const v = Number(e.target.value);
            setValue(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              const next = new URLSearchParams(params.toString());
              next.set("status", "review");
              next.set("threshold", String(v));
              next.delete("page");
              router.replace(`${path}?${next}`);
            }, 300);
          }}
        />
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </label>
      {!rows.length && (
        <EmptyState
          icon={QuestionFile}
          title={filtered ? "No imports match" : "Nothing to review"}
          description={
            filtered
              ? "Try another search or clear the filters."
              : "Drafts with a close match in the bank appear here."
          }
        />
      )}
      {rows.map(({ draft, row, score }) => {
        const d = diffWords(draft.stem, row.stem);
        return (
          <Card key={draft.id} aria-label={`Review ${draft.id}`}>
            <CardHeader className="flex flex-wrap items-center gap-2">
              <Link
                className="font-semibold underline"
                href={`${base}/${draft.id}`}
              >
                {draft.id}
              </Link>
              <span className="text-muted-foreground text-sm">
                {draft.source}
              </span>
              <span className="text-muted-foreground">→</span>
              <Link
                className="font-semibold underline"
                href={`${base}/${row.id}`}
              >
                {row.id}
              </Link>
              <span className="text-muted-foreground text-sm">
                {row.source} · {row.status}
              </span>
              <Badge variant={score >= 0.95 ? "destructive" : "warning"}>
                {Math.round(score * 100)}% similar
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  Draft
                </p>
                <Diff parts={d.left} />
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  Closest match
                </p>
                <Diff parts={d.right} />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button
                  size="sm"
                  disabled={pending || !hydrated}
                  onClick={() =>
                    act(async () => {
                      const r = await bulkQuestions([draft.id], {
                        kind: "publish",
                      });
                      if (r.failures.length)
                        throw new Error(r.failures[0].problem);
                      return r.undo;
                    }, "Published; both kept")
                  }
                >
                  Keep both
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || !hydrated}
                  onClick={() =>
                    act(
                      () => mergeDraft(draft.id, row.id),
                      `Merged into ${row.id}`,
                    )
                  }
                >
                  Merge into existing
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending || !hydrated}
                  onClick={() =>
                    act(
                      async () =>
                        (await bulkQuestions([draft.id], { kind: "retire" }))
                          .undo,
                      "Retired",
                    )
                  }
                >
                  Retire
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {pager.total > 0 && (
        <TablePagination pager={pager} label="Import review" />
      )}
    </div>
  );
}
