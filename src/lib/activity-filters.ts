import { addDays } from "./activity";
import { kindLabels, type SessionStatus } from "./session-summary";
export type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : "";
export function validDay(v: string) {
  return (
    !v.startsWith("0000") &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
export function parseActivityFilters(params: SearchParams, today: string) {
  const pick = (key: string, choices: string[], fallback = "") =>
    choices.includes(one(params[key])) ? one(params[key]) : fallback;
  const date = validDay(one(params.date)) ? one(params.date) : "";
  const range = date
    ? ""
    : pick(
        "range",
        ["7", "30", "90", "custom"],
        validDay(one(params.from)) || validDay(one(params.to)) ? "custom" : "",
      );
  let from =
    date ||
    (range && range !== "custom"
      ? addDays(today, 1 - Number(range))
      : validDay(one(params.from))
        ? one(params.from)
        : "");
  let to =
    date ||
    (range && range !== "custom"
      ? today
      : validDay(one(params.to))
        ? one(params.to)
        : "");
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(one(params.page));
  return {
    kind: pick("kind", Object.keys(kindLabels)),
    status: pick("status", ["progress", "marking", "finished", "provisional"]),
    topic: one(params.topic).slice(0, 100),
    q: one(params.q).trim().slice(0, 200),
    sort: pick("sort", ["newest", "oldest", "highest", "lowest"], "newest"),
    date,
    range,
    from,
    to,
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1,
  };
}
export type ActivityFilters = ReturnType<typeof parseActivityFilters>;
export function activityHref(
  f: ActivityFilters,
  changes: Record<string, string | number | undefined> = {},
) {
  const p = new URLSearchParams();
  const merged = { ...f, ...changes };
  if ("date" in changes && !changes.date && f.date) {
    merged.from = "";
    merged.to = "";
  }
  for (const [key, value] of Object.entries(merged))
    if (
      value &&
      !(key === "sort" && value === "newest") &&
      !(key === "page" && value === 1) &&
      !(
        ["from", "to"].includes(key) &&
        (merged.date || (merged.range && merged.range !== "custom"))
      )
    )
      p.set(key, String(value));
  return `/student/activity${p.size ? `?${p}` : ""}`;
}
export type ActivityRow = {
  id: string;
  kind: string;
  paper_id: string | null;
  title: string;
  status: SessionStatus;
  provisional: boolean;
  study: boolean;
  pct: number | null;
  items: number;
  answered: number;
  elapsed_s: number;
  started_at: string;
  finished_at: string | null;
};
export type ActivityData = {
  rows: ActivityRow[];
  total: number;
  all_total: number;
  page: number;
  kind_total: number;
  kinds: Record<string, number>;
  stats: {
    sessions: number;
    questions: number;
    average: number | null;
    best: number | null;
  };
};
