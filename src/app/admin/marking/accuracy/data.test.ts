// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn() };
  return { admin: () => client };
});
import { admin } from "@/utils/supabase/admin";
import {
  computeAccuracy,
  latestEval,
  loadAccuracy,
  marksBucket,
  parseRange,
  rangeWindow,
  sydneyMidnight,
  weekKey,
  type Attempt,
  type EvalRun,
  type Question,
  type Review,
} from "./data";
import { evalAgreement } from "./helpers";

// Friday 9 Oct 2026, 14:00 Sydney (AEDT, UTC+11; DST began Sunday 4 Oct).
const now = new Date("2026-10-09T03:00:00.000Z");
const question = (
  id: string,
  type: string,
  marks: number,
  topic_id: string | null,
): Question => ({
  id,
  type,
  marks,
  topic_id,
  source: `${id} source`,
  stem: `${id} stem`,
});
const q1 = question("q1", "short", 2, "t3-inflation");
const q2 = question("q2", "extended", 8, "t2-growth");
const q3 = question("q3", "short", 4, null);
const q4 = question("q4", "short", 6, "t9-orphan");
const mcq = question("qm", "mcq", 1, "t3-inflation");
const topics = [
  { id: "t3", parent_id: null, name: "Inflation" },
  { id: "t3-inflation", parent_id: "t3", name: "Causes" },
  { id: "t2", parent_id: null, name: "Growth" },
  { id: "t2-growth", parent_id: "t2", name: "Measuring" },
  { id: "t9-orphan", parent_id: "t9", name: "Orphan" },
];
let n = 0;
const attempt = (
  question: Question | null,
  check_status: string,
  marked_at: string,
  extra: Partial<Attempt> = {},
): Attempt => ({
  id: `a${++n}`,
  status: "marked",
  check_status,
  reviews: [],
  max_marks: question?.marks ?? null,
  marked_at,
  created_at: marked_at,
  question,
  ...extra,
});
const review = (
  reason: string,
  status: string,
  ai_mark: number | null,
  final_mark: number | null,
  created_at: string,
  resolved_at: string | null,
  question: Question | null | undefined,
): Review => ({
  id: `r${++n}`,
  reason,
  status,
  ai_mark,
  final_mark,
  created_at,
  resolved_at,
  attempt:
    question === undefined
      ? null
      : { max_marks: question?.marks ?? null, question },
});
// Range 7 → 3 Oct (Sydney midnight = 2 Oct 14:00Z, still AEST) through now.
const attempts = [
  attempt(q1, "agreed", "2026-10-08T01:00:00Z"),
  attempt(q1, "second_pass", "2026-10-08T02:00:00Z"),
  attempt(q1, "in_review", "2026-10-08T03:00:00Z", {
    reviews: [{ reason: "check_disagreed" }],
  }),
  attempt(q1, "agreed", "2026-10-07T01:00:00Z"),
  // 00:30 Monday 5 Oct in Sydney, still Sunday 4 Oct in UTC.
  attempt(q2, "reviewed", "2026-10-04T13:30:00Z", {
    reviews: [{ reason: "check_disagreed" }],
  }),
  // 23:30 Sunday 4 Oct in Sydney: written but never checked.
  attempt(q2, "skipped", "2026-10-04T12:30:00Z"),
  attempt(mcq, "skipped", "2026-10-08T01:00:00Z"),
  // One second before the window opens, and exactly on it.
  attempt(q3, "agreed", "2026-10-02T13:59:59Z"),
  attempt(q3, "agreed", "2026-10-02T14:00:00Z"),
  attempt(q1, "agreed", "2026-10-08T01:00:00Z", { status: "failed" }),
  attempt(q4, "agreed", "2026-10-06T01:00:00Z"),
  attempt(null, "agreed", "2026-10-08T01:00:00Z"),
];
const reviews = [
  review(
    "check_disagreed",
    "resolved",
    1,
    2,
    "2026-10-08T00:00:00Z",
    "2026-10-08T05:00:00Z",
    q1,
  ),
  review(
    "student_dispute",
    "resolved",
    5,
    5,
    "2026-10-08T00:00:00Z",
    "2026-10-08T06:00:00Z",
    q2,
  ),
  review("student_dispute", "open", 7, null, "2026-10-04T13:30:00Z", null, q2),
  review(
    "spot_check",
    "resolved",
    null,
    3,
    "2026-10-08T00:00:00Z",
    "2026-10-08T07:00:00Z",
    q1,
  ),
  review(
    "check_disagreed",
    "resolved",
    2,
    4,
    "2026-10-01T00:00:00Z",
    "2026-10-01T05:00:00Z",
    q1,
  ),
  // Disputed before the range, resolved inside it: an override but not a dispute this week.
  review(
    "student_dispute",
    "resolved",
    3,
    2,
    "2026-09-30T00:00:00Z",
    "2026-10-07T05:00:00Z",
    q3,
  ),
  review(
    "check_disagreed",
    "resolved",
    1,
    3,
    "2026-10-08T00:00:00Z",
    "2026-10-08T08:00:00Z",
    undefined,
  ),
];
beforeEach(() => vi.resetAllMocks());

it("parses the range with 30 as the default", () => {
  expect(parseRange("7")).toBe(7);
  expect(parseRange("90")).toBe(90);
  expect(parseRange("30")).toBe(30);
  expect(parseRange("14")).toBe(30);
  expect(parseRange(undefined)).toBe(30);
  expect(parseRange(["7"])).toBe(30);
});

it("windows run from Sydney midnight on either side of daylight saving", () => {
  expect(sydneyMidnight("2026-10-03")).toBe("2026-10-02T14:00:00.000Z");
  expect(sydneyMidnight("2026-10-04")).toBe("2026-10-03T14:00:00.000Z");
  expect(sydneyMidnight("2026-10-05")).toBe("2026-10-04T13:00:00.000Z");
  expect(rangeWindow(7, now)).toEqual({
    from: "2026-10-03",
    today: "2026-10-09",
    since: "2026-10-02T14:00:00.000Z",
    until: "2026-10-09T03:00:00.000Z",
  });
  expect(rangeWindow(30, now)).toMatchObject({
    from: "2026-09-10",
    since: "2026-09-09T14:00:00.000Z",
  });
  expect(rangeWindow(90, now)).toMatchObject({
    from: "2026-07-12",
    since: "2026-07-11T14:00:00.000Z",
  });
  // 14:00Z Thursday is already Friday in Sydney.
  expect(rangeWindow(7, new Date("2026-10-08T14:00:00Z")).today).toBe(
    "2026-10-09",
  );
});

it("weeks start on Sydney Mondays, not UTC ones", () => {
  expect(weekKey("2026-10-04T13:30:00Z")).toBe("2026-10-05");
  expect(weekKey("2026-10-04T12:59:00Z")).toBe("2026-09-28");
  expect(weekKey("2026-10-05T00:00:00Z")).toBe("2026-10-05");
  expect(weekKey("2026-10-11T12:59:00Z")).toBe("2026-10-05");
  expect(weekKey("2026-10-11T13:00:00Z")).toBe("2026-10-12");
});

it("buckets by max marks, with extended always its own bucket", () => {
  expect(marksBucket("short", 1)).toBe("1");
  expect(marksBucket("short", 2)).toBe("2–3");
  expect(marksBucket("short", 3)).toBe("2–3");
  expect(marksBucket("short", 4)).toBe("4–5");
  expect(marksBucket("short", 5)).toBe("4–5");
  expect(marksBucket("short", 6)).toBe("6–8");
  expect(marksBucket("short", 8)).toBe("6–8");
  expect(marksBucket("extended", 8)).toBe("Extended");
  expect(marksBucket("extended", 3)).toBe("Extended");
  expect(marksBucket("short", null)).toBe("Other short");
  expect(marksBucket("short", 9)).toBe("Other short");
});

it("counts KPIs over marked written answers in range and reviews resolved in range", () => {
  const result = computeAccuracy(attempts, reviews, topics, 7, now);
  expect(result.window.from).toBe("2026-10-03");
  expect(result.written).toBe(8);
  expect(result.checked).toBe(7);
  expect(result.mix).toEqual([
    { status: "agreed", count: 4 },
    { status: "second_pass", count: 1 },
    { status: "in_review", count: 1 },
    { status: "reviewed", count: 1 },
  ]);
  expect(result.resolved).toBe(5);
  expect(result.overrides).toBe(3);
  expect(result.comparable).toBe(4);
  expect(result.meanDelta).toBe(1);
  expect(result.overrides / result.comparable).toBe(0.75);
  expect(result.sentToReview).toBe(2);
});

it("reports nulls, not zeros, when there is nothing to divide by", () => {
  const result = computeAccuracy([], [], [], 30, now);
  expect(result.written).toBe(0);
  expect(result.checked).toBe(0);
  expect(result.resolved).toBe(0);
  expect(result.meanDelta).toBeNull();
  expect(result.comparable).toBe(0);
  expect(result.byTopic).toEqual([]);
  expect(result.questions).toEqual([]);
  expect(result.byType.map((r) => [r.label, r.checked, r.deltas])).toEqual([
    ["1", 0, []],
    ["2–3", 0, []],
    ["4–5", 0, []],
    ["6–8", 0, []],
    ["Extended", 0, []],
  ]);
  expect(result.weeks).toHaveLength(5);
  expect(result.weeks[0]).toEqual({
    day: "2026-09-07",
    written: 0,
    checked: 0,
    agreed: 0,
    disputes: 0,
  });
  expect(result.weeks.at(-1)!.day).toBe("2026-10-05");
});

it("buckets answers and disputes into Sydney weeks across the UTC date change", () => {
  const { weeks } = computeAccuracy(attempts, reviews, topics, 7, now);
  expect(weeks).toEqual([
    { day: "2026-09-28", written: 2, checked: 1, agreed: 1, disputes: 0 },
    { day: "2026-10-05", written: 6, checked: 6, agreed: 3, disputes: 2 },
  ]);
});

it("breaks down by marks bucket and by parent topic", () => {
  const { byType, byTopic } = computeAccuracy(
    attempts,
    reviews,
    topics,
    7,
    now,
  );
  const rows = (list: typeof byType) =>
    list.map((r) => [r.label, r.checked, r.agreed, r.review, r.deltas]);
  expect(rows(byType)).toEqual([
    ["1", 0, 0, 0, []],
    ["2–3", 4, 2, 1, [1]],
    ["4–5", 1, 1, 0, [1]],
    ["6–8", 1, 1, 0, []],
    ["Extended", 1, 0, 1, [0]],
  ]);
  expect(rows(byTopic)).toEqual([
    ["Inflation", 4, 2, 1, [1]],
    ["Growth", 1, 0, 1, [0]],
    ["Orphan", 1, 1, 0, []],
    ["Unassigned topic", 1, 1, 0, [1]],
  ]);
  expect(byTopic.map((r) => r.id)).toEqual([
    "t3",
    "t2",
    "t9-orphan",
    "unassigned",
  ]);
});

it("lists questions with at least 3 checked answers by disagreement rate, top 10", () => {
  const stamp = "2026-10-08T01:00:00Z";
  const checked = (q: Question, agreed: number, disagreed: number) => [
    ...Array.from({ length: agreed }, () => attempt(q, "agreed", stamp)),
    ...Array.from({ length: disagreed }, () =>
      attempt(q, "second_pass", stamp),
    ),
  ];
  const many = Array.from({ length: 11 }, (_, i) =>
    question(`x${String(i).padStart(2, "0")}`, "short", 2, null),
  );
  const rows = [
    ...checked(q1, 1, 1),
    ...checked(q2, 0, 3),
    ...checked(q3, 2, 2),
    ...checked(q4, 1, 2),
    ...many.flatMap((q) => checked(q, 3, 0)),
  ];
  const { questions } = computeAccuracy(rows, [], topics, 7, now);
  expect(questions).toHaveLength(10);
  expect(
    questions.slice(0, 3).map((q) => [q.question.id, q.checked, q.disagreed]),
  ).toEqual([
    ["q2", 3, 3],
    ["q4", 3, 2],
    ["q3", 4, 2],
  ]);
  // Ties on rate and count fall back to id, so x10 is the one cut.
  expect(questions.slice(3).map((q) => q.question.id)).toEqual(
    many.slice(0, 7).map((q) => q.id),
  );
  expect(questions[0].question).toEqual(q2);
});

it("uses marking time with a null-only creation fallback for counts and weeks", () => {
  const recent = "2026-10-08T01:00:00Z";
  const old = "2026-09-01T00:00:00Z";
  const result = computeAccuracy(
    [
      attempt(q1, "agreed", recent, { created_at: old }),
      attempt(q1, "agreed", old, { created_at: recent }),
      attempt(q1, "agreed", recent, { marked_at: null }),
      attempt(q2, "second_pass", "2026-10-04T12:30:00Z", { marked_at: null }),
      attempt(q1, "agreed", old, { marked_at: null }),
      attempt(q1, "agreed", recent, {
        marked_at: null,
        created_at: "2026-10-10T00:00:00Z",
      }),
      attempt(mcq, "agreed", recent, { marked_at: null }),
    ],
    [],
    topics,
    7,
    now,
  );
  expect(result.written).toBe(3);
  expect(result.checked).toBe(3);
  expect(result.mix.map((part) => part.count)).toEqual([2, 1, 0, 0]);
  expect(result.weeks).toEqual([
    { day: "2026-09-28", written: 1, checked: 1, agreed: 0, disputes: 0 },
    { day: "2026-10-05", written: 2, checked: 2, agreed: 2, disputes: 0 },
  ]);
  expect(result.byType.find((row) => row.label === "2–3")).toMatchObject({
    checked: 2,
    agreed: 2,
  });
  expect(result.byType.find((row) => row.label === "Extended")).toMatchObject({
    checked: 1,
    agreed: 0,
  });
});

function chain(pages: unknown[][]) {
  const c = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    throwOnError: vi.fn(),
  };
  for (const key of [
    "select",
    "eq",
    "in",
    "gte",
    "lte",
    "or",
    "order",
    "range",
  ] as const)
    c[key].mockReturnValue(c);
  for (const page of pages)
    c.throwOnError.mockResolvedValueOnce({ data: page });
  return c;
}

it("loads every table past the 1000-row page cap and dedupes reviews fetched twice", async () => {
  const stamp = "2026-10-08T01:00:00Z";
  const row = (i: number) => ({
    ...attempt(q1, "agreed", stamp),
    id: `p${i}`,
  });
  const first = Array.from({ length: 1000 }, (_, i) => row(i));
  first[0].marked_at = null;
  const attemptsChain = chain([first, [row(1000)]]);
  const dispute = review("student_dispute", "resolved", 1, 2, stamp, stamp, q1);
  const disputes = chain([[dispute]]);
  const resolved = chain([[dispute]]);
  const details = chain([[{ id: "q1", source: "source", stem: "stem" }]]);
  const topicsChain = chain([
    Array.from({ length: 1000 }, (_, i) => ({
      id: `t${i}`,
      parent_id: null,
      name: `T${i}`,
    })),
    // The subtopic only arrives on page 2; its parent "t3" is on page 1.
    [{ id: "t3-inflation", parent_id: "t3", name: "Causes" }],
  ]);
  // Each page starts a fresh builder from the same table; reviews run two queries.
  const reviewChains = [disputes, resolved];
  const db = admin() as unknown as { from: ReturnType<typeof vi.fn> };
  db.from.mockImplementation((table: string) =>
    table === "attempts"
      ? attemptsChain
      : table === "questions"
        ? details
        : table === "topics"
          ? topicsChain
          : reviewChains.shift(),
  );

  const result = await loadAccuracy(7, now);
  expect(result.written).toBe(1001);
  expect(result.checked).toBe(1001);
  expect(result.resolved).toBe(1);
  expect(result.weeks.at(-1)!.disputes).toBe(1);
  expect(result.byTopic[0]).toMatchObject({ id: "t3", label: "T3" });

  expect(attemptsChain.eq).toHaveBeenCalledWith("status", "marked");
  expect(attemptsChain.or).toHaveBeenCalledWith(
    "and(marked_at.gte.2026-10-02T14:00:00.000Z,marked_at.lte.2026-10-09T03:00:00.000Z),and(marked_at.is.null,created_at.gte.2026-10-02T14:00:00.000Z,created_at.lte.2026-10-09T03:00:00.000Z)",
  );
  expect(attemptsChain.order.mock.calls).toEqual([
    ["marked_at"],
    ["id"],
    ["marked_at"],
    ["id"],
  ]);
  expect(attemptsChain.range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  expect(disputes.eq).toHaveBeenCalledWith("reason", "student_dispute");
  expect(disputes.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  expect(disputes.range).toHaveBeenCalledTimes(1);
  expect(resolved.eq).toHaveBeenCalledWith("status", "resolved");
  expect(resolved.gte).toHaveBeenCalledWith("resolved_at", expect.any(String));
  expect(topicsChain.range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  // Only summary columns: no student ids or names leave the database.
  const selected = attemptsChain.select.mock.calls[0][0] as string;
  expect(selected).not.toMatch(
    /user_id|full_name|answer_text|feedback|stem|source/,
  );
  expect(selected).toContain("question:questions!inner(id,type,topic_id)");
  expect(selected).toContain("reviews:mark_reviews(reason)");
  expect(attemptsChain.in).toHaveBeenCalledWith("question.type", [
    "short",
    "extended",
  ]);
  expect(details.select).toHaveBeenCalledWith("id,source,stem");
  expect(details.in).toHaveBeenCalledWith("id", ["q1"]);
  expect(result.questions[0].question).toMatchObject({
    source: "source",
    stem: "stem",
  });
});

it("excludes spot checks and disputes from checker disagreement, keeping reviewed in the mix", () => {
  const stamp = "2026-10-08T01:00:00Z";
  const rows = [
    attempt(q1, "reviewed", stamp, { reviews: [{ reason: "spot_check" }] }),
    attempt(q1, "reviewed", stamp, {
      reviews: [{ reason: "student_dispute" }],
    }),
    attempt(q1, "reviewed", stamp, {
      reviews: [{ reason: "spot_check" }, { reason: "check_disagreed" }],
    }),
    attempt(q1, "reviewed", stamp),
    attempt(q1, "second_pass", stamp),
    attempt(q1, "in_review", stamp, {
      reviews: [{ reason: "check_disagreed" }],
    }),
    attempt(q1, "in_review", stamp),
  ];
  const result = computeAccuracy(rows, [], topics, 7, now);
  expect(result.sentToReview).toBe(2);
  expect(result.mix.map((r) => r.count)).toEqual([0, 1, 2, 4]);
  expect(result.byType.find((r) => r.id === "2–3")?.review).toBe(2);
  expect(result.byTopic[0].review).toBe(2);
  expect(result.questions[0]).toMatchObject({ checked: 7, disagreed: 3 });
});

it("excludes an open student dispute from review rates and checker disagreements", () => {
  const stamp = "2026-10-08T01:00:00Z";
  const result = computeAccuracy(
    [
      attempt(q1, "agreed", stamp),
      attempt(q1, "second_pass", stamp),
      attempt(q1, "in_review", stamp, {
        reviews: [{ reason: "student_dispute" }],
      }),
    ],
    [review("student_dispute", "open", 1, null, stamp, null, q1)],
    topics,
    7,
    now,
  );
  expect(result.checked).toBe(3);
  expect(result.mix.map((r) => r.count)).toEqual([1, 1, 1, 0]);
  expect(result.sentToReview).toBe(0);
  expect(result.byType.find((r) => r.id === "2–3")).toMatchObject({
    checked: 3,
    review: 0,
  });
  expect(result.byTopic[0]).toMatchObject({ checked: 3, review: 0 });
  expect(result.questions[0]).toMatchObject({ checked: 3, disagreed: 1 });
  expect(result.weeks.at(-1)!.disputes).toBe(1);
});

it("has no comparable reviews when resolved reviews have no AI mark", () => {
  const stamp = "2026-10-08T01:00:00Z";
  const result = computeAccuracy(
    [],
    [review("spot_check", "resolved", null, 2, stamp, stamp, q1)],
    topics,
    7,
    now,
  );
  expect(result.resolved).toBe(1);
  expect(result.comparable).toBe(0);
  expect(result.overrides).toBe(0);
  expect(result.meanDelta).toBeNull();
});

it("computes held-out exact and agreement with exact fallback when band is absent", () => {
  const item = (
    marks: number,
    expected: number | number[],
    mark: number | null,
  ) => ({ section: "Held-out", marks, expected, mark });
  const items = [
    item(5, 3, 3),
    item(5, 3, 4),
    item(6, 3, 4),
    item(6, 3, 1),
    item(5, [2, 3], 2.5),
    item(5, [2, 3], 4),
    item(6, [2, 3], 1),
    item(8, [2, 3], 4),
    item(8, [2, 3], 5),
    item(6, 2, null),
    { ...item(6, 2, 2), error: "failed" },
    { ...item(6, 2, 2), flags: { excluded: "excluded" } },
    { ...item(6, 2, 2), section: "A1" },
    { ...item(6, 2, 2), section: "Claro" },
    { ...item(6, 2, 2), marks: null },
  ];
  expect(evalAgreement(items)).toEqual({
    n: 9,
    exact: 2 / 9,
    agreement: 2 / 9,
  });
  expect(evalAgreement([])).toEqual({ n: 0, exact: null, agreement: null });
});

it("picks the newest full eval with successful held-out items, returning only summary fields", () => {
  const run = (
    stamp: string,
    extra: Partial<EvalRun["meta"]> = {},
    items: EvalRun["items"] = [
      {
        section: "Held-out",
        marks: 6,
        expected: 3,
        mark: 4,
        score: { band: true },
      },
    ],
  ): EvalRun => ({
    meta: { stamp, label: `run ${stamp}`, marker: { model: "m" }, ...extra },
    items,
  });
  const runs = [
    run("2026-10-09-1159"),
    run("2026-10-09-1415"),
    run("2026-10-09-1440", { items: [114, 209] }),
    run("2026-10-09-1500", { limit: 1 }),
    run("2026-10-09-1600", {}, []),
  ];
  expect(latestEval(runs)).toEqual({
    stamp: "2026-10-09-1415",
    label: "run 2026-10-09-1415",
    model: "m",
    n: 1,
    agreement: 1,
    exact: 0,
  });
  expect(latestEval([])).toBeNull();
  expect(latestEval(runs.slice(2))).toBeNull();
});

it.each(["agreed", "reviewed"])(
  "a spot-checked agreed answer (%s) has no checker disagreement",
  (status) => {
    const stamp = "2026-10-08T01:00:00Z";
    const rows = Array.from({ length: 3 }, () =>
      attempt(q1, status, stamp, { reviews: [{ reason: "spot_check" }] }),
    );
    const result = computeAccuracy(rows, [], topics, 7, now);
    expect(result.sentToReview).toBe(0);
    expect(result.byType.find((r) => r.id === "2–3")?.review).toBe(0);
    expect(result.byTopic[0].review).toBe(0);
    expect(result.questions[0].disagreed).toBe(0);
  },
);
