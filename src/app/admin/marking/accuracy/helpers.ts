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
  score?: { band?: boolean };
  flags?: { excluded?: string };
  error?: string | null;
};

/** Zero inside an expected range; otherwise distance to its nearest end. */
export function evalMarkDistance(item: EvalItem) {
  const [lo, hi] =
    typeof item.expected === "number"
      ? [item.expected, item.expected]
      : item.expected;
  if (
    item.mark == null ||
    !Number.isFinite(item.mark) ||
    !Number.isFinite(lo) ||
    !Number.isFinite(hi) ||
    lo > hi
  )
    return null;
  return Math.max(lo - item.mark, item.mark - hi, 0);
}

/** Accuracy defaults to successful held-out items (ranges use nearest-end distance).
 * Engine uses all items with valid marks and expectations, regardless of section/flags. */
export function evalAgreement(
  items: EvalItem[],
  scope: "held-out" | "numeric" = "held-out",
) {
  let n = 0,
    exact = 0,
    agreed = 0;
  for (const item of items) {
    if (
      (scope === "held-out" &&
        (item.section !== "Held-out" ||
          item.flags?.excluded ||
          item.error ||
          item.marks == null)) ||
      item.mark == null
    )
      continue;
    if (scope === "held-out" && !Number.isFinite(item.marks)) continue;
    const distance = evalMarkDistance(item);
    if (distance == null) continue;
    n++;
    if (distance === 0) exact++;
    const band = item.score?.band;
    const sameBand = band === undefined ? distance === 0 : band === true;
    if (sameBand && ((item.marks ?? 0) < 6 || distance <= 1)) agreed++;
  }
  return { n, exact: n ? exact / n : null, agreement: n ? agreed / n : null };
}
