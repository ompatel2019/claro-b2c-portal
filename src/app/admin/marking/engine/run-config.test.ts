import { expect, it } from "vitest";
import { estimateRun, budgetReason } from "./run-config";
import { mergeRuns, type OfflineEvalRun } from "./summary";
const run: OfflineEvalRun = {
  meta: {
    stamp: "2026-10-09-1200",
    label: "",
    marker: { model: "gpt-6.1-sol" },
  },
  items: [
    { section: "A1", marks: 5, mark: 1, expected: 1, usd: 0.01 },
    { section: "A1", marks: 5, mark: 2, expected: 2, usd: 0.03 },
    {
      section: "A1",
      marks: 5,
      mark: 1,
      expected: 1,
      usd: 100,
      error: "failed",
    },
    {
      section: "A1",
      marks: 5,
      mark: 1,
      expected: 1,
      usd: 100,
      flags: { excluded: "fixture" },
    },
  ],
};
const options = { model: "gpt-6.1-sol", effort: "low", blind: true } as const;
it("uses successful non-excluded per-model marking costs, without judge cost", () => {
  expect(estimateRun([run], options)).toMatchObject({
    average: 0.02,
    total: 0.36,
    basis: expect.stringContaining("2 samples"),
  });
  expect(estimateRun([run], { ...options, blind: false }).total).toBe(0.36);
});
it("scales unobserved models by PRICES and accounts for OpenRouter standard pricing", () => {
  expect(
    estimateRun([run], { ...options, model: "gpt-6-astra" }).total,
  ).toBeCloseTo(1.8);
  expect(
    estimateRun([run], { ...options, model: "anthropic/claude-sonnet-5.5" })
      .total,
  ).toBeCloseTo(0.18);
  expect(
    estimateRun([run], { ...options, model: "gpt-6-luna" }).total,
  ).toBeCloseTo(0.018);
  expect(estimateRun([], options).basis).toContain("fallback");
  expect(estimateRun([], options).total).toBeGreaterThan(0);
});
it("blocks threshold and overflow, allows exactly fitting estimate", () => {
  expect(budgetReason(80, 0)).toContain("limit");
  expect(budgetReason(79, 1.01)).toContain("exceeds");
  expect(budgetReason(79, 1)).toBeNull();
});
it("merges Sydney CLI stamps with UTC web dates newest first and uses elapsed duration", () => {
  const web = {
    ...run,
    meta: {
      ...run.meta,
      stamp: "2026-10-09T02:00:00Z",
      startedAt: "2026-10-09T02:00:00Z",
      finishedAt: "2026-10-09T02:01:00Z",
      by: "Admin",
      status: "cancelled",
      options: { blind: true },
    },
  };
  const sameMinute = {
    ...web,
    meta: { ...web.meta, startedAt: "2026-10-09T01:00:30Z" },
  };
  expect(mergeRuns([run], [sameMinute]).map((r) => r.by)).toEqual([
    "Admin",
    "CLI",
  ]);
  const rows = mergeRuns([run], [web]);
  expect(rows.map((r) => r.by)).toEqual(["Admin", "CLI"]);
  expect(rows[0]).toMatchObject({
    seconds: 60,
    status: "cancelled",
    passes: "With blind check",
  });
});
