import { pageOf, tableParams } from "@/lib/admin";
import type { PaperListRow } from "@/lib/admin-papers";
import { ORIGIN_LABELS } from "@/lib/question-bank";
import { dateLabel } from "@/lib/practice";

const KEYS: Record<string, (p: PaperListRow) => string | number | null> = {
  title: (p) => p.title.toLowerCase(),
  year: (p) => p.year,
  source: (p) => p.source?.toLowerCase() || null,
  origin: (p) => p.origin,
  questions: (p) => p.questions,
  marks: (p) => p.total_marks,
  time: (p) => p.time_limit_min,
  status: (p) => p.status,
  sits: (p) => p.all_sits,
  avg: (p) => p.avg,
  ranks: (p) => Number(p.ranks_enabled),
  updated: (p) => p.updated_at,
};

/** Search every displayed value and ID, then sort and return a 50-row server page. */
export function paperListPage(
  all: PaperListRow[],
  f: Record<string, string | undefined>,
) {
  const { sort, page } = tableParams(f, { id: "updated", dir: "desc" });
  const term = (f.q ?? "").trim().toLowerCase();
  const filtered = all.filter(
    (p) =>
      (!f.status || p.status === f.status) &&
      [
        p.id,
        p.title,
        p.year,
        p.source,
        p.origin,
        ORIGIN_LABELS[p.origin as keyof typeof ORIGIN_LABELS] ?? p.origin,
        p.questions,
        p.total_marks,
        `${p.time_limit_min} min`,
        p.status,
        `${p.first_sits} / ${p.all_sits}`,
        paperAverageLabel(p),
        p.ranks_enabled ? "On" : "Off",
        dateLabel(p.updated_at, true),
      ].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(term),
      ),
  );
  const { rows, pager } = pageOf(filtered, KEYS, sort, page, {
    id: "updated",
    dir: "desc",
  });
  return { rows, pager };
}

export function paperAverageLabel(p: Pick<PaperListRow, "avg" | "all_sits">) {
  return p.avg == null
    ? p.all_sits
      ? "No marks yet"
      : "No sits"
    : `${p.avg}%`;
}
