import { describe, expect, it } from "vitest";
import {
  stageOneComplete,
  stageOneQueue,
  homeworkStatus,
  estimateMinutes,
  sydneyDateTime,
  type HomeworkSet,
  type HomeworkItem,
} from "./homework";
const review = (flashcard_id: string, mark: 0 | 0.5 | 1, day = 1) => ({
  flashcard_id,
  mark,
  created_at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`,
});
const items: HomeworkItem[] = [
  { position: 1, flashcard_id: "a", question_id: null },
  { position: 2, flashcard_id: "b", question_id: null },
  {
    position: 3,
    flashcard_id: null,
    question_id: "q",
    question: {
      id: "q",
      type: "mcq",
      marks: 1,
      topic_id: "t3-growth",
      stem: "Question",
      stimulus: null,
      options: [],
      source: "NESA",
      year: 2025,
    },
  },
];
const set: HomeworkSet = {
  id: "set",
  title: "Growth",
  topic_id: "t3-growth",
  due_at: "2026-10-15T06:00:00Z",
  published_at: "2026-10-01T00:00:00Z",
  items,
};
describe("homework flashcard gating", () => {
  it("requires the latest review of every card to be right, regardless of input order", () => {
    expect(
      stageOneComplete(["a", "b"], [review("a", 1), review("b", 0.5)]),
    ).toBe(false);
    expect(
      stageOneComplete(
        ["a", "b"],
        [review("b", 1, 2), review("a", 1), review("b", 0.5)],
      ),
    ).toBe(true);
    expect(stageOneComplete(["a"], [review("a", 0, 2), review("a", 1)])).toBe(
      false,
    );
  });
  it("treats empty stages as complete and ignores unrelated cards", () => {
    expect(stageOneComplete([], [])).toBe(true);
    expect(stageOneComplete(["a"], [review("other", 1)])).toBe(false);
  });
  it("resumes never-seen cards before missed cards, keeping item order", () => {
    expect(
      stageOneQueue(
        ["a", "b", "c", "d"],
        [review("a", 0), review("b", 1), review("d", 0.5)],
      ),
    ).toEqual(["c", "a", "d"]);
  });
  it("removes corrected misses but restores a card missed on a later review", () => {
    expect(
      stageOneQueue(
        ["a", "b"],
        [
          review("a", 0),
          review("a", 1, 2),
          review("b", 1),
          review("b", 0.5, 2),
        ],
      ),
    ).toEqual(["b"]);
  });
});
it("reports not started, progress, overdue and submitted with stage text", () => {
  const base = { set, attempts: [], reviews: [], now: new Date("2026-10-09") };
  expect(homeworkStatus(base)).toEqual({
    status: "not_started",
    stageText: "Flashcards 0 of 2 right",
  });
  expect(
    homeworkStatus({
      ...base,
      session: { finished_at: null },
      reviews: [review("a", 1)],
    }),
  ).toEqual({ status: "in_progress", stageText: "Flashcards 1 of 2 right" });
  expect(
    homeworkStatus({
      ...base,
      session: { finished_at: null },
      reviews: [review("a", 1), review("b", 1)],
      attempts: [{ choice_index: 0, answer_text: null, transcript: null }],
    }),
  ).toEqual({ status: "in_progress", stageText: "1 of 1 questions answered" });
  expect(homeworkStatus({ ...base, now: new Date("2026-10-20") }).status).toBe(
    "overdue",
  );
  expect(
    homeworkStatus({
      ...base,
      session: { finished_at: "2026-10-12" },
      now: new Date("2026-10-20"),
    }).status,
  ).toBe("submitted");
});
it("estimates cards, MC and written marks, rounding up to five minutes", () => {
  expect(estimateMinutes([])).toBe(0);
  expect(estimateMinutes(items)).toBe(5);
  const written = {
    ...items[2],
    question: { ...items[2].question!, type: "short" as const, marks: 3 },
  };
  expect(estimateMinutes([...items, written])).toBe(10);
  expect(
    estimateMinutes([
      {
        ...written,
        question: { ...written.question, type: "extended", marks: 10 },
      },
    ]),
  ).toBe(20);
});
it("converts Sydney due times with seasonal offsets and rejects the DST gap", () => {
  expect(sydneyDateTime("2026-10-12T17:00")).toBe("2026-10-12T06:00:00.000Z");
  expect(sydneyDateTime("2026-07-12T17:00")).toBe("2026-07-12T07:00:00.000Z");
  expect(() => sydneyDateTime("2026-10-04T02:30")).toThrow();
});
