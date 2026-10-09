import { describe, expect, it } from "vitest";
import {
  diffWords,
  publishProblems,
  questionSchema,
  suggestId,
  validateCriteria,
  type QuestionInput,
} from "./question-bank";

const written: QuestionInput = {
  id: "2024-q21b",
  type: "short",
  topic_id: "t3-inflation",
  marks: 4,
  verb: "Explain",
  source: "2024 HSC Q21(b)",
  year: 2024,
  stem: "Explain one cause of inflation.",
  stimulus: null,
  options: null,
  correct_index: null,
  explanation: null,
  criteria: [
    { min: 3, max: 4, descriptor: "Explains a cause with a link to prices" },
    { min: 1, max: 2, descriptor: "Identifies a cause" },
  ],
  guideline_notes: null,
  sample_answer: "Demand-pull inflation happens when…",
  status: "draft",
};

describe("question editor rules", () => {
  it("suggests an id from the source label", () => {
    expect(suggestId("2024 HSC Q21(b)")).toBe("2024-q21b");
    expect(suggestId("2019 Trial Q3")).toBe("2019-q3");
    expect(suggestId("Claro set A")).toBe("claro-set-a");
    expect(suggestId("Q")).toBe("");
  });

  it("validates bands highest first, within 1…marks, no overlap", () => {
    expect(validateCriteria(written.criteria!, 4)).toEqual({
      rows: ["", ""],
      summary: "",
    });
    expect(validateCriteria([], 4).summary).toBe("Add at least one band.");
    expect(
      validateCriteria([{ min: 1, max: 3, descriptor: "x" }], 4).summary,
    ).toBe("The top band must end at 4 marks.");
    expect(
      validateCriteria(
        [
          { min: 2, max: 4, descriptor: "a" },
          { min: 1, max: 2, descriptor: "b" },
        ],
        4,
      ).summary,
    ).toBe("Bands must run highest first without overlapping.");
    expect(
      validateCriteria([{ min: 0, max: 4, descriptor: "" }], 4).rows,
    ).toEqual(["Add a descriptor."]);
    expect(
      validateCriteria([{ min: 1, max: 5, descriptor: "a" }], 4).rows,
    ).toEqual(["Marks must be 1 to 4."]);
    expect(
      validateCriteria([{ min: 4, max: 3, descriptor: "a" }], 4).rows,
    ).toEqual(["Min must not exceed max."]);
  });

  it("lists what blocks publishing", () => {
    expect(publishProblems(written)).toEqual([]);
    expect(publishProblems({ ...written, sample_answer: null })).toEqual([
      "Add a sample answer.",
    ]);
    expect(publishProblems({ ...written, marks: 12 })).toContain(
      "Short answer questions carry 1–10 marks.",
    );
    const mc: QuestionInput = {
      ...written,
      type: "mcq",
      marks: 1,
      options: ["A", "B", "", "D"],
      correct_index: null,
      criteria: null,
      sample_answer: null,
    };
    expect(publishProblems(mc)).toEqual([
      "All four options are required.",
      "Pick the correct answer.",
      "Add an explanation.",
    ]);
  });

  it("parses the shared schema", () => {
    expect(questionSchema.safeParse(written).success).toBe(true);
    const bad = questionSchema.safeParse({ ...written, id: "No Spaces" });
    expect(bad.success).toBe(false);
    expect(
      questionSchema.safeParse({ ...written, verb: "Wonder" }).success,
    ).toBe(false);
  });
});

it("rejects invalid type/marks combinations even when saving a draft", () => {
  expect(
    questionSchema.safeParse({ ...written, type: "short", marks: 11 }).success,
  ).toBe(false);
  expect(
    questionSchema.safeParse({ ...written, type: "extended", marks: 9 })
      .success,
  ).toBe(false);
  expect(
    questionSchema.safeParse({ ...written, type: "mcq", marks: 2 }).success,
  ).toBe(false);
});

it("puts ordering and overlap problems on the affected criteria row", () => {
  expect(
    validateCriteria([{ min: 1, max: 3, descriptor: "x" }], 4).rows[0],
  ).toContain("top band");
  expect(
    validateCriteria(
      [
        { min: 2, max: 4, descriptor: "x" },
        { min: 1, max: 2, descriptor: "y" },
      ],
      4,
    ).rows[1],
  ).toContain("overlapping");
  expect(
    validateCriteria([{ min: 1, max: 4, descriptor: " " }], 4).rows[0],
  ).toBe("Add a descriptor.");
});

it("highlights stem differences while preserving all original text", () => {
  const { left, right } = diffWords(
    "Explain one cause.",
    "Explain two causes.",
  );
  expect(left.map((p) => p.text).join("")).toBe("Explain one cause.");
  expect(right.map((p) => p.text).join("")).toBe("Explain two causes.");
  expect(left.find((p) => p.text === "one ")?.changed).toBe(true);
  expect(left[0].changed).toBe(false);
  expect(diffWords("", "x")).toEqual({
    left: [],
    right: [{ text: "x", changed: true }],
  });
});

it("requires four options and a single key for an MC draft, matching the database constraints", () => {
  const mc = {
    ...written,
    type: "mcq",
    marks: 1,
    options: ["A", "B", "C", "D"],
    correct_index: 0,
    explanation: null,
  };
  expect(questionSchema.safeParse(mc).success).toBe(true);
  expect(questionSchema.safeParse({ ...mc, correct_index: null }).success).toBe(
    false,
  );
  expect(
    questionSchema.safeParse({ ...mc, options: ["A", "B", "", "D"] }).success,
  ).toBe(false);
});
