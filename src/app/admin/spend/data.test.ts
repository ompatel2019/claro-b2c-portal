import { expect, it } from "vitest";
import {
  computeSpend,
  parseRange,
  rangeWindow,
  type Usage,
  type MarkedAttempt,
} from "./data";
const now = new Date("2026-10-09T03:00:00Z");
const usage = (extra: Partial<Usage> = {}): Usage => ({
  created_at: "2026-10-09T02:30:00Z",
  user_id: "fake-student-a",
  model: "Model A",
  task: "mark_written",
  input_tokens: 100,
  cached_tokens: 20,
  output_tokens: 40,
  usd: 1,
  ...extra,
});
const students = [
  { id: "fake-student-a", full_name: "Student A" },
  { id: "fake-student-b", full_name: "Student B" },
];
const attempt = (extra: Partial<MarkedAttempt> = {}): MarkedAttempt => ({
  marked_at: "2026-10-09T02:30:00Z",
  note: null,
  question_id: "fake-question",
  question: { type: "short" },
  ...extra,
});
it("parses presets, repeated parameters and inclusive custom dates", () => {
  expect(parseRange()).toBe("month");
  expect(parseRange({ range: "month" })).toBe("month");
  expect(parseRange({ range: ["30", "all"] })).toBe("30");
  expect(parseRange({ range: "all" })).toBe("all");
  expect(parseRange({ from: "2024-02-29", to: "2024-03-01" })).toEqual({
    from: "2024-02-29",
    to: "2024-03-01",
  });
});
it.each([
  { range: "bad" },
  { from: "0001-01-01", to: "2026-10-09" },
  { from: "2019-12-31", to: "2026-10-09" },
  { from: "2026-10-09", to: "2026-10-10" },
  { from: "9999-12-31", to: "9999-12-31" },
  { range: "custom" },
  { from: "2026-02-29", to: "2026-03-01" },
  { from: "2026-04-31", to: "2026-05-01" },
  { from: "2026-10-10", to: "2026-10-09" },
  { from: "2026-10-01" },
  { to: "2026-10-09" },
  { from: "2026-1-01", to: "2026-10-09" },
])("defaults invalid ranges: %j", (params) =>
  expect(parseRange(params, now)).toBe("month"),
);
it("uses Sydney calendar months, 30 days and DST-aware custom endpoints", () => {
  expect(rangeWindow("month", now)).toEqual({
    from: "2026-10-01",
    to: "2026-10-09",
    since: "2026-09-30T14:00:00.000Z",
    until: now.toISOString(),
  });
  expect(rangeWindow("30", now).from).toBe("2026-09-10");
  expect(rangeWindow("all", now).since).toBeNull();
  const spring = rangeWindow({ from: "2026-10-04", to: "2026-10-04" }, now);
  expect(Date.parse(spring.until) - Date.parse(spring.since!)).toBe(
    23 * 3_600_000,
  );
  const autumn = rangeWindow({ from: "2026-04-05", to: "2026-04-05" }, now);
  expect(Date.parse(autumn.until) - Date.parse(autumn.since!)).toBe(
    25 * 3_600_000,
  );
  expect(rangeWindow("month", new Date("2026-09-30T14:01:00Z")).from).toBe(
    "2026-10-01",
  );
});
it("keeps KPIs and fixed student windows independent of the selected range", () => {
  const rows = [
    usage({ created_at: "2026-08-01T00:00:00Z", usd: 10 }),
    usage({ created_at: "2026-09-30T14:00:00+00:00", usd: 2 }),
    usage({ created_at: "2026-10-08T13:00:00Z", usd: 3 }),
    usage({ user_id: null, task: "eval", usd: 4 }),
    usage({ user_id: "fake-admin", usd: 5 }),
  ];
  const result = computeSpend(
    { month: 14, all: 24 },
    rows,
    [attempt()],
    students,
    { from: "2026-10-01", to: "2026-10-01" },
    now,
  );
  expect([result.today, result.month, result.all]).toEqual([12, 14, 24]);
  expect(result.byModel[0].usd).toBe(2);
  expect(result.avgPerMarkedWritten).toBeNull();
  expect(result.topStudents).toEqual([
    {
      id: "fake-student-a",
      name: "Student A",
      calls: 2,
      usd: 5,
      percent: (5 / 14) * 100,
    },
  ]);
  expect(result.over150).toEqual([]);
});
it("aggregates model tokens, task groups and daily model stacks; averages only written tasks", () => {
  const rows = [
    usage(),
    usage({ task: "check_written" }),
    usage({ task: "second_pass" }),
    usage({ task: "transcribe" }),
    usage({ task: "summary" }),
    usage({ task: "flashcard_mark" }),
    usage({ task: "admin_test" }),
    usage({ task: "eval" }),
    usage({ task: "unknown", model: "Model B" }),
  ];
  const result = computeSpend(
    { month: 0, all: 0 },
    rows,
    [
      attempt(),
      attempt({ question: { type: "extended" } }),
      attempt({ question_id: null, question: null }),
      attempt({ question: { type: "mcq" } }),
      attempt({ question: null }),
      attempt({ marked_at: "2026-09-01T00:00:00Z" }),
    ],
    students,
    "month",
    now,
  );
  expect(result.markedWritten).toBe(3);
  expect(result.avgPerMarkedWritten).toBe(4 / 3);
  expect(result.byModel).toEqual([
    {
      model: "Model A",
      calls: 8,
      input_tokens: 800,
      cached_tokens: 160,
      output_tokens: 320,
      usd: 8,
    },
    {
      model: "Model B",
      calls: 1,
      input_tokens: 100,
      cached_tokens: 20,
      output_tokens: 40,
      usd: 1,
    },
  ]);
  expect(
    result.byTask.map(({ name, calls, usd, avgPerCall }) => ({
      name,
      calls,
      usd,
      avgPerCall,
    })),
  ).toEqual([
    { name: "Marking", calls: 6, usd: 6, avgPerCall: 1 },
    { name: "Admin and evals", calls: 2, usd: 2, avgPerCall: 1 },
    { name: "Other", calls: 1, usd: 1, avgPerCall: 1 },
  ]);
  expect(result.byTask[0].tasks[0].avgPerCall).toBe(1);
  expect(result.perDay).toHaveLength(9);
  expect(result.perDay[0]).toEqual({ day: "2026-10-01", models: {}, usd: 0 });
  expect(result.perDay[8]).toEqual({
    day: "2026-10-09",
    models: { "Model A": 8, "Model B": 1 },
    usd: 9,
  });
});
it("handles empty data, all-time start and exclusive end boundaries", () => {
  const empty = computeSpend({ month: 0, all: 0 }, [], [], [], "all", now);
  expect(empty.perDay).toEqual([]);
  expect(empty.avgPerMarkedWritten).toBeNull();
  expect(empty.byTask.map((g) => g.name)).toEqual([
    "Marking",
    "Admin and evals",
  ]);
  const rows = [
    usage({ created_at: "2026-10-04T00:00:00Z", usd: "0.5" }),
    usage({ created_at: now.toISOString() }),
    usage({ created_at: "2026-10-10T00:00:00Z" }),
  ];
  const all = computeSpend(
    { month: 0, all: 0.5 },
    rows,
    [],
    students,
    "all",
    now,
  );
  expect(all.perDay[0].day).toBe("2026-10-04");
  expect(all.all).toBe(0.5);
  const custom = computeSpend(
    { month: 0, all: 0 },
    rows,
    [],
    students,
    { from: "2026-10-03", to: "2026-10-03" },
    now,
  );
  expect(custom.byModel).toEqual([]);
});
it("returns top ten and students strictly over 150 calls in the rolling hour", () => {
  const profiles = Array.from({ length: 12 }, (_, i) => ({
    id: `fake-student-${i}`,
    full_name: `Student ${String.fromCharCode(65 + i)}`,
  }));
  const rows = profiles.flatMap((s, i) =>
    Array.from({ length: i === 0 ? 151 : i === 1 ? 150 : 1 }, () =>
      usage({ user_id: s.id, usd: i + 1 }),
    ),
  );
  rows.push(
    usage({ user_id: profiles[0].id, created_at: "2026-10-09T01:59:59Z" }),
    usage({ user_id: "fake-admin" }),
  );
  const result = computeSpend(
    { month: 0, all: 0.5 },
    rows,
    [],
    profiles,
    "month",
    now,
  );
  expect(result.topStudents).toHaveLength(10);
  expect(result.topStudents[0].id).toBe(profiles[1].id);
  expect(result.over150).toEqual([
    { id: profiles[0].id, name: "Student A", calls: 151 },
  ]);
});
it("includes lower boundaries and excludes the midnight after a custom end day", () => {
  const rows = [
    usage({ created_at: "2026-10-03T13:59:59Z", usd: 10 }),
    usage({ created_at: "2026-10-03T14:00:00Z", usd: 2 }),
    usage({ created_at: "2026-10-04T12:59:59Z", usd: 3 }),
    usage({ created_at: "2026-10-04T13:00:00Z", usd: 20 }),
  ];
  const result = computeSpend(
    { month: 0, all: 0 },
    rows,
    [
      attempt({ marked_at: "2026-10-03T14:00:00Z" }),
      attempt({ marked_at: "2026-10-04T13:00:00Z" }),
    ],
    students,
    { from: "2026-10-04", to: "2026-10-04" },
    now,
  );
  expect(result.byModel[0].usd).toBe(5);
  expect(result.markedWritten).toBe(1);
  expect(result.avgPerMarkedWritten).toBe(5);
});
it("uses exactly 30 Sydney days for students and includes the rolling hour boundary", () => {
  const rows = [
    usage({ created_at: "2026-09-09T13:59:59Z", usd: 10 }),
    usage({ created_at: "2026-09-09T14:00:00Z", usd: 2 }),
    ...Array.from({ length: 151 }, () =>
      usage({ created_at: "2026-10-09T02:00:00Z", usd: 0 }),
    ),
  ];
  const result = computeSpend(
    { month: 0, all: 0.5 },
    rows,
    [attempt()],
    students,
    "month",
    now,
  );
  expect(result.topStudents[0]).toMatchObject({
    calls: 152,
    usd: 2,
    percent: 100,
  });
  expect(result.over150[0].calls).toBe(151);
  expect(result.avgPerMarkedWritten).toBe(0);
});

it("normalises real engine and eval names before grouping and averaging", () => {
  const rows = [
    "mark_written",
    "check_written",
    "second_pass",
    "transcribe_answer",
    "mark_flashcard",
    "session_summary",
    "admin_test:mark",
    "eval:20261009:0:mark",
    "eval:20261009:1:check",
    "eval:20261009:2:second_pass",
    "eval:20261009:3:judge",
    "seed-extract-economics",
    "seed-flashcards",
  ].map((task) => usage({ task }));
  const result = computeSpend(
    { month: 0, all: 0 },
    rows,
    [
      attempt(),
      attempt({ note: "No answer" }),
      attempt({ question_id: null, question: null, note: "No answer" }),
    ],
    students,
    "month",
    now,
  );
  expect(result.byTask.map((g) => [g.name, g.calls])).toEqual([
    ["Marking", 6],
    ["Admin and evals", 5],
    ["Other", 2],
  ]);
  expect(result.byTask[0].tasks.map((t) => t.task)).toEqual([
    "check_written",
    "flashcard_mark",
    "mark_written",
    "second_pass",
    "summary",
    "transcribe",
  ]);
  expect(result.byTask[1].tasks).toContainEqual({
    task: "eval",
    calls: 4,
    usd: 4,
    avgPerCall: 1,
  });
  expect(result.markedWritten).toBe(1);
  expect(result.avgPerMarkedWritten).toBe(4);
  expect(
    computeSpend(
      { month: 0, all: 0 },
      [],
      [attempt({ note: "No answer" })],
      students,
      "month",
      now,
    ).avgPerMarkedWritten,
  ).toBeNull();
});
it("accepts sane custom boundaries including today in Sydney", () => {
  expect(parseRange({ from: "2020-01-01", to: "2026-10-09" }, now)).toEqual({
    from: "2020-01-01",
    to: "2026-10-09",
  });
  expect(
    parseRange(
      { from: "2026-10-10", to: "2026-10-10" },
      new Date("2026-10-09T13:01:00Z"),
    ),
  ).toEqual({ from: "2026-10-10", to: "2026-10-10" });
});
