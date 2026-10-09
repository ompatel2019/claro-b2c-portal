import { describe, expect, it } from "vitest";
import {
  durationLabel,
  runDateLabel,
  summariseRun,
  type OfflineEvalRun,
} from "./summary";

const run = (items: OfflineEvalRun["items"]): OfflineEvalRun => ({
  meta: {
    stamp: "2026-10-09-1440",
    label: "full",
    marker: {
      model: "test-model",
      effort: { grade: "low", check: "low", reconcile: "medium" },
    },
  },
  items,
});
const item = (
  mark: number | null,
  expected: number | number[],
  marks = 5,
  section = "A1",
) => ({ mark, expected, marks, section });

describe("offline run summaries", () => {
  it("scores valid expectations across sections using the shared band agreement rule", () => {
    const evaluation = run([
      {
        ...item(3, 3),
        usd: 0.1,
        judgeUsd: 0.2,
        seconds: 60,
        check: { status: "agreed" },
      },
      item(4, 3),
      { ...item(4, 3, 6, "Held-out"), score: { band: true } },
      item(5, 3, 6),
      {
        ...item(2, 2, 4, "Claro"),
        flags: { excluded: "legacy exclusion" },
        error: "legacy error",
        usd: 0.05,
        seconds: 5,
      },
      item(null, 2),
      item(2, [1, 3]),
      item(NaN, 2),
      item(2, Infinity),
    ]);
    const result = summariseRun(evaluation);
    expect(result).toMatchObject({
      n: 6,
      items: 9,
      exact: 3 / 6,
      agreement: 4 / 6,
      meanDelta: 4 / 6,
      totalDelta: 4,
      cost: expect.closeTo(0.35),
      seconds: 65,
      passes: "With blind check",
      thinking: "low/low/medium",
      by: "CLI",
      subset: false,
    });
    expect(result).not.toHaveProperty("heldOut");
    expect(result.items).toBeTypeOf("number");
  });
  it("does not trust cached heldOut metrics or emit item data", () => {
    const evaluation = {
      ...run([
        {
          ...item(1, 2),
          answer: "PRIVATE",
          feedback: "PRIVATE",
        } as OfflineEvalRun["items"][number],
      ]),
      heldOut: { exact: 1, within1: 1 },
    };
    const result = summariseRun(evaluation);
    expect(result.exact).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(result.passes).toBe("Single");
  });
  it("marks both explicit subsets and limit runs; equal effort is shown once", () => {
    const evaluation = run([item(1, 1)]);
    evaluation.meta.items = [1];
    evaluation.meta.marker.effort = {
      grade: "low",
      check: "low",
      reconcile: "low",
    };
    expect(summariseRun(evaluation)).toMatchObject({
      subset: true,
      thinking: "low",
    });
    delete evaluation.meta.items;
    evaluation.meta.limit = 10;
    expect(summariseRun(evaluation).subset).toBe(true);
  });
  it("has honest empty metrics and tolerates omitted cost and effort", () => {
    const evaluation = run([item(null, 1)]);
    delete evaluation.meta.marker.effort;
    expect(summariseRun(evaluation)).toMatchObject({
      n: 0,
      exact: null,
      agreement: null,
      meanDelta: null,
      totalDelta: null,
      cost: 0,
      seconds: 0,
      thinking: undefined,
    });
  });
  it("supports legacy string effort and partially recorded effort", () => {
    const evaluation = run([item(1, 1)]);
    evaluation.meta.marker.effort = "low";
    expect(summariseRun(evaluation).thinking).toBe("low");
    evaluation.meta.marker.effort = { grade: "low" };
    expect(summariseRun(evaluation).thinking).toBe(
      "low/Not recorded/Not recorded",
    );
    evaluation.meta.marker.effort = {};
    expect(summariseRun(evaluation).thinking).toBeUndefined();
  });
  it("formats Sydney wall-time stamps and summed durations", () => {
    expect(runDateLabel("2026-10-09-1440")).toBe("9 Oct 2026, 14:40");
    expect(runDateLabel("2026-04-05-0230")).toBe("5 Apr 2026, 02:30");
    expect(durationLabel(59.6)).toBe("1m 0s");
    expect(durationLabel(65)).toBe("1m 5s");
    expect(durationLabel(3665)).toBe("1h 1m 5s");
  });
});
