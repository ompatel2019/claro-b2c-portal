// @vitest-environment node
import { zodResponseFormat } from "openai/helpers/zod";
import { expect, it } from "vitest";
import {
  CheckSchema,
  FlashcardSchema,
  GradeSchema,
  SummarySchema,
  TranscriptSchema,
} from "./schemas";

it.each([
  GradeSchema,
  CheckSchema,
  TranscriptSchema,
  FlashcardSchema,
  SummarySchema,
])("builds strict structured output for schema %#", (schema) => {
  const format = zodResponseFormat(schema, "result");
  expect(format.json_schema.strict).toBe(true);
  const json = format.json_schema.schema!;
  expect(json.additionalProperties).toBe(false);
  expect(json.required).toEqual(Object.keys(json.properties as object));
});

it("parses a full grade and rejects missing fields, fractional marks and invalid comments", () => {
  const grade = {
    analysis: { strengths: ["Links causes"], imprecise: [], missing: [] },
    elements_identified: "Two effects",
    bands_considered: [
      { band: "Explains effects", satisfied: true, evidence: "Links causes" },
    ],
    band_selected: "Explains effects",
    justification: 'Student says "prices rise"',
    why_not_higher: "",
    mark: 4,
    comments: [
      {
        quote: "prices rise",
        kind: "strength",
        body: "Clear effect",
        tag: "Analysis" as const,
        next_mark: null,
      },
      {
        quote: "demand",
        kind: "fix",
        body: "Specify mechanism",
        tag: "Analysis" as const,
        next_mark: null,
      },
    ],
    earned: ["Effect"],
    missing_points: [],
    next_band: "",
    better_answer_outline: ["Cause", "Mechanism", "Effect"],
  };
  for (const invalid of [
    { quote: "prices rise", line: 1, type: "strength", comment: "Clear" },
    { ...grade.comments[0], tag: "Unknown" },
    { ...grade.comments[0], kind: "improvement" },
    { ...grade.comments[0], start: 0 },
  ]) {
    expect(
      GradeSchema.safeParse({
        ...grade,
        comments: [invalid, grade.comments[1]],
      }).success,
    ).toBe(false);
  }
  expect(GradeSchema.parse(grade)).toEqual(grade);
  expect(GradeSchema.safeParse({ ...grade, mark: 1.5 }).success).toBe(false);
  expect(GradeSchema.safeParse({ ...grade, comments: [] }).success).toBe(false);
  expect(GradeSchema.safeParse({ ...grade, analysis: undefined }).success).toBe(
    false,
  );
});

it("validates transcription, flashcard marks and summary fields", () => {
  expect(TranscriptSchema.parse({ lines: [], notes: "" })).toEqual({
    lines: [],
    notes: "",
  });
  for (const mark of [0, 0.5, 1])
    expect(FlashcardSchema.parse({ reason: "Reason", mark }).mark).toBe(mark);
  expect(
    FlashcardSchema.safeParse({ reason: "Reason", mark: 0.75 }).success,
  ).toBe(false);
  expect(
    SummarySchema.parse({ strengths: [], improvements: [], next_steps: [] }),
  ).toEqual({ strengths: [], improvements: [], next_steps: [] });
  expect(SummarySchema.safeParse({ strengths: [] }).success).toBe(false);
});

it("checks require only assessment fields and reject feedback fields", () => {
  const check = {
    analysis: { strengths: [], imprecise: [], missing: [] },
    bands_considered: [],
    band_selected: "NO BAND SATISFIED",
    justification: "Empty",
    mark: 0,
  };
  expect(CheckSchema.parse(check)).toEqual(check);
  expect(CheckSchema.safeParse({ ...check, comments: [] }).success).toBe(false);
  expect(
    CheckSchema.safeParse({ ...check, justification: undefined }).success,
  ).toBe(false);
});
