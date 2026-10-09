import { sydneyToday } from "@/lib/flashcards";
import { evalAgreement, meanDelta, type EvalItem } from "./helpers";

export { evalAgreement, meanDelta, percentage, percentLabel } from "./helpers";
export type { EvalItem } from "./helpers";

export type Range = 7 | 30 | 90;
export const checkedStatuses = [
  "agreed",
  "second_pass",
  "in_review",
  "reviewed",
] as const;
export type Question = {
  id: string;
  type: string;
  marks?: number;
  topic_id: string | null;
  source?: string;
  stem?: string;
};
export type Attempt = {
  id: string;
  status: string;
  check_status: string;
  reviews: { reason: string }[];
  max_marks: number | null;
  marked_at: string | null;
  created_at: string;
  question: Question | null;
};
export type Review = {
  id: string;
  reason: string;
  status: string;
  ai_mark: number | null;
  final_mark: number | null;
  resolved_at: string | null;
  created_at: string;
  attempt: { max_marks: number | null; question: Question | null } | null;
};
export type Topic = { id: string; parent_id: string | null; name: string };
export type Breakdown = {
  id: string;
  label: string;
  checked: number;
  agreed: number;
  review: number;
  deltas: number[];
};
export type Week = {
  day: string;
  written: number;
  checked: number;
  agreed: number;
  disputes: number;
};

export function parseRange(value: unknown): Range {
  return value === "7" ? 7 : value === "90" ? 90 : 30;
}
const DAY = 86_400_000;
function shiftDay(day: string, days: number) {
  return new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10);
}
/** Convert a Sydney wall-clock midnight to UTC, including either side of DST. */
export function sydneyMidnight(day: string) {
  const wall = Date.parse(`${day}T00:00:00Z`);
  let utc = wall;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(utc));
    const p = (type: string) => parts.find((part) => part.type === type)!.value;
    const local = Date.parse(
      `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}Z`,
    );
    utc += wall - local;
  }
  return new Date(utc).toISOString();
}
export function rangeWindow(range: Range, now = new Date()) {
  const today = sydneyToday(now);
  const from = shiftDay(today, 1 - range);
  return { from, today, since: sydneyMidnight(from), until: now.toISOString() };
}
export function weekKey(timestamp: string) {
  const day = sydneyToday(new Date(timestamp));
  const weekday = new Date(day).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}
export function marksBucket(type: string, marks: number | null) {
  if (type === "extended") return "Extended";
  if (marks === 1) return "1";
  if (marks != null && marks >= 2 && marks <= 3) return "2–3";
  if (marks != null && marks >= 4 && marks <= 5) return "4–5";
  if (marks != null && marks >= 6 && marks <= 8) return "6–8";
  return "Other short";
}
const written = (q: Question | null) =>
  q?.type === "short" || q?.type === "extended";
const delta = (r: Review) =>
  r.ai_mark != null && r.final_mark != null
    ? Math.abs(r.final_mark - r.ai_mark)
    : null;

/** Attempts use marked_at (created_at when null); reviews use their own creation/resolution dates independently. */
export function computeAccuracy(
  attempts: Attempt[],
  reviews: Review[],
  topics: Topic[],
  range: Range,
  now = new Date(),
) {
  const window = rangeWindow(range, now);
  const start = Date.parse(window.since),
    end = now.getTime();
  const inRange = (stamp: string | null) =>
    stamp != null && Date.parse(stamp) >= start && Date.parse(stamp) <= end;
  const answers = attempts.filter(
    (a) =>
      a.status === "marked" &&
      written(a.question) &&
      inRange(a.marked_at ?? a.created_at),
  );
  const checked = answers.filter((a) =>
    checkedStatuses.some((s) => s === a.check_status),
  );
  const resolved = reviews.filter(
    (r) => r.status === "resolved" && inRange(r.resolved_at),
  );
  const sentToReview = (a: Attempt) =>
    (a.check_status === "in_review" || a.check_status === "reviewed") &&
    a.reviews.some((r) => r.reason === "check_disagreed");
  const comparable = resolved.filter((r) => r.ai_mark != null);
  const deltas = comparable.flatMap((r) =>
    delta(r) == null ? [] : [delta(r)!],
  );
  const mix = checkedStatuses.map((status) => ({
    status,
    count: checked.filter((a) => a.check_status === status).length,
  }));
  const weeks = new Map<string, Week>();
  for (
    let day = weekKey(window.since);
    day <= window.today;
    day = shiftDay(day, 7)
  )
    weeks.set(day, { day, written: 0, checked: 0, agreed: 0, disputes: 0 });
  for (const a of answers) {
    const w = weeks.get(weekKey(a.marked_at ?? a.created_at))!;
    w.written++;
    if (checkedStatuses.some((s) => s === a.check_status)) w.checked++;
    if (a.check_status === "agreed") w.agreed++;
  }
  for (const r of reviews)
    if (r.reason === "student_dispute" && inRange(r.created_at))
      weeks.get(weekKey(r.created_at))!.disputes++;
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const parentTopic = (q: Question) => {
    let topic = q.topic_id ? topicMap.get(q.topic_id) : undefined;
    const seen = new Set<string>();
    while (topic?.parent_id && !seen.has(topic.id)) {
      seen.add(topic.id);
      const parent = topicMap.get(topic.parent_id);
      if (!parent) break;
      topic = parent;
    }
    return topic
      ? { id: topic.id, label: topic.name }
      : { id: "unassigned", label: "Unassigned topic" };
  };
  const byType = new Map<string, Breakdown>();
  const byTopic = new Map<string, Breakdown>();
  const row = (map: Map<string, Breakdown>, id: string, label = id) => {
    if (!map.has(id))
      map.set(id, { id, label, checked: 0, agreed: 0, review: 0, deltas: [] });
    return map.get(id)!;
  };
  for (const label of ["1", "2–3", "4–5", "6–8", "Extended"])
    row(byType, label);
  for (const a of checked) {
    const q = a.question!;
    const topic = parentTopic(q);
    for (const r of [
      row(byType, marksBucket(q.type, a.max_marks)),
      row(byTopic, topic.id, topic.label),
    ]) {
      r.checked++;
      if (a.check_status === "agreed") r.agreed++;
      if (sentToReview(a)) r.review++;
    }
  }
  for (const r of resolved) {
    const q = r.attempt?.question;
    const d = delta(r);
    if (!q || !written(q) || d == null) continue;
    const topic = parentTopic(q);
    row(byType, marksBucket(q.type, r.attempt!.max_marks)).deltas.push(d);
    row(byTopic, topic.id, topic.label).deltas.push(d);
  }
  const questions = new Map<
    string,
    { question: Question; checked: number; disagreed: number }
  >();
  for (const a of checked) {
    const q = a.question!;
    if (!questions.has(q.id))
      questions.set(q.id, { question: q, checked: 0, disagreed: 0 });
    const r = questions.get(q.id)!;
    r.checked++;
    if (a.check_status === "second_pass" || sentToReview(a)) r.disagreed++;
  }
  return {
    window,
    written: answers.length,
    checked: checked.length,
    mix,
    sentToReview: checked.filter(sentToReview).length,
    resolved: resolved.length,
    overrides: resolved.filter((r) => delta(r) != null && delta(r)! > 0).length,
    meanDelta: meanDelta(deltas),
    comparable: comparable.length,
    weeks: [...weeks.values()],
    byType: [...byType.values()],
    byTopic: [...byTopic.values()].sort(
      (a, b) => b.checked - a.checked || a.label.localeCompare(b.label),
    ),
    questions: [...questions.values()]
      .filter((q) => q.checked >= 3)
      .sort(
        (a, b) =>
          b.disagreed / b.checked - a.disagreed / a.checked ||
          b.checked - a.checked ||
          a.question.id.localeCompare(b.question.id),
      )
      .slice(0, 10),
  };
}

/** Every query pages through the PostgREST cap, with a stable unique order. */
export async function loadAccuracy(range: Range, now = new Date()) {
  const { admin } = await import("@/utils/supabase/admin");
  const db = admin();
  const { since, until } = rangeWindow(range, now);
  const question = "question:questions!inner(id,type,topic_id)";
  const attempts: Attempt[] = [];
  const reviews = new Map<string, Review>();
  const topics: Topic[] = [];
  await Promise.all([
    (async () => {
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from("attempts")
          .select(
            `id,status,check_status,max_marks,marked_at,created_at,${question},reviews:mark_reviews(reason)`,
          )
          .eq("status", "marked")
          .in("question.type", ["short", "extended"])
          .or(
            `and(marked_at.gte.${since},marked_at.lte.${until}),and(marked_at.is.null,created_at.gte.${since},created_at.lte.${until})`,
          )
          .order("marked_at")
          .order("id")
          .range(from, from + 999)
          .throwOnError();
        const batch = (data ?? []) as unknown as Attempt[];
        attempts.push(...batch);
        if (batch.length < 1000) break;
      }
    })(),
    ...(["created_at", "resolved_at"] as const).map(async (date) => {
      for (let from = 0; ; from += 1000) {
        let query = db
          .from("mark_reviews")
          .select(
            `id,reason,status,ai_mark,final_mark,resolved_at,created_at,attempt:attempts(max_marks,${question})`,
          )
          .gte(date, since)
          .lte(date, until);
        query =
          date === "created_at"
            ? query.eq("reason", "student_dispute")
            : query.eq("status", "resolved");
        const { data } = await query
          .order(date)
          .order("id")
          .range(from, from + 999)
          .throwOnError();
        const batch = (data ?? []) as unknown as Review[];
        for (const r of batch) reviews.set(r.id, r);
        if (batch.length < 1000) break;
      }
    }),
    (async () => {
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from("topics")
          .select("id,parent_id,name")
          .order("id")
          .range(from, from + 999)
          .throwOnError();
        topics.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
    })(),
  ]);
  const result = computeAccuracy(
    attempts,
    [...reviews.values()],
    topics,
    range,
    now,
  );
  if (result.questions.length) {
    const { data } = await db
      .from("questions")
      .select("id,source,stem")
      .in(
        "id",
        result.questions.map((r) => r.question.id),
      )
      .throwOnError();
    const details = new Map((data ?? []).map((q) => [q.id, q]));
    result.questions = result.questions.map((r) => ({
      ...r,
      question: { ...r.question, ...details.get(r.question.id) },
    }));
  }
  return result;
}

export type EvalRun = {
  meta: {
    stamp: string;
    label: string;
    items?: unknown;
    limit?: number | null;
    marker: { model: string };
  };
  items: EvalItem[];
};
/** Legacy full runs omit meta.items. Return summary fields, never item answers. */
export function latestEval(runs: EvalRun[]) {
  for (const run of [...runs].sort((a, b) =>
    b.meta.stamp.localeCompare(a.meta.stamp),
  )) {
    if (run.meta.items != null || run.meta.limit != null) continue;
    const summary = evalAgreement(run.items);
    if (summary.n)
      return {
        stamp: run.meta.stamp,
        label: run.meta.label,
        model: run.meta.marker.model,
        ...summary,
      };
  }
  return null;
}
