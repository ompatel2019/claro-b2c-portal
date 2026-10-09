import type { ActivityData, ActivityFilters } from "./activity-filters";
import { isStudentSession } from "./session-summary";

/** Keep the existing RPC's ordering and filters while excluding retired session kinds.
 * When legacy rows exist, read every matching page before repaging so they cannot
 * leave gaps or contribute to the score statistics. */
export async function studentActivity(
  filters: ActivityFilters,
  read: (page: number) => Promise<ActivityData>,
  allTotal: number,
): Promise<ActivityData> {
  const first = await read(filters.page);
  const kinds = Object.fromEntries(
    Object.entries(first.kinds).filter(([kind]) => isStudentSession({ kind })),
  );
  const kindTotal = Object.values(kinds).reduce((n, count) => n + count, 0);
  if (filters.kind || kindTotal === first.kind_total)
    return {
      ...first,
      rows: first.rows.filter(isStudentSession),
      kinds,
      kind_total: kindTotal,
      all_total: allTotal,
    };

  const rows = [] as ActivityData["rows"];
  const pages = Math.max(1, Math.ceil(first.total / 20));
  for (let page = 1; page <= pages; page++) {
    const result = page === first.page ? first : await read(page);
    rows.push(...result.rows.filter(isStudentSession));
  }
  const page = Math.max(1, Math.min(filters.page, Math.ceil(rows.length / 20)));
  const scores = rows
    .filter((r) => !r.study && r.status !== "Marking" && r.pct !== null)
    .map((r) => r.pct!);
  return {
    rows: rows.slice((page - 1) * 20, page * 20),
    total: rows.length,
    all_total: allTotal,
    page,
    kinds,
    kind_total: kindTotal,
    stats: {
      sessions: rows.length,
      questions: rows
        .filter((r) => r.kind !== "flashcards")
        .reduce((n, r) => n + r.answered, 0),
      average: scores.length
        ? scores.reduce((n, pct) => n + pct, 0) / scores.length
        : null,
      best: scores.length ? Math.max(...scores) : null,
    },
  };
}
