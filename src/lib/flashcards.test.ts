import { describe, expect, it } from "vitest";
import {
  firstReviews,
  matchFlashcardAnswer,
  nextQueue,
  normaliseAnswer,
  resumeQueue,
  schedule,
  shuffle,
  sydneyToday,
  type FlashcardReview,
} from "./flashcards";
describe("flashcard schedules", () => {
  it.each([
    [null, 0, 1],
    [null, 0.5, 1],
    [null, 1, 3],
    [{ interval_days: 8 }, 0, 1],
    [{ interval_days: 8 }, 0.5, 10],
    [{ interval_days: 3 }, 1, 8],
    [{ interval_days: 30 }, 1, 60],
    [{ interval_days: 0 }, 1, 0],
    [{ interval_days: 60 }, 0.5, 60],
    [{ interval_days: 0 }, 0.5, 1],
  ] as const)("schedules %#", (prev, mark, days) => {
    const result = schedule(prev, mark, "2026-10-08");
    expect(result.interval_days).toBe(days);
    expect(result.due_on).toBe(
      new Date(Date.UTC(2026, 9, 8 + days)).toISOString().slice(0, 10),
    );
  });
  it("crosses year and leap-day boundaries using calendar days", () => {
    expect(schedule(null, 1, "2026-12-30").due_on).toBe("2027-01-02");
    expect(schedule(null, 0, "2028-02-28").due_on).toBe("2028-02-29");
  });
});
it("shuffles a copy into a permutation with injected randomness", () => {
  const items = [1, 2, 3, 4];
  expect(shuffle(items, () => 0)).toEqual([2, 3, 4, 1]);
  expect(items).toEqual([1, 2, 3, 4]);
  expect(shuffle(items).sort()).toEqual(items);
  expect(shuffle([])).toEqual([]);
});
it("produces each of the six three-item permutations exactly once for equiprobable choices", () => {
  const outcomes = new Set<string>();
  for (const first of [1 / 6, 0.5, 5 / 6])
    for (const second of [0.25, 0.75]) {
      const choices = [first, second];
      outcomes.add(shuffle(["a", "b", "c"], () => choices.shift()!).join(""));
    }
  expect(outcomes.size).toBe(6);
});
it.each([0, 0.5, 1] as const)("recycles only ratings below one: %s", (mark) => {
  const queue = ["a", "b", "c"];
  expect(nextQueue(queue, "a", mark)).toEqual(
    mark < 1 ? ["b", "c", "a"] : ["b", "c"],
  );
  expect(queue).toEqual(["a", "b", "c"]);
  expect(nextQueue(["a"], "a", mark)).toEqual(mark < 1 ? ["a"] : []);
});
it.each([
  ["2026-01-01T13:00:00Z", "2026-01-02"],
  ["2026-07-01T13:30:00Z", "2026-07-01"],
  ["2026-07-01T14:00:00Z", "2026-07-02"],
  ["2026-10-03T15:59:59Z", "2026-10-04"],
  ["2026-10-04T13:00:00Z", "2026-10-05"],
])("uses Sydney's calendar date at %s", (timestamp, day) =>
  expect(sydneyToday(new Date(timestamp))).toBe(day),
);
it("uses first reviews for scoring and latest reviews for ordered resume", () => {
  const reviews = [
    { flashcard_id: "a", mark: 0 },
    { flashcard_id: "b", mark: 1 },
    { flashcard_id: "a", mark: 1 },
    { flashcard_id: "c", mark: 0.5 },
  ] as FlashcardReview[];
  expect([...firstReviews(reviews).values()].map((r) => r.mark)).toEqual([
    0, 1, 0.5,
  ]);
  expect(resumeQueue(["a", "b", "c", "d"], reviews)).toEqual(["c", "d"]);
});
describe("flashcard answer matching", () => {
  it("normalises answers for matching", () => {
    expect(normaliseAnswer("  Real GDP!! ")).toBe("real gdp");
  });
  it("marks exact and near flashcard answers without AI", () => {
    expect(matchFlashcardAnswer("Real GDP", "Real GDP")?.mark).toBe(1);
    expect(
      matchFlashcardAnswer(
        "The market value of all final goods and services produced in an economy in a year, adjusted for inflation",
        "The market value of all final goods and services produced in an economy over a period of time, adjusted for inflation (real).",
      )?.mark,
    ).toBeGreaterThanOrEqual(0.5);
    expect(matchFlashcardAnswer("banana", "Real GDP")).toBeNull();
  });
});
