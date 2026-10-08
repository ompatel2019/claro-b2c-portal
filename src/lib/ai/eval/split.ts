import { createHash } from "node:crypto";

export const SPLIT_SEED = "claro-a1-2026-10-09";
const PER_QUESTION = 6;

/**
 * Held-out split for imported tutor-marked answers, fixed by seed so a re-run gives the same rows.
 * Per question: up to 6 test answers (never more than a third of that question's answers), whole
 * tutor marks only (the marker gives whole marks), taken round-robin across marks so bands are spread.
 */
export function splitExamples<
  T extends { question: string; source_hash: string; tutor_mark: number },
>(rows: T[]): (T & { split: "test" | "example" })[] {
  const order = (r: T) =>
    createHash("sha256").update(`${SPLIT_SEED}:${r.source_hash}`).digest("hex");
  const test = new Set<string>();
  for (const question of new Set(rows.map((r) => r.question))) {
    const all = rows.filter((r) => r.question === question);
    const quota = Math.min(PER_QUESTION, Math.floor(all.length / 3));
    const byMark = new Map<number, T[]>();
    for (const r of all
      .filter((r) => Number.isInteger(r.tutor_mark))
      .sort((a, b) => order(a).localeCompare(order(b))))
      byMark.set(r.tutor_mark, [...(byMark.get(r.tutor_mark) ?? []), r]);
    const queues = [...byMark.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, q]) => q);
    let picked = 0;
    while (picked < quota && queues.some((q) => q.length))
      for (const q of queues) {
        const next = q.shift();
        if (next && picked < quota) {
          test.add(next.source_hash);
          picked++;
        }
      }
  }
  return rows.map((r) => ({
    ...r,
    split: test.has(r.source_hash) ? "test" : "example",
  }));
}
