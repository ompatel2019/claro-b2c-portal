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
  // Seeded Topic 3 cards (front = prompt, back = model answer)
  const gdp = {
    front: "Gross domestic product (GDP)",
    back: "The market value of final goods and services produced within a country during a given period.",
  };
  const perCapita = {
    front: "GDP per capita",
    back: "GDP divided by the population, indicating the average value of output per person.",
  };
  const realGdp = {
    front: "Real GDP",
    back: "The value of goods and services produced in an economy, adjusted to remove the effects of price changes.",
  };

  it("normalises case, punctuation, articles and parentheses", () => {
    expect(normaliseAnswer("  The GDP (real)! ")).toContain("gdp");
    expect(normaliseAnswer("The market value")).toBe(
      normaliseAnswer("market value"),
    );
  });

  it.each([
    [gdp.back, gdp.front],
    [gdp.back.replace(/\.$/, ""), gdp.front],
    [
      "market value of final goods and services produced within a country during a given period",
      gdp.front,
    ],
    [
      "The market value of final goods and services produced within a country during a given period",
      gdp.front,
    ],
    [perCapita.back, perCapita.front],
    [
      "GDP divided by the population indicating the average value of output per person",
      perCapita.front,
    ],
    ["gdp divided by population average output per person", perCapita.front],
    [realGdp.back, realGdp.front],
    [
      "value of goods and services produced in an economy adjusted to remove effects of price changes",
      realGdp.front,
    ],
  ] as const)("accepts correct definition %#", (answer, front) => {
    const back =
      front === gdp.front
        ? gdp.back
        : front === perCapita.front
          ? perCapita.back
          : realGdp.back;
    expect(matchFlashcardAnswer(answer, back, front)?.mark).toBe(1);
  });

  it("accepts acronym-only and expanded forms for short model answers", () => {
    const term = "Gross domestic product (GDP)";
    expect(matchFlashcardAnswer("GDP", term)?.mark).toBe(1);
    expect(matchFlashcardAnswer("gdp", term)?.mark).toBe(1);
    expect(matchFlashcardAnswer("gross domestic product", term)?.mark).toBe(1);
    expect(
      matchFlashcardAnswer("Gross Domestic Product (GDP)", term)?.mark,
    ).toBe(1);
    expect(matchFlashcardAnswer("domestic product gross", term)?.mark).toBe(1);
    const short = "GDP per capita";
    expect(matchFlashcardAnswer("GDP per capita", short)?.mark).toBe(1);
    expect(matchFlashcardAnswer("gdp per capita", short)?.mark).toBe(1);
    expect(matchFlashcardAnswer("per capita GDP", short)?.mark).toBe(1);
    expect(matchFlashcardAnswer("GDP per-capita", short)?.mark).toBe(1);
  });

  it("does not auto-pass wrong or thin answers", () => {
    expect(matchFlashcardAnswer("banana", gdp.back, gdp.front)).toBeNull();
    expect(matchFlashcardAnswer("GDP", gdp.back, gdp.front)).toBeNull();
    expect(
      matchFlashcardAnswer(
        "something about inflation",
        perCapita.back,
        perCapita.front,
      ),
    ).toBeNull();
    // acronym-only / term-only should defer when the model answer is the definition
    expect(
      matchFlashcardAnswer("Gross domestic product", gdp.back, gdp.front),
    ).toBeNull();
    expect(
      matchFlashcardAnswer("GDP per capita", perCapita.back, perCapita.front),
    ).toBeNull();
    // thin substring of a short term must not pass
    expect(matchFlashcardAnswer("GDP", "GDP per capita")).toBeNull();
    expect(matchFlashcardAnswer("per capita", "GDP per capita")).toBeNull();
    expect(
      matchFlashcardAnswer("market value of goods", gdp.back, gdp.front),
    ).toBeNull();
  });

  it("does not return Nearly there from the deterministic path", () => {
    const partial = "market value of goods";
    const result = matchFlashcardAnswer(partial, gdp.back, gdp.front);
    expect(result === null || result.mark === 1).toBe(true);
    expect(result?.mark).not.toBe(0.5);
  });
});

it("honours disabled repeats and caps each card at three repeats", () => {
  expect(nextQueue(["a", "b"], "a", 0, false, 0)).toEqual(["b"]);
  expect(nextQueue(["a", "b"], "a", 0.5, true, 2)).toEqual(["b", "a"]);
  expect(nextQueue(["a", "b"], "a", 0, true, 3)).toEqual(["b"]);
});
it("resumes with repeat settings and the per-card cap", () => {
  const reviews = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    flashcard_id: "a",
    mark: 0 as const,
    answer: null,
    reason: null,
    source: "self" as const,
    created_at: "2026-10-09",
  }));
  expect(resumeQueue(["a", "b"], reviews)).toEqual(["b"]);
  expect(resumeQueue(["a", "b"], reviews.slice(0, 3))).toEqual(["a", "b"]);
  expect(resumeQueue(["a", "b"], reviews.slice(0, 1), false)).toEqual(["b"]);
});
