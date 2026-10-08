// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
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
  MARKER: { model: "gpt-6.1-sol", effort: "low" },
  markWritten: mocks.mark,
}));
vi.mock("../openai", () => ({ callJson: mocks.judge }));
vi.mock("./report", () => ({ writeResults: mocks.report }));

const argv = process.argv;
const exitCode = process.exitCode;
const run = () => import("./run.mts" as string);
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
      gt: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      throwOnError: vi.fn(async () => ({
        data:
          table === "questions"
            ? [{ ...questions[0], id: claro[0].question_id }]
            : selected === "id"
              ? [{ id: 10 }]
              : [{ usd: 0.02 }],
      })),
    };
    return query;
  });
  mocks.mark.mockResolvedValue({
    mark: 3,
    band: "Some understanding",
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

it("dry-run renders exact grader and judge messages without marking, judging or usage reads", async () => {
  process.argv.push("--dry-run");
  await expect(run()).rejects.toThrow("exit 0");
  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.judge).not.toHaveBeenCalled();
  expect(mocks.report).not.toHaveBeenCalled();
  expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["questions"]);
  const [path, text] = mocks.write.mock.calls[0];
  expect(path).toMatch(/eval-runs\/\d{4}-\d{2}-\d{2}-\d{4}-dry-run.md$/);
  expect(text).toContain("### Grader messages");
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

it("runs sequentially with eval labels, separate costs and a clamped judge score", async () => {
  await run();
  expect(mocks.mark).toHaveBeenCalledTimes(2);
  for (const call of mocks.mark.mock.calls)
    expect(call.slice(2)).toEqual([null, "eval"]);
  expect(mocks.judge).toHaveBeenCalledWith(
    expect.objectContaining({
      task: "eval",
      model: "gpt-6-astra",
      effort: "low",
    }),
  );
  expect(mocks.mark.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.judge.mock.invocationCallOrder[0],
  );
  expect(mocks.judge.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.mark.mock.invocationCallOrder[1],
  );
  const [, rows] = mocks.report.mock.calls[0];
  expect(rows[0].feedback).toContain(
    '1. [Strength · Analysis] "trade" — Clear',
  );
  expect(rows[0]).toMatchObject({
    usd: 0.02,
    judgeUsd: 0.02,
    verdict: { score: 10 },
    error: null,
  });
  expect(rows[1]).toMatchObject({ usd: 0.02, judgeUsd: 0, verdict: null });
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
