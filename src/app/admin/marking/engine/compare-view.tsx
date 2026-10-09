"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { AnnotatedFeedback } from "@/components/annotated-feedback";
import type { ReviewRow } from "@/lib/feedback";
import { compareDetails } from "./compare-actions";
import type { CompareData, CompareDetails, CompareRow } from "./compare";

const percent = (value: number | null) =>
  value == null ? "—" : `${(value * 100).toFixed(1)}%`;
function Mark({ result }: { result: CompareRow["a"] }) {
  return (
    <span
      className={
        result.agrees == null
          ? "text-muted-foreground"
          : result.agrees
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-700 dark:text-red-400"
      }
    >
      {result.state ?? (
        <>
          {result.mark} (
          {result.delta == null
            ? "Δ unavailable"
            : `Δ ${result.delta > 0 ? "+" : ""}${result.delta}`}
          )
        </>
      )}
    </span>
  );
}
function feedbackRow(
  row: CompareRow,
  detail: CompareDetails,
  run: "A" | "B",
  answer: string,
): ReviewRow {
  return {
    attempt_id: `${row.key}-${run}`,
    position: row.occurrence,
    question_id: row.id,
    type: "short",
    marks: detail[`marks${run}`] ?? 0,
    stem: "",
    stimulus: null,
    options: null,
    source: "",
    topic_id: null,
    year: null,
    choice_index: null,
    answer_text: answer,
    transcript: null,
    image_paths: null,
    flagged: false,
    status: "marked",
    check_status: "agreed",
    mark: detail[`mark${run}`] ?? null,
    max_marks: detail[`marks${run}`] ?? null,
    band: null,
    feedback: { comments: detail[`comments${run}`] },
    correct_index: null,
    criteria: null,
    sample_answer: null,
    explanation: null,
    review: null,
  };
}
export function CompareView({ data }: { data: CompareData }) {
  const [onlyDiffering, setOnlyDiffering] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, CompareDetails>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rows = data.rows.filter((row) => !onlyDiffering || row.differs);
  async function toggle(row: CompareRow) {
    const opening = !expanded.has(row.key);
    setExpanded((current) => {
      const next = new Set(current);
      if (opening) next.add(row.key);
      else next.delete(row.key);
      return next;
    });
    if (opening && !details[row.key]) {
      setErrors((current) => ({ ...current, [row.key]: "" }));
      try {
        const detail = await compareDetails(data.idA, data.idB, row.key);
        setDetails((current) => ({ ...current, [row.key]: detail }));
      } catch {
        setErrors((current) => ({
          ...current,
          [row.key]: "Could not load details. Close and expand to retry.",
        }));
      }
    }
  }
  const question = (row: CompareData["rows"][number]) => (
    <button
      type="button"
      className="w-full text-left wrap-anywhere"
      aria-expanded={expanded.has(row.key)}
      aria-label={`Expand ${row.section} ${row.id} ${row.label} answer ${row.occurrence + 1}`}
      onClick={() => void toggle(row)}
    >
      <span className="font-medium">
        {row.section} · {row.id}
        {row.label && ` · ${row.label}`}
        {row.section === "Held-out" && ` · answer ${row.occurrence + 1}`}
      </span>
      {row.stem && (
        <span className="text-muted-foreground block text-xs">{row.stem}</span>
      )}
      <span className="text-muted-foreground block text-xs">
        {expanded.has(row.key) ? "Hide details" : "Show details"}
      </span>
    </button>
  );
  const agreement = (row: CompareRow) => (
    <span
      aria-label={
        row.equal == null
          ? "Marks unavailable"
          : row.equal
            ? "Runs agree"
            : "Runs differ"
      }
    >
      {row.equal == null ? "—" : row.equal ? "✓" : "✗"}
    </span>
  );
  const expected = (row: CompareRow) =>
    row.expected === row.expectedB
      ? row.expected
      : `A: ${row.expected}; B: ${row.expectedB}`;
  const detailPanel = (row: CompareRow) => {
    const detail = details[row.key];
    return (
      <div
        className="bg-muted/40 min-w-0 space-y-4 rounded-md p-4 text-sm wrap-anywhere whitespace-normal"
        aria-label={`Details for ${row.section} ${row.id}`}
      >
        {!detail ? (
          <p role="status">{errors[row.key] || "Loading details…"}</p>
        ) : (
          <>
            {detail.notes && (
              <section>
                <h3 className="font-medium">Karan&apos;s feedback notes</h3>
                <p className="mt-2 whitespace-pre-wrap">{detail.notes}</p>
              </section>
            )}
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {(["A", "B"] as const).map((run) => {
                const answer =
                  detail[`answer${run}`] ??
                  (detail.answerA == null && detail.answerB == null
                    ? detail.answer
                    : undefined);
                const warning = detail[`answerWarning${run}`];
                const comments = detail[`comments${run}`];
                return (
                  <section
                    key={run}
                    className="min-w-0 space-y-2"
                    aria-label={`Run ${run} feedback`}
                  >
                    <h3 className="font-medium">Run {run} feedback</h3>
                    {comments && answer != null && !warning ? (
                      <AnnotatedFeedback
                        readOnly
                        showReferences={false}
                        row={feedbackRow(row, detail, run, answer)}
                      />
                    ) : (
                      <>
                        <h4 className="font-medium">Student answer</h4>
                        <p className="whitespace-pre-wrap">
                          {warning ??
                            answer ??
                            "Answer unavailable in saved fixtures."}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {detail[`feedback${run}`]}
                        </p>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };
  return (
    <div className="min-w-0 space-y-4" data-testid="compare-region">
      <Link className="text-sm underline" href="/admin/marking/engine?tab=runs">
        Back to runs
      </Link>
      <h2 className="text-lg font-semibold">Compare runs</h2>
      <div className="grid min-w-0 gap-2 text-sm wrap-anywhere md:grid-cols-2">
        <p>
          Run A: {data.labelA} ({data.idA}) · Exact {percent(data.a.exact)} ·
          Agreement {percent(data.a.agreement)} ({data.a.n} scored)
        </p>
        <p>
          Run B: {data.labelB} ({data.idB}) · Exact {percent(data.b.exact)} ·
          Agreement {percent(data.b.agreement)} ({data.b.n} scored)
        </p>
      </div>
      <p className="text-sm">
        {data.rows.length} items compared · {data.differing} differing ·{" "}
        {data.onlyA} only in A or unmatched · {data.onlyB} only in B or
        unmatched.
      </p>
      <p className="text-muted-foreground text-xs">
        ✓ means equal marks; ✗ means different marks. — means marks unavailable.
        Green/red Δ indicates agreement/disagreement with Karan using the saved
        band and ±1 rule on 6+ marks. Metrics use valid common items, excluding
        errors and exclusions. Legacy repeated answers are compared by
        occurrence; answers are hidden when their identity is ambiguous.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyDiffering}
          onChange={(event) => setOnlyDiffering(event.target.checked)}
        />
        Only rows where runs differ
      </label>
      {!rows.length && <p role="status">No matching rows.</p>}
      <ul className="space-y-3 md:hidden" aria-label="Compared items">
        {rows.map((row) => (
          <li
            key={row.key}
            className="min-w-0 space-y-3 rounded-lg border p-4 text-sm"
          >
            {question(row)}
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt>Karan&apos;s mark</dt>
                <dd>{expected(row)}</dd>
              </div>
              <div>
                <dt>✓/✗</dt>
                <dd>{agreement(row)}</dd>
              </div>
              <div>
                <dt>Run A (Δ)</dt>
                <dd>
                  <Mark result={row.a} />
                </dd>
              </div>
              <div>
                <dt>Run B (Δ)</dt>
                <dd>
                  <Mark result={row.b} />
                </dd>
              </div>
            </dl>
            {expanded.has(row.key) && detailPanel(row)}
          </li>
        ))}
      </ul>
      <table
        className="hidden w-full table-fixed text-sm md:table"
        aria-label="Compared items"
      >
        <colgroup>
          <col style={{ width: "40%" }} />
          {[20, 16, 16, 8].map((width, index) => (
            <col key={index} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {["Question", "Karan’s mark", "Run A (Δ)", "Run B (Δ)", "✓/✗"].map(
              (title) => (
                <th key={title} className="p-2 text-left whitespace-normal">
                  {title}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.key}>
              <tr className="border-t [&>td]:p-2 [&>td]:align-top [&>td]:wrap-anywhere">
                <td>{question(row)}</td>
                <td>{expected(row)}</td>
                <td>
                  <Mark result={row.a} />
                </td>
                <td>
                  <Mark result={row.b} />
                </td>
                <td>{agreement(row)}</td>
              </tr>
              {expanded.has(row.key) && (
                <tr>
                  <td colSpan={5}>{detailPanel(row)}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
