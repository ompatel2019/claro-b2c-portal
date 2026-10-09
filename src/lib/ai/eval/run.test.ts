// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import a1 from "./a1-eval-set.json";
import claro from "./claro-set.json";
import questions from "./a1-questions.json";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  mark: vi.fn(),
  judge: vi.fn(),
  write: vi.fn(),
  report: vi.fn(),
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  mkdirSync: vi.fn(),
  writeFileSync: mocks.write,
}));
vi.mock("node:child_process", () => ({ execFileSync: vi.fn(() => "abc123") }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/marking/engine", () => ({
  MARKER: {
    model: "gpt-6.1-sol",
    effort: { grade: "low", check: "low", reconcile: "medium" },
  },
  markWritten: mocks.mark,
}));
vi.mock("../openai", () => ({ callJson: mocks.judge }));
vi.mock("@/lib/marking/examples", () => ({
  bandExamples: async () => [{ answer_text: "Anchor", tutor_mark: 2 }],
}));
vi.mock("./report", () => ({ writeResults: mocks.report }));

const argv = process.argv;
const exitCode = process.exitCode;
const run = () => import("./run.mts" as string);
const check = { status: "second_pass", marks: [1, 3, 3] };
const feedback = {
  justification: "Clear mechanism",
  comments: [
    {
      kind: "strength",
      quote: "trade",
      body: "Clear",
      tag: "Analysis" as const,
      next_mark: null,
    },
  ],
  next_band: "Add a judgement",
  why_not_higher: "Limited judgement",
  better_answer_outline: ["Define", "Explain", "Assess"],
  validated: true,
};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  process.argv = ["node", "run.mts", "--limit=1"];
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.from.mockImplementation((table: string) => {
    let selected = "";
    const query = {
      select: vi.fn((fields: string) => {
        selected = fields;
        return query;
      }),
      in: vi.fn(() => query),
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      throwOnError: vi.fn(async () => ({
        data:
          table === "questions"
            ? [
                { ...questions[0], id: claro[0].question_id },
                { ...questions[0], id: "a1-m2-21a" },
              ]
            : table === "marking_examples"
              ? [
                  {
                    question_id: "a1-m2-21a",
                    answer_text: "x",
                    tutor_mark: "2",
                  },
                ]
              : selected === "usd"
                ? [{ usd: 0.02 }]
                : [],
      })),
    };
    return query;
  });
  mocks.mark.mockResolvedValue({
    mark: 3,
    band: "Some understanding",
    check,
    feedback,
  });
  mocks.judge.mockResolvedValue({
    pros: [],
    cons: [],
    score: 12,
    lowConfidence: true,
    reasoning: "No checkable clauses",
  });
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
});

it.each([
  ["--items="],
  ["--items=-1"],
  ["--items=1.5"],
  ["--items=0,,1"],
  ["--items=0,"],
  ["--items=abc"],
  ["--items=9007199254740992"],
  ["--items=0", "--limit=1"],
])("rejects invalid item arguments %j before DB calls", async (...args) => {
  process.argv = ["node", "run.mts", ...args];
  await expect(run()).rejects.toThrow("Use --dry-run");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});

// Full array with no --limit: every A1 item, the one mocked held-out row, every Claro item.
const heldOutIndex = a1.length;
const itemCount = a1.length + 1 + claro.length;

it("rejects an out-of-range --items index before any marking call", async () => {
  process.argv = ["node", "run.mts", `--items=0,${itemCount}`];
  await expect(run()).rejects.toThrow(
    `--items indices must be less than the full item count (${itemCount})`,
  );
  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.judge).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.report).not.toHaveBeenCalled();
});

it("--items marks only the selected position and records it in the meta", async () => {
  process.argv = ["node", "run.mts", `--items=${heldOutIndex}`];
  await run();
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "a1-m2-21a" }),
    "x",
    null,
    expect.stringMatching(/^eval:\d{4}-\d{2}-\d{2}-\d{4}:0:mark$/),
  );
  expect(mocks.judge).not.toHaveBeenCalled();
  expect(mocks.report).toHaveBeenCalledTimes(1);
  const [meta, rows] = mocks.report.mock.calls[0];
  expect(meta).toMatchObject({
    items: [heldOutIndex],
    limit: null,
    blocked: false,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: "a1-m2-21a",
    section: "Held-out",
    expected: 2,
    mark: 3,
    error: null,
  });
});

it("dry-run renders exact grader and judge messages without marking, judging or usage reads", async () => {
  process.argv.push("--dry-run");
  await expect(run()).rejects.toThrow("exit 0");
  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.judge).not.toHaveBeenCalled();
  expect(mocks.report).not.toHaveBeenCalled();
  expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
    "marking_examples",
    "questions",
  ]);
  const [path, text] = mocks.write.mock.calls[0];
  expect(path).toMatch(/eval-runs\/\d{4}-\d{2}-\d{2}-\d{4}-dry-run.md$/);
  expect(text).toContain("### Grader messages");
  expect(text).toContain("## Held-out: a1-m2-21a");
  expect(text).toContain('<marked_answer tutor_mark=\\"2\\">');
  expect(text).toContain("### Judge messages");
  expect(text).toContain("[Placeholder: rendered student-facing feedback]");
  expect(text).toContain("KARAN'S CRITIQUE OF THE EARLIER AI OUTPUT");
});

it("refuses at $80 before loading questions or making any calls", async () => {
  mocks.rpc.mockResolvedValue({ data: 80, error: null });
  await expect(run()).rejects.toThrow("exit 1");
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.judge).not.toHaveBeenCalled();
});

it("costs each item by its own eval task, judges only A1 and clamps the judge score", async () => {
  await run();
  expect(mocks.mark).toHaveBeenCalledTimes(3);
  expect(mocks.mark.mock.calls.map((call) => call.slice(2))).toEqual(
    [0, 1, 2].map((i) => [
      null,
      expect.stringMatching(
        new RegExp(`^eval:\\d{4}-\\d{2}-\\d{2}-\\d{4}:${i}:mark$`),
      ),
    ]),
  );
  expect(mocks.judge).toHaveBeenCalledTimes(1);
  expect(mocks.judge).toHaveBeenCalledWith(
    expect.objectContaining({
      task: expect.stringMatching(/:0:judge$/),
      model: "gpt-6-astra",
      effort: "low",
    }),
  );
  const [, rows] = mocks.report.mock.calls[0];
  expect(rows[0].feedback).toContain(
    '1. [Strength · Analysis] "trade" — Clear',
  );
  expect(rows[0]).toMatchObject({
    check,
    firstScore: expect.objectContaining({
      exact: expect.any(Boolean),
      within1: expect.any(Boolean),
      band: expect.any(Boolean),
    }),
    usd: 0.02,
    judgeUsd: 0.02,
    verdict: { score: 10 },
    error: null,
  });
  expect(rows[0].firstScore.delta).toBe(1 - rows[0].expected);
  expect(rows[0].firstScore.exact).toBe(rows[0].expected === 1);
  expect(rows[0].firstScore.within1).toBe(Math.abs(1 - rows[0].expected) <= 1);
  expect(rows[1]).toMatchObject({
    section: "Held-out",
    expected: 2,
    feedback: null,
    score: { delta: 1, exact: false, band: false },
    judgeUsd: 0,
    verdict: null,
  });
  expect(rows[2]).toMatchObject({
    section: "Claro",
    check,
    usd: 0.02,
    judgeUsd: 0,
    verdict: null,
  });
});

it("records a thrown marking item without scoring it as zero and continues", async () => {
  mocks.mark.mockRejectedValueOnce(new Error("Canned failure"));
  await run();
  const [, rows] = mocks.report.mock.calls[0];
  expect(rows[0]).toMatchObject({
    mark: null,
    error: "Canned failure",
    usd: 0.02,
  });
  expect(rows[0].score).toBeUndefined();
  expect(rows[1].error).toBeNull();
  expect(mocks.judge).not.toHaveBeenCalled();
});

it("rechecks spend before the judge and saves completed work when blocked", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: 79 })
    .mockResolvedValueOnce({ data: 79 })
    .mockResolvedValue({ data: 80 });
  await run();
  expect(mocks.mark).toHaveBeenCalledTimes(1);
  expect(mocks.judge).not.toHaveBeenCalled();
  const [meta, rows] = mocks.report.mock.calls[0];
  expect(meta.blocked).toBe(true);
  expect(rows[0].error).toContain("Eval refused before judge");
  expect(process.exitCode).toBe(1);
});
