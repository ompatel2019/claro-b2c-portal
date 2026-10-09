"use client";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Target } from "@/components/icons";
import type { Breakdown, computeAccuracy } from "./data";
import { meanDelta, percentage, percentLabel } from "./helpers";

export { percentLabel } from "./helpers";

export function BreakdownTable({
  title,
  rows,
  heading,
}: {
  title: string;
  rows: Breakdown[];
  heading: string;
}) {
  if (!rows.some((r) => r.checked || r.deltas.length))
    return (
      <EmptyState
        icon={Target}
        title={`No data ${title.toLowerCase()}`}
        description="Checked written answers and resolved reviews in this range will appear here."
      />
    );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>
          Agreement and review use checked answers. Mean |Δ| uses reviews
          resolved in this range.
        </CardDescription>
      </CardHeader>
      <DataTable
        label={title}
        rows={rows}
        columns={[
          {
            id: "label",
            header: heading,
            cell: (r) => r.label,
            sort: (r) => r.label,
          },
          {
            id: "checked",
            header: "Checked",
            cell: (r) => r.checked,
            sort: (r) => r.checked,
          },
          {
            id: "agreed",
            header: "Agreed",
            cell: (r) => percentLabel(r.agreed, r.checked),
            sort: (r) => percentage(r.agreed, r.checked),
          },
          {
            id: "review",
            header: "Review",
            cell: (r) => percentLabel(r.review, r.checked),
            sort: (r) => percentage(r.review, r.checked),
          },
          {
            id: "delta",
            header: "Mean |Δ|",
            cell: (r) =>
              meanDelta(r.deltas) == null
                ? "No resolved marks"
                : `${meanDelta(r.deltas)!.toFixed(2)} marks (${r.deltas.length} reviews)`,
            sort: (r) => meanDelta(r.deltas),
          },
        ]}
      />
    </Card>
  );
}
export function DisagreedQuestions({
  rows,
}: {
  rows: ReturnType<typeof computeAccuracy>["questions"];
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={Target}
        title="No questions with 3 checked answers yet"
        description="The ten questions with the highest disagreement rates will appear here."
      />
    );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Most disagreed questions</h2>
        </CardTitle>
        <CardDescription>
          Top 10 with at least 3 checked answers. Disagreed includes second pass
          and checker disagreements sent to review.
        </CardDescription>
      </CardHeader>
      <DataTable
        label="Most disagreed questions"
        rows={rows.map((r) => ({ ...r, id: r.question.id }))}
        columns={[
          {
            id: "question",
            header: "Question",
            sort: (r) => r.question.source ?? r.question.id,
            cell: (r) => {
              const stem = (r.question.stem ?? "").replace(/\s+/g, " ").trim();
              return (
                <Link
                  href={`/admin/content/questions/${encodeURIComponent(r.id)}?tab=stats`}
                  className="hover:text-brand block max-w-md min-w-48 break-words whitespace-normal"
                >
                  <span className="font-medium">
                    {r.question.source ?? r.id}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-[13px]">
                    {stem.length > 60 ? `${stem.slice(0, 59)}…` : stem}
                  </span>
                </Link>
              );
            },
          },
          {
            id: "checked",
            header: "Checked",
            cell: (r) => r.checked,
            sort: (r) => r.checked,
          },
          {
            id: "disagreed",
            header: "Disagreed",
            cell: (r) => percentLabel(r.disagreed, r.checked),
            sort: (r) => percentage(r.disagreed, r.checked),
          },
        ]}
      />
    </Card>
  );
}
