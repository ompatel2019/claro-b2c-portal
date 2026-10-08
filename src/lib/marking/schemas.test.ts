// @vitest-environment node
import { zodResponseFormat } from "openai/helpers/zod";
import { expect, it } from "vitest";
import {
  FlashcardSchema,
  GradeSchema,
  SummarySchema,
  TranscriptSchema,
} from "./schemas";

it.each([GradeSchema, TranscriptSchema, FlashcardSchema, SummarySchema])(
  "builds strict structured output for schema %#",
  (schema) => {
    const format = zodResponseFormat(schema, "result");
    expect(format.json_schema.strict).toBe(true);
    const json = format.json_schema.schema!;
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(Object.keys(json.properties as object));
  },
);

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
        line: 1,
        type: "strength",
        comment: "Clear effect",
      },
      {
        quote: "demand",
        line: null,
        type: "improvement",
        comment: "Specify mechanism",
      },
    ],
    earned: ["Effect"],
    missing_points: [],
    next_band: "",
    better_answer_outline: ["Cause", "Mechanism", "Effect"],
  };
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
