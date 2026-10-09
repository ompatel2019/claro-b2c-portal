import { addDays, type ActivityDay } from "./activity";

import { timer, modeLabel, topicNames } from "./practice";

const SYDNEY = "Australia/Sydney";

/** "Good morning" before 12, afternoon before 17, else evening (Sydney time). */
export function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}

/** "Friday 9 October". */
export const longDate = (now = new Date()) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(now)
    .replace(",", "");

/** Questions answered this Mon–Sun week and last (Sydney days). */
export function weekCounts(days: ActivityDay[], today: string) {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const lastMonday = addDays(monday, -7);
  const sum = (from: string, to: string) =>
    days
      .filter((d) => d.day >= from && d.day <= to)
      .reduce((n, d) => n + d.questions, 0);
  return {
    thisWeek: sum(monday, today),
    lastWeek: sum(lastMonday, addDays(monday, -1)),
  };
}

/** One marked attempt reduced to what Home needs. */
export type Marked = {
  day: string;
  type: "mcq" | "short" | "extended";
  mark: number;
  max: number;
};

const pctOf = (rows: Marked[]) => {
  const max = rows.reduce((n, r) => n + r.max, 0);
  return max ? (rows.reduce((n, r) => n + r.mark, 0) / max) * 100 : null;
};

/** % of marks earned over the last 30 days and the 30 before that. */
export function averages(rows: Marked[], today: string) {
  const from = addDays(today, -29);
  const prev = addDays(today, -59);
  return {
    avg30: pctOf(rows.filter((r) => r.day >= from)),
    prev30: pctOf(rows.filter((r) => r.day >= prev && r.day < from)),
  };
}

export type Range = "30" | "90" | "all";

/** Daily % for the range, the same-length previous period shifted onto it, and per-type % for the range. */
export function trend(rows: Marked[], today: string, range: Range) {
  const first = rows.reduce((m, r) => (r.day < m ? r.day : m), today);
  const span =
    range === "all"
      ? Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000) + 1
      : Number(range);
  const from = addDays(today, -(span - 1));
  const daily = (lo: string, hi: string, shift: number) => {
    const by = new Map<string, Marked[]>();
    for (const r of rows)
      if (r.day >= lo && r.day <= hi)
        by.set(r.day, [...(by.get(r.day) ?? []), r]);
    return [...by]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, rs]) => ({ day: addDays(day, shift), pct: pctOf(rs)! }));
  };
  const inRange = rows.filter((r) => r.day >= from);
  return {
    from,
    span,
    points: daily(from, today, 0),
    previous:
      range === "all"
        ? []
        : daily(addDays(from, -span), addDays(from, -1), span),
    byType: (["mcq", "short", "extended"] as const).map((type) => ({
      type,
      pct: pctOf(inRange.filter((r) => r.type === type)),
    })),
  };
}

/** Paused sessions retain saved elapsed time. Recency uses started_at because
 * the runner only persists elapsed_s; only recent sessions show a timer. */
export function continueTime(
  session: {
    started_at: string;
    elapsed_s: number | null;
  },
  limit: number | null,
  now: Date,
) {
  const started = Date.parse(session.started_at);
  const remaining = (limit ?? 0) - (session.elapsed_s ?? 0);
  if (remaining > 0 && now.getTime() - started <= 30 * 60_000)
    return `${timer(remaining)} left`;
  const minutes = Math.max(0, Math.floor((now.getTime() - started) / 60_000));
  if (minutes === 0) return "Started just now";
  const relative =
    minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h`
        : `${Math.floor(minutes / 1440)}d`;
  return `Started ${relative} ago`;
}

/** One session title for history and resume cards, using the shared mode/topic labels. */
export function sessionTitle(
  session: {
    kind?: string;
    config: { mode?: string; topics?: string[]; subtopics?: string[] };
  },
  topics: import("./practice").Topic[],
) {
  if (session.kind === "single") return "Mark my answer";
  if (session.kind === "flashcards")
    return `Flashcards · ${session.config.mode === "test" ? "Test" : "Study"}`;
  const ids = session.config.subtopics?.length
    ? session.config.subtopics
    : session.config.topics;
  return `${modeLabel(session.config.mode)} sprint · ${topicNames(ids, topics)}`;
}
