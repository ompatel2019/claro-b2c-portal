import { describe, it, expect } from "vitest";
import {
  plural,
  highlightSegments,
  timer,
  answered,
  percentage,
  type Comment,
} from "./practice";
const comment = (start: number | null, quote: string): Comment => ({
  start,
  quote,
  kind: "strength",
  body: "Clear",
  tag: "Analysis" as const,
  next_mark: null,
});
describe("highlightSegments", () => {
  it("preserves text and tracks overlapping quotes", () => {
    const segments = highlightSegments("abcdef", [
      comment(1, "bcd"),
      comment(3, "de"),
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("abcdef");
    expect(segments.find((s) => s.text === "d")?.comments).toEqual([0, 1]);
  });
  it("ignores null, negative, fractional, empty and out of range starts", () => {
    expect(
      highlightSegments("abc", [
        comment(null, "a"),
        comment(-1, "a"),
        comment(1.5, "a"),
        comment(3, "a"),
        comment(0, ""),
      ]),
    ).toEqual([{ text: "abc", start: 0, comments: [] }]);
  });
  it("clamps quotes at the end and handles empty answers", () => {
    expect(highlightSegments("abc", [comment(2, "cdef")]).at(-1)).toMatchObject(
      { text: "c", comments: [0] },
    );
    expect(highlightSegments("", [])).toEqual([]);
  });
});
it.each([
  [0, "0:00"],
  [65, "1:05"],
  [3599, "59:59"],
  [3600, "1:00:00"],
  [3730, "1:02:10"],
  [10800, "3:00:00"],
  [65.9, "1:05"],
  [-3, "0:00"],
])("formats timer %s", (seconds, expected) =>
  expect(timer(Number(seconds))).toBe(expected),
);
it("distinguishes no answer from option A and confirmed empty transcript", () => {
  expect(
    answered({ choice_index: 0, answer_text: null, transcript: null }),
  ).toBe(true);
  expect(
    answered({ choice_index: null, answer_text: "old text", transcript: "" }),
  ).toBe(false);
});
it("formats scores without inventing an average", () => {
  expect(percentage(1, 3)).toBe("33%");
  expect(percentage(null, 0)).toBe("No score yet");
});

import { orderedComments } from "./practice";

it("orders comment numbers by appearance in the answer", () => {
  const comments = [
    {
      quote: "later",
      start: 20,
      kind: "fix" as const,
      body: "b",
      tag: "Analysis" as const,
      next_mark: null,
    },
    {
      quote: "first",
      start: 0,
      kind: "strength" as const,
      body: "a",
      tag: "Analysis" as const,
      next_mark: null,
    },
    {
      quote: "middle",
      start: 10,
      kind: "fix" as const,
      body: "c",
      tag: "Analysis" as const,
      next_mark: null,
    },
  ];
  expect(orderedComments(comments).map((x) => x.index)).toEqual([1, 2, 0]);
});
it.each([
  [100, "success"],
  [75, "success"],
  [74.9, "warning"],
  [50, "warning"],
  [49, "destructive"],
  [0, "destructive"],
] as const)("score %s%% uses the %s tone", async (pct, tone) => {
  const { scoreTone } = await import("./practice");
  expect(scoreTone(pct)).toBe(tone);
});

describe("plural", () => {
  it("pluralises counts", () => {
    expect(plural(1, "term")).toBe("1 term");
    expect(plural(0, "statistics card")).toBe("0 statistics cards");
    expect(plural(2, "student")).toBe("2 students");
    expect(plural(3, "category", "categories")).toBe("3 categories");
  });
});
