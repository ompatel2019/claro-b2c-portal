import Link from "next/link";
import type { ReviewRow } from "@/lib/feedback";
import { markingState, markLabel } from "@/lib/feedback";
import {
  firstBelow,
  scored,
  markTone,
  TYPE_LABEL,
  type McGridRow,
} from "@/lib/results";
import { QuestionView } from "./question-view";
import { AnnotatedFeedback } from "./annotated-feedback";
import { ReportProblem } from "./feedback-widget";
import { QuestionMark } from "./question-mark";
import { McReview } from "./mc-review";
import { ResultsBrowser } from "./results-browser";
import { statePill } from "./status-pill";
import { buttonVariants } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Results composition for sprint and single-answer pages, using the existing kit. */
export function ResultsAnswers({
  rows,
  id,
  name,
  photos,
  mcGrid,
  readOnly = false,
  writtenAction,
}: {
  rows: ReviewRow[];
  id: string;
  name: (id: string | null) => string;
  photos: Map<string | null, string | null>;
  mcGrid?: McGridRow[];
  readOnly?: boolean;
  writtenAction?: (row: ReviewRow) => React.ReactNode;
}) {
  const report = (r: ReviewRow) =>
    !readOnly &&
    r.question_id && (
      <ReportProblem
        questionId={r.question_id}
        sessionId={id}
        label={`Linked: ${r.source}`}
      />
    );
  const views = rows.map((r) => {
    const state = markingState(r);
    return (
      <Card key={r.attempt_id} id={`q-${r.position}`}>
        <CardHeader className="space-y-2">
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink font-semibold">
              Question {r.position}
            </span>
            · {TYPE_LABEL[r.type]} · {r.source}
            {r.topic_id && ` · ${name(r.topic_id)}`}
            {r.type === "mcq" && scored(r) && (
              <span className="text-ink font-semibold tabular-nums">
                {markLabel(r, state)}
              </span>
            )}
          </p>
          <QuestionView question={r} />
        </CardHeader>
        <CardContent className="space-y-4">
          {r.type === "mcq" ? (
            <>
              <McReview row={r} />
              {report(r)}
            </>
          ) : (
            <AnnotatedFeedback
              readOnly={readOnly}
              row={r}
              photos={(r.image_paths ?? []).flatMap((p) => photos.get(p) ?? [])}
              actions={
                writtenAction ? (
                  writtenAction(r)
                ) : (
                  <>
                    {!readOnly && ["marked", "reviewed"].includes(state) && (
                      <QuestionMark attemptId={r.attempt_id} />
                    )}
                    {report(r)}
                  </>
                )
              }
            />
          )}
        </CardContent>
      </Card>
    );
  });

  return (
    rows.length > 0 && (
      <ResultsBrowser
        initial={firstBelow(rows)}
        views={views}
        mcGrid={mcGrid}
        items={rows.map((r) => {
          const state = markingState(r);
          return {
            position: r.position,
            type: TYPE_LABEL[r.type],
            topic: name(r.topic_id),
            source: r.source,
            mark: scored(r) ? markLabel(r, state) : null,
            tone: scored(r)
              ? markTone(r.mark ?? 0, r.max_marks ?? r.marks)
              : "",
            pill: r.type === "mcq" ? null : statePill(state, r.review),
          };
        })}
      />
    )
  );
}

export type OverallSummary = {
  strengths?: string[];
  improvements?: string[];
  top_fixes?: string[];
  next_steps?: string[];
  sections?:
    Record<string, OverallSummary> | (OverallSummary & { section: string })[];
};
export function OverallFeedback({
  summary,
  pending,
  actions,
  section,
  context = "sprint",
}: {
  summary: OverallSummary | null;
  pending: boolean;
  actions?: { label: string; href: string }[];
  section?: string;
  /** Admin historical reports still describe their original session kind. */
  context?: "paper" | "sprint";
}) {
  const actionLinks = actions && actions.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className:
              "h-auto min-h-9 max-w-full shrink py-1.5 text-left whitespace-normal",
          })}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{section ?? "Overall feedback"}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="grid gap-6 md:grid-cols-3">
            {(
              [
                ["Strengths", summary.strengths],
                ["Top fixes", summary.top_fixes ?? summary.improvements],
                ["Next steps", summary.next_steps],
              ] as const
            ).map(([label, lines]) => (
              <div key={label} className="space-y-3">
                <h3 className="font-semibold">{label}</h3>
                <ul className="list-disc space-y-2 pl-5">
                  {(lines ?? []).map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
                {label === "Next steps" && actionLinks}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p role="status" className="text-muted-foreground">
              {pending
                ? "Your overall feedback will appear here once marking finishes."
                : `An overall summary isn’t available for this ${context}. Each answer’s feedback is below.`}
            </p>
            {pending && (
              <div aria-hidden="true" className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div
                      aria-hidden="true"
                      className="bg-muted h-4 w-2/3 animate-pulse rounded"
                    />
                    <div
                      aria-hidden="true"
                      className="bg-muted h-4 w-full animate-pulse rounded"
                    />
                    <div
                      aria-hidden="true"
                      className="bg-muted h-4 w-4/5 animate-pulse rounded"
                    />
                  </div>
                ))}
              </div>
            )}
            {actionLinks}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
