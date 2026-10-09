import { dateLabel } from "./practice";

/** Relative time for admin queues (§0): "just now", "12 min ago", "3 h ago", "2 d ago", then the date. */
export function ago(iso: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 14) return `${Math.floor(minutes / 1440)} d ago`;
  return dateLabel(iso);
}

/** Sydney calendar day of an instant, "YYYY-MM-DD". */
export function sydneyDay(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export type Sorting = { id: string; dir: "asc" | "desc" };
export type Pager = {
  page: number;
  pages: number;
  total: number;
  sort: Sorting;
};

/** Normalise repeated URL parameters before using them as filter values. */
export function singleParams(
  params: Record<string, string | string[] | undefined>,
) {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
}

export function tableParams(
  params: Record<string, string | undefined>,
  fallback: Sorting,
) {
  const page = Number(params.page);
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    sort: {
      id: params.sort || fallback.id,
      dir:
        params.dir === "asc" || params.dir === "desc"
          ? params.dir
          : fallback.dir,
    },
  };
}

/** Sorts rows by a column; null keys go last in both directions. */
export function sortRows<T>(
  rows: T[],
  key: (row: T) => string | number | null,
  dir: "asc" | "desc",
) {
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * (dir === "asc" ? 1 : -1);
  });
}

/** Stable ordering, missing values last, and a clamped 50-row server page. */
export function pageOf<T extends { id: string }>(
  rows: T[],
  keys: Record<string, (row: T) => string | number | null>,
  requested: Sorting,
  page: number,
  fallback: Sorting,
) {
  const sort = Object.hasOwn(keys, requested.id) ? requested : fallback;
  const key = keys[sort.id];
  const ordered = sortRows(
    [...rows].sort((a, b) => a.id.localeCompare(b.id)),
    key,
    sort.dir,
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const current = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(page) ? page : 1),
  );
  return {
    rows: ordered.slice((current - 1) * 50, current * 50),
    pager: { page: current, pages, total: rows.length, sort },
  };
}

/** RFC 4180 escaping plus spreadsheet formula protection for untrusted text. */
export function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (
            typeof value === "string" &&
            /^[\s\u0000-\u001f]*[=+@-]/.test(text)
          )
            text = "'" + text;
          return /[",\r\n]/.test(text)
            ? '"' + text.replaceAll('"', '""') + '"'
            : text;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Rounded percentage; absent when there are no possible marks. */
export const pctOf = (earned: number, possible: number) =>
  possible > 0 ? Math.round((100 * earned) / possible) : null;

/** Feedback labels shared by the inbox and student detail. */
export const FEEDBACK_KIND = {
  general: "General",
  bug: "Bug",
  content: "Content",
  marking: "Marking",
  feature: "Feature",
} as const;
