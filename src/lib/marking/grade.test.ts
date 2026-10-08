// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  anchorComments,
  clampMark,
  findBand,
  numberLines,
  scoreMcq,
  validateGrade,
} from "./grade";

const criteria = [
  { min: 3, max: 4, descriptor: "Explains TWO effects of inflation." },
  { min: 1, max: 2, descriptor: "Identifies an effect." },
];

describe("scoreMcq", () => {
  it.each([
    [0, 0, 1],
    [2, 1, 0],
    [0, null, 0],
    [0, undefined, 0],
  ] as const)("scores %s against %s", (correct, choice, expected) =>
    expect(scoreMcq(correct, choice)).toBe(expected),
  );
});

describe("numberLines", () => {
  it("numbers internal blanks and removes trailing blank lines", () =>
    expect(numberLines("First\n\nThird\n\n")).toBe("1: First\n2: \n3: Third"));
  it("handles empty text and Windows newlines", () => {
    expect(numberLines("")).toBe("");
    expect(numberLines("A\r\nB\r\n")).toBe("1: A\n2: B");
  });
});

describe("findBand", () => {
  it("prefers an exact normalised descriptor over an earlier containing descriptor", () => {
    const overlapping = [
      { min: 3, max: 4, descriptor: "Explains an effect in detail." },
      { min: 1, max: 2, descriptor: "Explains an effect." },
    ];
    expect(findBand(overlapping, " • EXPLAINS   an effect!")).toBe(
      overlapping[1],
    );
  });
  it.each([
    "Explains TWO effects of inflation.",
    " • EXPLAINS   two effects of inflation!",
    "Band: Explains TWO effects of inflation.",
    "Explains TWO effects",
  ])("matches %s", (text) =>
    expect(findBand(criteria, text)).toBe(criteria[0]),
  );
  it.each(["Unknown descriptor", "NO BAND SATISFIED", "", "!!!"])(
    "does not match %s",
    (text) => expect(findBand(criteria, text)).toBeNull(),
  );
});

describe("validateGrade", () => {
  it("accepts a matching whole mark", () =>
    expect(
      validateGrade(criteria, 4, {
        band_selected: criteria[0].descriptor,
        mark: 3,
      }),
    ).toEqual({ ok: true }));
  it("accepts the zero sentinel", () =>
    expect(
      validateGrade(criteria, 4, {
        band_selected: "NO BAND SATISFIED",
        mark: 0,
      }),
    ).toEqual({ ok: true }));
  it.each([
    { band_selected: "Invented band", mark: 3 },
    { band_selected: criteria[0].descriptor, mark: 2 },
    { band_selected: criteria[0].descriptor, mark: 3.5 },
    { band_selected: criteria[0].descriptor, mark: 5 },
    { band_selected: criteria[1].descriptor, mark: -1 },
    { band_selected: "NO BAND SATISFIED", mark: 1 },
  ])("rejects invalid grade $band_selected / $mark", (grade) =>
    expect(validateGrade(criteria, 4, grade)).toEqual({
      ok: false,
      problem: expect.any(String),
    }),
  );
  it("enforces question max even inside a band", () =>
    expect(
      validateGrade(criteria, 3, {
        band_selected: criteria[0].descriptor,
        mark: 4,
      }).ok,
    ).toBe(false));
});

describe("clampMark", () => {
  it.each([
    [2.6, 4, 3],
    [-2, 4, 0],
    [9, 4, 4],
    [NaN, 4, 0],
  ])("clamps %s", (mark, max, expected) =>
    expect(clampMark(mark, max)).toBe(expected),
  );
});

describe("anchorComments", () => {
  it("keeps exact offsets, matches case and whitespace, and preserves unmatched quotes", () => {
    expect(
      anchorComments("First. Inflation   raises\nprices (2%).", [
        { quote: "Inflation" },
        { quote: "inflation raises prices (2%)." },
        { quote: "invented" },
        { quote: "" },
      ]),
    ).toEqual([
      { quote: "Inflation", start: 7 },
      { quote: "inflation raises prices (2%).", start: 7 },
      { quote: "invented", start: null },
      { quote: "", start: null },
    ]);
  });
});
