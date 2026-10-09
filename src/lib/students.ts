import { addDays } from "./activity";
import { csv } from "./admin";
import { modeLabel, plural, topicNames, type Topic } from "./practice";

/** A session row on the admin detail page (§3.12 columns, read-only). */
export type SessionRow = {
  id: string;
  kind: string;
  config: {
    mode?: string;
    topics?: string[];
    subtopics?: string[];
    card_ids?: string[];
    question?: { stem?: string; marks?: number; criteria_text?: string };
  };
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  elapsed_s: number;
  summary?: unknown;
  attempts: {
    status: string;
    check_status: string;
    answered?: boolean;
    day?: string | null;
  }[];
};

export function sessionKind(kind: string) {
  return (
    { sprint: "Sprint", single: "Mark my answer", flashcards: "Flashcards" }[
      kind
    ] ?? "Removed session"
  );
}

/** "Short answer sprint · Inflation", "Flashcards · Study", "Removed session", "Mark my answer". */
export function sessionTitle(s: SessionRow, topics: Topic[]) {
  if (s.kind === "flashcards")
    return `Flashcards · ${s.config.mode === "test" ? "Test" : "Study"}`;
  if (s.kind !== "sprint") return sessionKind(s.kind);
  const places = s.config.subtopics?.length
    ? s.config.subtopics
    : s.config.topics;
  return `${modeLabel(s.config.mode)} sprint · ${topicNames(places, topics)}`;
}

export function sessionItems(s: SessionRow) {
  return s.kind === "flashcards"
    ? plural(s.config.card_ids?.length ?? 0, "card")
    : plural(s.attempts.length, "question");
}

/** Status pill: in progress, marking (finished, marks pending), provisional, or finished. */
export function sessionStatus(s: SessionRow) {
  if (!s.finished_at) return "In progress" as const;
  const live = s.attempts.filter((a) => a.status !== "skipped");
  if (
    live.some(
      (a) =>
        !["marked", "failed", "unreadable"].includes(a.status) ||
        (a.status === "marked" && a.check_status === "pending"),
    )
  )
    return "Marking" as const;
  if (live.some((a) => a.check_status === "in_review"))
    return "Provisional" as const;
  return "Finished" as const;
}

/** One row of /admin/students (§4.2). */
export type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  year_level: number | null;
  school: string | null;
  joined: string;
  last_active: string | null;
  sessions_7d: number;
  sessions_total: number;
  answered: number;
  avg_30: number | null;
  streak: number;
  open_disputes: number;
  ai_spend: number;
  blocked: boolean;
};

export const ACTIVITY = {
  active7: "Active 7 days",
  active30: "Active 30 days",
  inactive30: "Inactive 30+ days",
  never: "Never started",
} as const;

export type StudentFilters = {
  q?: string;
  year?: string;
  activity?: string;
  disputes?: string;
};

export function filterStudents(
  rows: StudentRow[],
  f: StudentFilters,
  /** Sydney day of a timestamp, injected so the filter stays pure. */
  dayOf: (iso: string) => string,
  today: string,
) {
  const q = f.q?.trim().toLowerCase();
  const week = addDays(today, -6);
  const month = addDays(today, -29);
  return rows.filter((r) => {
    if (
      q &&
      !(r.full_name ?? "").toLowerCase().includes(q) &&
      !r.email.toLowerCase().includes(q) &&
      !r.id.toLowerCase().includes(q) &&
      !(r.school ?? "").toLowerCase().includes(q) &&
      !(r.blocked && "blocked".includes(q))
    )
      return false;
    if (f.year && String(r.year_level) !== f.year) return false;
    if (f.disputes === "1" && r.open_disputes === 0) return false;
    if (f.activity) {
      const last = r.last_active ? dayOf(r.last_active) : null;
      if (f.activity === "never") return !last;
      if (!last) return false;
      if (f.activity === "active7") return last >= week;
      if (f.activity === "active30") return last >= month;
      if (f.activity === "inactive30") return last < month;
    }
    return true;
  });
}

export const STUDENT_KEYS: Record<
  string,
  (r: StudentRow) => string | number | null
> = {
  name: (r) => (r.full_name || "").toLowerCase() || null,
  email: (r) => r.email.toLowerCase(),
  year: (r) => r.year_level,
  school: (r) => r.school?.toLowerCase() || null,
  joined: (r) => r.joined,
  last: (r) => r.last_active,
  sessions7: (r) => r.sessions_7d,
  sessions: (r) => r.sessions_total,
  answered: (r) => r.answered,
  avg: (r) => r.avg_30,
  streak: (r) => r.streak,
  disputes: (r) => r.open_disputes,
  spend: (r) => r.ai_spend,
  blocked: (r) => Number(r.blocked),
};

export function studentsCsv(rows: StudentRow[]) {
  return csv([
    [
      "Name",
      "Email",
      "Year",
      "School",
      "Joined",
      "Last active",
      "Sessions 7d",
      "Sessions total",
      "Questions answered",
      "Avg % (30 days)",
      "Streak",
      "Open disputes",
      "AI spend (USD)",
      "Blocked",
    ],
    ...rows.map((r) => [
      r.full_name,
      r.email,
      r.year_level,
      r.school,
      r.joined,
      r.last_active,
      r.sessions_7d,
      r.sessions_total,
      r.answered,
      r.avg_30,
      r.streak,
      r.open_disputes,
      r.ai_spend.toFixed(4),
      r.blocked ? "yes" : "no",
    ]),
  ]);
}

/** Only application-local paths can become links from student-supplied feedback. */
export function safeLocalPath(path: string | null) {
  return path && /^\/(?!\/)/.test(path) && !/[\\\u0000-\u0020]/.test(path)
    ? path
    : null;
}

/** Reject impossible calendar dates before formatting or filtering them. */
export function calendarDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

/** URL filters for the read-only admin Sessions tab. */
export function filterSessions(
  rows: SessionRow[],
  filters: {
    kind?: string;
    status?: string;
    topic?: string;
    date?: string;
    from?: string;
    to?: string;
    range?: string;
  },
  dayOf: (iso: string) => string,
  today?: string,
) {
  const from =
    calendarDate(filters.from) ??
    (today && ["7", "30", "90"].includes(filters.range ?? "")
      ? addDays(today, 1 - Number(filters.range))
      : null);
  const to = calendarDate(filters.to);
  return rows.filter(
    (s) =>
      (!from || dayOf(s.started_at) >= from) &&
      (!to || dayOf(s.started_at) <= to) &&
      (!filters.kind || s.kind === filters.kind) &&
      (!filters.status || sessionStatus(s) === filters.status) &&
      (!filters.topic ||
        [...(s.config.topics ?? []), ...(s.config.subtopics ?? [])].includes(
          filters.topic,
        )) &&
      (!filters.date ||
        dayOf(s.started_at) === filters.date ||
        (s.finished_at && dayOf(s.finished_at) === filters.date) ||
        s.attempts.some((a) => a.day === filters.date)),
  );
}

/** session_review has no question join for a student's pasted question. */
export function ownQuestionReview(
  row: import("./feedback").ReviewRow,
  question: unknown,
) {
  if (row.question_id || !question || typeof question !== "object") return row;
  const own = question as { stem?: unknown; marks?: unknown };
  const marks = Number(own.marks ?? row.max_marks ?? 0);
  return {
    ...row,
    type: "short" as const,
    source: "Own question",
    stem: typeof own.stem === "string" ? own.stem : "Own question",
    marks: Number.isFinite(marks) ? marks : 0,
    topic_id: null,
    criteria: null,
    sample_answer: null,
  };
}
