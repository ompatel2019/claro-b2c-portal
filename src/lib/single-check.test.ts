import { expect, it } from "vitest";
import {
  answerValid,
  checksLeft,
  detectVerb,
  ownQuestionSchema,
  singleConfig,
  singleSlotIds,
  sydneyDayStart,
} from "./single-check";
const question = {
  stem: "Explain the causes of inflation.",
  marks: 4,
  verb: "explain",
  topic_id: "t3-inflation",
  criteria_text: null,
};
it("detects the first glossary phrase with whole-word boundaries and Australian spelling", () => {
  expect(
    detectVerb("Critically evaluate policy, then explain its impact."),
  ).toBe("critically evaluate");
  expect(detectVerb("Using data, ANALYSE the trend.")).toBe("analyse");
  expect(detectVerb("An explanation of the trend")).toBe("");
  expect(detectVerb("Outline inflation and assess policy")).toBe("outline");
  expect(detectVerb("Critically\n evaluate policy.")).toBe(
    "critically evaluate",
  );
});
it("validates own-question bounds, integer marks and verbs", () => {
  expect(ownQuestionSchema.safeParse(question).success).toBe(true);
  for (const patch of [
    { stem: "short" },
    { stem: "x".repeat(3001) },
    { marks: 0 },
    { marks: 21 },
    { marks: 1.5 },
    { verb: "invented" },
    { criteria_text: "x".repeat(3001) },
  ])
    expect(ownQuestionSchema.safeParse({ ...question, ...patch }).success).toBe(
      false,
    );
  expect(
    ownQuestionSchema.safeParse({
      ...question,
      marks: 20,
      verb: "",
      topic_id: null,
    }).success,
  ).toBe(true);
});
it("uses exactly the single-session config.question payload, stripping extra keys", () => {
  expect(
    singleConfig({ ...question, extra: "secret" } as typeof question),
  ).toEqual({ question });
  expect(Object.keys(singleConfig(question).question)).toEqual([
    "stem",
    "marks",
    "verb",
    "topic_id",
    "criteria_text",
  ]);
});
it("counts reserved single sessions once rather than AI calls or retries", () => {
  expect(checksLeft(0)).toBe(20);
  expect(checksLeft(3)).toBe(17);
  expect(checksLeft(20)).toBe(0);
  expect(checksLeft(21)).toBe(0);
});
it("finds Sydney midnight across UTC boundaries and daylight saving changes", () => {
  expect(sydneyDayStart(new Date("2026-10-09T00:00:00Z"))).toBe(
    "2026-10-08T13:00:00.000Z",
  );
  expect(sydneyDayStart(new Date("2026-10-04T06:00:00Z"))).toBe(
    "2026-10-03T14:00:00.000Z",
  );
  expect(sydneyDayStart(new Date("2026-04-05T06:00:00Z"))).toBe(
    "2026-04-04T13:00:00.000Z",
  );
});
it("requires a confirmed, nonempty photo transcript and caps written words", () => {
  const a = { answer_text: "Some answer", transcript: null, image_paths: null };
  expect(answerValid(a, false)).toBe(true);
  expect(answerValid({ ...a, answer_text: "" }, true)).toBe(false);
  expect(
    answerValid(
      { ...a, image_paths: ["photo"], transcript: "Some answer" },
      false,
    ),
  ).toBe(false);
  expect(
    answerValid(
      { ...a, image_paths: ["photo"], transcript: "Some answer" },
      true,
    ),
  ).toBe(true);
  expect(answerValid({ ...a, answer_text: "word ".repeat(3001) }, true)).toBe(
    false,
  );
});

it("reserves exactly twenty stable, unique slots scoped to a student and Sydney day", async () => {
  const now = new Date("2026-10-09T00:00:00Z");
  const ids = await singleSlotIds("alice", now);
  expect(new Set(ids).size).toBe(20);
  expect(
    ids.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(
        id,
      ),
    ),
  ).toBe(true);
  expect(
    await singleSlotIds("alice", new Date("2026-10-09T12:59:59Z")),
  ).toEqual(ids);
  expect(
    await singleSlotIds("alice", new Date("2026-10-09T13:00:00Z")),
  ).not.toEqual(ids);
  expect(await singleSlotIds("bob", now)).not.toEqual(ids);
});

it("filters parent topics by their relation and searches year/source regardless of word order", async () => {
  const { filterBankQuestions } = await import("./single-check");
  const questions = [
    {
      id: "q",
      type: "short" as const,
      marks: 4,
      stem: "Explain inflation.",
      source: "HSC Q22",
      year: 2023,
      topic_id: "unrelated-id",
      stimulus: null,
      options: null,
      verb: "explain",
    },
  ];
  const topics = [{ id: "unrelated-id", parent_id: "economy" }];
  const filters = {
    type: "short",
    topic: "economy",
    year: "2023",
    search: "  2023 HSC Q22  ",
  };
  expect(filterBankQuestions(questions, topics, filters)).toEqual(questions);
  expect(
    filterBankQuestions(questions, topics, { ...filters, topic: "other" }),
  ).toEqual([]);
  expect(
    filterBankQuestions(questions, topics, { ...filters, type: "extended" }),
  ).toEqual([]);
  expect(
    filterBankQuestions(questions, topics, { ...filters, search: "missing" }),
  ).toEqual([]);
});
