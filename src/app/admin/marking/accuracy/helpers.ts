export function percentage(n: number, total: number) {
  return total ? (n / total) * 100 : null;
}
export function percentLabel(
  n: number,
  total: number,
  empty = "No checked answers",
) {
  const p = percentage(n, total);
  return p == null ? empty : `${p.toFixed(1)}%`;
}
export function meanDelta(deltas: number[]) {
  return deltas.length
    ? deltas.reduce((sum, n) => sum + n, 0) / deltas.length
    : null;
}
export type EvalItem = {
  section: string;
  marks: number | null;
  expected: number | number[];
  mark: number | null;
  flags?: { excluded?: string };
  error?: string | null;
};

/** Held-out successful items only; range expectations use distance to the nearest end. */
export function evalAgreement(items: EvalItem[]) {
  let n = 0,
    exact = 0,
    agreed = 0;
  for (const item of items) {
    if (
      item.section !== "Held-out" ||
      item.flags?.excluded ||
      item.error ||
      item.mark == null ||
      item.marks == null
    )
      continue;
    const [lo, hi] =
      typeof item.expected === "number"
        ? [item.expected, item.expected]
        : item.expected;
    if (
      !Number.isFinite(item.mark) ||
      !Number.isFinite(item.marks) ||
      !Number.isFinite(lo) ||
      !Number.isFinite(hi) ||
      lo > hi
    )
      continue;
    const distance = Math.max(lo - item.mark, item.mark - hi, 0);
    n++;
    if (distance === 0) exact++;
    if (distance <= (item.marks >= 6 ? 1 : 0)) agreed++;
  }
  return { n, exact: n ? exact / n : null, agreement: n ? agreed / n : null };
}
