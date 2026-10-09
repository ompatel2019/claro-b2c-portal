import { markWritten } from "@/lib/marking/engine";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { scoreItem } from "./metrics";
import { renderFeedback } from "./judge";
import type { Row } from "./report";

export const excluded: Record<string, string> = {
  "fm-1": "studentResponse is byte-identical to fm-5 (fixture bug)",
  "ei-4": "3.5 is an invented midpoint",
};
export function emptyRow(item: {
  id: string;
  section: string;
  label: string;
  expected: number | number[];
  q?: MarkableQuestion;
}): Row {
  return {
    id: item.id,
    section: item.section,
    label: item.label,
    marks: item.q?.marks ?? null,
    expected: item.expected,
    mark: null,
    band: null,
    check: null,
    delta: null,
    flags:
      item.section === "A1" && excluded[item.id]
        ? { excluded: excluded[item.id] }
        : {},
    usd: 0,
    judgeUsd: 0,
    seconds: 0,
    verdict: null,
    feedback: null,
    error: null,
  };
}
/** CLI supplies its per-task cost reader; web receives the exact costs from callJson. */
export async function markEvalItem(
  row: Row,
  q: MarkableQuestion,
  answer: string,
  task: string,
  cost: () => Promise<number>,
  config?: Parameters<typeof markWritten>[4],
) {
  const started = performance.now();
  let result;
  try {
    // Keep the CLI's four-argument call unchanged.
    result = config
      ? await markWritten(q, answer, null, task, config)
      : await markWritten(q, answer, null, task);
  } finally {
    row.seconds = (performance.now() - started) / 1000;
    row.usd = await cost();
  }
  config?.signal?.throwIfAborted();
  row.mark = result.mark;
  row.band = result.band;
  row.check = config?.blind === false ? null : result.check;
  row.flags.validated = result.feedback.validated;
  const feedback = renderFeedback(result.feedback);
  if (row.section !== "Held-out") row.feedback = feedback;
  if (typeof row.expected === "number") {
    row.score = scoreItem({
      criteria: q.criteria,
      marks: q.marks,
      expected: row.expected,
      mark: result.mark,
    });
    row.firstScore = scoreItem({
      criteria: q.criteria,
      marks: q.marks,
      expected: row.expected,
      mark: result.check.marks[0],
    });
    row.delta = row.score.delta;
  } else
    row.flags.inRange =
      result.mark >= row.expected[0] && result.mark <= row.expected[1];
  return feedback;
}
