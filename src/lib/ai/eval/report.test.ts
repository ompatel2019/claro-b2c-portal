// @vitest-environment node
import { expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { writeResults, type Row } from "./report";

vi.mock("node:fs", () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn() }));

it("excludes fixture bugs and failures from headline metrics, but reports their costs and errors", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const row: Row = {
    id: "ge-4",
    section: "A1",
    label: "",
    marks: 5,
    expected: 3,
    mark: 3,
    band: "Middle",
    check: { status: "second_pass", marks: [1, 3, 3] },
    firstScore: { delta: -2, exact: false, within1: false, band: false },
    delta: 0,
    flags: {},
    usd: 0.01,
    judgeUsd: 0.02,
    seconds: 2,
    verdict: {
      pros: [{ pro: "Specific advice", delivered: true, evidence: "Advice" }],
      cons: [],
      score: 9,
      lowConfidence: false,
      reasoning: "Specific",
    },
    feedback: "Clear feedback",
    error: null,
    score: { delta: 0, exact: true, within1: true, band: true },
  };
  writeResults(
    {
      stamp: "2026-10-09-2000",
      git: "abc123",
      dirty: true,
      label: "Canned",
      limit: null,
      marker: {
        model: "anthropic/claude-sonnet-5.5",
        effort: { grade: "low", check: "low", reconcile: "medium" },
      },
      judge: { model: "gpt-6-astra", effort: "low" },
      spentBefore: 1,
      spentAfter: 1.12,
      blocked: false,
    },
    [
      row,
      {
        ...row,
        id: "fm-1",
        flags: { excluded: "Fixture bug" },
        mark: 0,
        delta: -3,
        score: { delta: -3, exact: false, within1: false, band: false },
      },
      {
        ...row,
        id: "ei-1",
        check: { status: "in_review", marks: [3, 1, 0] },
        error: "Judge failed",
        verdict: null,
      },
      {
        ...row,
        id: "ge-5",
        check: { status: "agreed", marks: [3, 4] },
        error: "Judge failed",
        judgeUsd: 0,
        usd: 0,
        verdict: null,
      },
      {
        ...row,
        id: "a1-m2-21a",
        section: "Held-out",
        expected: 2,
        mark: 1,
        usd: 0,
        judgeUsd: 0,
        verdict: null,
        check: { status: "agreed", marks: [1, 1] },
        score: { delta: -1, exact: false, within1: true, band: false },
      },
      {
        ...row,
        id: "claro",
        section: "Claro",
        label: "Short | answer",
        expected: [2, 3],
        judgeUsd: 0,
        flags: { inRange: true },
        check: { status: "agreed", marks: [3, 2] },
        verdict: null,
      },
    ],
  );
  const calls = vi.mocked(writeFileSync).mock.calls;
  const result = JSON.parse(String(calls[0][1]));
  expect(result.headline).toMatchObject({
    blindAgreement: 1 / 3,
    secondPass: 1,
    inReview: 1,
    firstPass: { n: 1, exact: 0, within1: 0, band: 0 },
    n: 1,
    exact: 1,
    within1: 1,
    band: 1,
    meanSigned: 0,
    meanAbs: 0,
    judgeMean: 9,
    usdPerAnswer: 0.01,
  });
  expect(result.heldOut).toMatchObject({
    n: 1,
    exact: 0,
    within1: 1,
    band: 0,
    meanSigned: -1,
    judgeMean: null,
    judgeUsd: 0,
    blindAgreement: 1,
  });
  expect(result.items).toHaveLength(6);
  const markdown = String(calls[1][1]);
  expect(markdown).toContain("Blind-check agreement");
  expect(markdown).toContain("## Held-out A1 mock answers");
  expect(markdown).toContain("| 1 | 0.0% | 100.0% | 0.0% | -1.00 |");
  expect(markdown).toContain("First pass only | 0.0% | 0.0% | 0.0%");
  expect(markdown).toContain("2nd pass 1·3·3");
  expect(markdown).toContain("review 3·1·0");
  expect(markdown).toContain("agreed 3·2");
  expect(markdown).toContain("grade=low, check=low, reconcile=medium");
  expect(markdown).toContain("Fixture bug");
  expect(markdown).toContain("Judge failed");
  expect(markdown).toContain("1/1 in range");
  expect(markdown).toContain("Short \\| answer");
  expect(markdown).toContain("marking $0.0400, judge $0.0600");
  vi.restoreAllMocks();
});

it.each([
  ["gpt-6.1-sol", true],
  ["anthropic/claude-sonnet-5.5", false],
])("labels the %s marker as priority: %s", (model, priority) => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(writeFileSync).mockClear();
  writeResults(
    {
      stamp: "2026-10-09-2000",
      git: "abc123",
      dirty: false,
      label: "",
      limit: null,
      marker: {
        model,
        effort: { grade: "low", check: "low", reconcile: "medium" },
      } as Parameters<typeof writeResults>[0]["marker"],
      judge: { model: "gpt-6-astra", effort: "low" },
      spentBefore: 0,
      spentAfter: 0,
      blocked: false,
    },
    [],
  );
  const header = String(vi.mocked(writeFileSync).mock.calls[1][1]).split(
    "\n",
  )[2];
  expect(header).toContain(`Marker: ${model}/grade=low`);
  expect(header).toContain(
    `reconcile=medium${priority ? " (priority)" : ""}. Judge:`,
  );
  expect(header.includes("(priority)")).toBe(priority);
  vi.restoreAllMocks();
});
