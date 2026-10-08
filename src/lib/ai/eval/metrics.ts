import { EVAL_BLOCK_USD } from "../prices";
import type { Criterion } from "@/lib/marking/grade";

export function evalBlocked(spentUsd: number): boolean {
  return spentUsd >= EVAL_BLOCK_USD;
}

export function sameBand(criteria: Criterion[], a: number, b: number): boolean {
  const bands = (mark: number) =>
    criteria.filter(
      ({ min, max }) =>
        mark !== 0 &&
        [Math.floor(mark), Math.ceil(mark)].some((n) => n >= min && n <= max),
    );
  const left = bands(a),
    right = bands(b);
  return (
    left.some((band) => right.includes(band)) || (!left.length && !right.length)
  );
}

export function scoreItem({
  criteria,
  expected,
  mark,
}: {
  criteria: Criterion[];
  marks: number;
  expected: number;
  mark: number;
}) {
  const delta = mark - expected;
  return {
    delta,
    exact: mark === expected,
    within1: Math.abs(delta) <= 1,
    band: sameBand(criteria, expected, mark),
  };
}

export function summarise(
  rows: {
    score: ReturnType<typeof scoreItem>;
    usd: number;
    seconds: number;
    verdict?: {
      pros: { delivered: boolean }[];
      cons: { fixed: boolean }[];
      score: number;
    } | null;
  }[],
) {
  const n = rows.length;
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const verdicts = rows.flatMap((row) => (row.verdict ? [row.verdict] : []));
  return {
    n,
    exact: mean(rows.map((r) => Number(r.score.exact))),
    within1: mean(rows.map((r) => Number(r.score.within1))),
    band: mean(rows.map((r) => Number(r.score.band))),
    meanSigned: mean(rows.map((r) => r.score.delta)),
    meanAbs: mean(rows.map((r) => Math.abs(r.score.delta))),
    prosKept: mean(
      verdicts.flatMap((v) => v.pros.map((p) => Number(p.delivered))),
    ),
    consFixed: mean(
      verdicts.flatMap((v) => v.cons.map((c) => Number(c.fixed))),
    ),
    judgeMean: mean(verdicts.map((v) => v.score)),
    usdPerAnswer: mean(rows.map((r) => r.usd)),
    secondsPerAnswer: mean(rows.map((r) => r.seconds)),
  };
}
