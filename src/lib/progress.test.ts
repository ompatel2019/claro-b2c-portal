import { describe, expect, it } from "vitest";
import {
  masterySegments,
  parseRange,
  rangeFrom,
  reportHref,
  practiseHref,
  verbRows,
  weakSpots,
  type TopicProgress,
} from "./progress";
import { fromParams, restore } from "./sprint";
import { scoreTone } from "./practice";

describe("progress ranges use inclusive Sydney calendar days", () => {
  it.each([
    [undefined, "90"],
    ["bad", "90"],
    [["30", "90"], "90"],
    ["30", "30"],
    ["90", "90"],
    ["year", "year"],
    ["all", "all"],
  ] as const)("parses %s", (value, expected) =>
    expect(parseRange(value as string | string[] | undefined)).toBe(expected),
  );
  it("handles year boundaries and leap days", () => {
    expect(rangeFrom("30", "2026-01-01")).toBe("2025-12-03");
    expect(rangeFrom("90", "2026-10-09")).toBe("2026-07-12");
    expect(rangeFrom("year", "2026-10-09")).toBe("2026-01-01");
    expect(rangeFrom("30", "2024-03-01")).toBe("2024-02-01");
    expect(rangeFrom("all", "2026-10-09")).toBeNull();
  });
});
it("normalises CategoryBar counts, keeping zero-count categories safe", () => {
  const segments = masterySegments({
    id: "term",
    known: 10,
    learning: 5,
    missed: 3,
    new: 2,
  });
  expect(segments.map((s) => s.width)).toEqual([50, 25, 15, 10]);
  expect(segments.reduce((n, s) => n + s.count, 0)).toBe(20);
  expect(
    masterySegments({
      id: "stat",
      known: 0,
      learning: 0,
      missed: 0,
      new: 0,
    }).every((s) => s.width === 0),
  ).toBe(true);
});
const topic = (
  id: string,
  pct: number | null,
  answered = 3,
  parent_id: string | null = "t1",
): TopicProgress => ({
  id,
  parent_id,
  name: id,
  sort: 1,
  pct,
  answered,
  earned: 0,
  possible: 10,
  last_answered: null,
});
it("selects only eligible subtopics, alternates missed cards and caps at six", () => {
  const spots = weakSpots(
    [
      topic("parent", 10, 10, null),
      topic("few", 1, 2),
      topic("edge", 60),
      topic("empty", null),
      topic("weak", 59.9),
      topic("weakest", 10),
      topic("next", 20),
      topic("extra", 30),
    ],
    [
      { id: "cards", name: "Cards", missed: 8 },
      { id: "more", name: "More", missed: 2 },
      { id: "none", name: "None", missed: 0 },
    ],
  );
  expect(spots.map((s) => s.id)).toEqual([
    "q-weakest",
    "c-cards",
    "q-next",
    "c-more",
    "q-extra",
    "q-weak",
  ]);
  expect(spots[0].href).toBe(
    "/student/sprint?topics=t1&sub=weakest&history=mistakes",
  );
  expect(spots[1].href).toBe("/student/flashcards?topic=cards");
  expect(weakSpots([], [])).toEqual([]);
});
it("requires three answered questions per verb and orders the weakest first", () => {
  expect(
    verbRows([
      { id: "Explain", answered: 2, pct: 0 },
      { id: "Analyse", answered: 3, pct: 30 },
      { id: "Discuss", answered: 5, pct: 70 },
      { id: "Empty", answered: 4, pct: null },
    ]).map((v) => v.id),
  ).toEqual(["Analyse", "Discuss"]);
});
it.each([
  [0, "destructive"],
  [49.99, "destructive"],
  [50, "warning"],
  [74.99, "warning"],
  [75, "success"],
  [100, "success"],
] as const)("uses exact score threshold %s", (pct, tone) =>
  expect(scoreTone(pct)).toBe(tone),
);
it("builds existing report and setup routes including single-answer sessions", () => {
  expect(reportHref({ id: "a", kind: "single" })).toBe("/student/activity/a");
  expect(reportHref({ id: "a", kind: "sprint" })).toBe(
    "/student/sprint/a/results",
  );
  expect(reportHref({ id: "a", kind: "paper" })).toBeNull();
  expect(reportHref({ id: "a", kind: "flashcards" })).toBe(
    "/student/flashcards/a",
  );
  expect(practiseHref({ id: "t1", parent_id: null })).toBe(
    "/student/sprint?topics=t1",
  );
});

it("verb practise links override a saved MC setup using main's understood parameters", () => {
  const url = new URL(
    "/student/sprint?type=short&verb=Analyse",
    "https://claro.test",
  );
  const setup = fromParams(
    Object.fromEntries(url.searchParams),
    restore({ mode: "mcq" }),
  );
  expect(setup?.mode).toBe("short");
  expect(setup?.verbs).toEqual(["Analyse"]);
});
