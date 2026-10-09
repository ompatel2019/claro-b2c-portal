import { singleParams, sydneyDay } from "@/lib/admin";
import { sydneyMidnight } from "../marking/accuracy/data";

export type Range = "month" | "30" | "all" | { from: string; to: string };
export type Usage = {
  created_at: string;
  user_id: string | null;
  model: string;
  task: string;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  usd: number | string;
};
export type SpendTotal = Pick<Usage, "created_at" | "usd">;
export type Student = { id: string; full_name: string };
export type MarkedAttempt = {
  marked_at: string;
  question_id: string | null;
  question: { type: string } | null;
};
const DAY = 86_400_000;
function shiftDay(day: string, days: number) {
  return new Date(Date.parse(day) + days * DAY).toISOString().slice(0, 10);
}
function validDay(day: string | undefined): day is string {
  return (
    !!day &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function parseRange(
  params: Record<string, string | string[] | undefined> = {},
): Range {
  const { range, from, to } = singleParams(params);
  if (from !== undefined || to !== undefined || range === "custom")
    return validDay(from) && validDay(to) && from <= to
      ? { from, to }
      : "month";
  return range === "30" || range === "all" ? range : "month";
}
/** Presets end at now; a custom end day is inclusive, capped at now. */
export function rangeWindow(range: Range, now = new Date()) {
  const today = sydneyDay(now);
  const from =
    typeof range === "object"
      ? range.from
      : range === "all"
        ? null
        : range === "30"
          ? shiftDay(today, -29)
          : `${today.slice(0, 7)}-01`;
  const to = typeof range === "object" && range.to < today ? range.to : today;
  return {
    from,
    to,
    since: from === null ? null : sydneyMidnight(from),
    until:
      typeof range === "object" && range.to < today
        ? sydneyMidnight(shiftDay(range.to, 1))
        : now.toISOString(),
  };
}
const markingTasks = [
  "mark_written",
  "check_written",
  "second_pass",
  "transcribe",
  "summary",
  "flashcard_mark",
];
const writtenTasks = markingTasks.slice(0, 4);
const adminTasks = ["admin_test", "eval"];

/** Inputs are server reads: totals all-time, usage covering range and fixed 30 days, marked attempts in range, student profiles only. */
export function computeSpend(
  totals: SpendTotal[],
  usage: Usage[],
  attempts: MarkedAttempt[],
  students: Student[],
  range: Range,
  now = new Date(),
) {
  const window = rangeWindow(range, now);
  const todayKey = sydneyDay(now);
  const monthKey = todayKey.slice(0, 7);
  let today = 0,
    month = 0,
    all = 0;
  for (const row of totals) {
    if (Date.parse(row.created_at) >= now.getTime()) continue;
    const day = sydneyDay(row.created_at),
      usd = Number(row.usd);
    all += usd;
    if (day === todayKey) today += usd;
    if (day.slice(0, 7) === monthKey) month += usd;
  }
  const inRange = (date: string) =>
    (!window.since || Date.parse(date) >= Date.parse(window.since)) &&
    Date.parse(date) < Date.parse(window.until);
  const rows = usage.filter((r) => inRange(r.created_at));
  const byModel = new Map<
    string,
    {
      model: string;
      calls: number;
      input_tokens: number;
      cached_tokens: number;
      output_tokens: number;
      usd: number;
    }
  >();
  const byTask = new Map<
    string,
    { task: string; calls: number; usd: number; avgPerCall: number }
  >();
  const days = new Map<
    string,
    { day: string; models: Record<string, number>; usd: number }
  >();
  const from =
    window.from ?? rows.map((r) => sydneyDay(r.created_at)).sort()[0] ?? null;
  if (from)
    for (let day = from; day <= window.to; day = shiftDay(day, 1))
      days.set(day, { day, models: {}, usd: 0 });
  let writtenUsd = 0;
  for (const r of rows) {
    const usd = Number(r.usd);
    const model = byModel.get(r.model) ?? {
      model: r.model,
      calls: 0,
      input_tokens: 0,
      cached_tokens: 0,
      output_tokens: 0,
      usd: 0,
    };
    model.calls++;
    model.input_tokens += r.input_tokens;
    model.cached_tokens += r.cached_tokens;
    model.output_tokens += r.output_tokens;
    model.usd += usd;
    byModel.set(r.model, model);
    const task = byTask.get(r.task) ?? {
      task: r.task,
      calls: 0,
      usd: 0,
      avgPerCall: 0,
    };
    task.calls++;
    task.usd += usd;
    task.avgPerCall = task.usd / task.calls;
    byTask.set(r.task, task);
    const day = days.get(sydneyDay(r.created_at))!;
    day.usd += usd;
    day.models[r.model] = (day.models[r.model] ?? 0) + usd;
    if (writtenTasks.includes(r.task)) writtenUsd += usd;
  }
  const groups = ["Marking", "Admin and evals", "Other"]
    .map((name) => {
      const tasks = [...byTask.values()]
        .filter(
          (r) =>
            (markingTasks.includes(r.task)
              ? "Marking"
              : adminTasks.includes(r.task)
                ? "Admin and evals"
                : "Other") === name,
        )
        .sort((a, b) => b.usd - a.usd || a.task.localeCompare(b.task));
      const calls = tasks.reduce((n, r) => n + r.calls, 0),
        usd = tasks.reduce((n, r) => n + r.usd, 0);
      return {
        name,
        tasks,
        calls,
        usd,
        avgPerCall: calls ? usd / calls : null,
      };
    })
    .filter((g) => g.name !== "Other" || g.tasks.length);
  const markedWritten = attempts.filter(
    (a) =>
      inRange(a.marked_at) &&
      (a.question_id === null ||
        ["short", "extended"].includes(a.question?.type ?? "")),
  ).length;
  const since30 = sydneyMidnight(shiftDay(todayKey, -29));
  const hour = new Date(now.getTime() - 3_600_000).toISOString();
  const studentMap = new Map(students.map((s) => [s.id, s.full_name]));
  const studentUsage = new Map<
    string,
    { id: string; name: string; calls: number; usd: number; hourCalls: number }
  >();
  let spend30 = 0;
  for (const r of usage) {
    if (
      Date.parse(r.created_at) < Date.parse(since30) ||
      Date.parse(r.created_at) >= now.getTime()
    )
      continue;
    const usd = Number(r.usd);
    spend30 += usd;
    if (r.user_id === null || !studentMap.has(r.user_id)) continue;
    const s = studentUsage.get(r.user_id) ?? {
      id: r.user_id,
      name: studentMap.get(r.user_id)!,
      calls: 0,
      usd: 0,
      hourCalls: 0,
    };
    s.calls++;
    s.usd += usd;
    if (Date.parse(r.created_at) >= Date.parse(hour)) s.hourCalls++;
    studentUsage.set(s.id, s);
  }
  return {
    window: { ...window, from },
    today,
    month,
    all,
    markedWritten,
    avgPerMarkedWritten: markedWritten ? writtenUsd / markedWritten : null,
    perDay: [...days.values()],
    byModel: [...byModel.values()].sort(
      (a, b) => b.usd - a.usd || a.model.localeCompare(b.model),
    ),
    byTask: groups,
    topStudents: [...studentUsage.values()]
      .sort((a, b) => b.usd - a.usd || a.id.localeCompare(b.id))
      .slice(0, 10)
      .map(({ id, name, calls, usd }) => ({
        id,
        name,
        calls,
        usd,
        percent: spend30 ? (usd / spend30) * 100 : 0,
      })),
    over150: [...studentUsage.values()]
      .filter((s) => s.hourCalls > 150)
      .sort((a, b) => b.hourCalls - a.hourCalls || a.id.localeCompare(b.id))
      .map(({ id, name, hourCalls }) => ({ id, name, calls: hourCalls })),
  };
}
