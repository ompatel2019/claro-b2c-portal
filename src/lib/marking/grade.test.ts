// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  anchorComments,
  clampMark,
  findBand,
  scoreMcq,
  topicSummary,
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

describe("validateGrade comments", () => {
  it.each([
    [
      [comment("x", "strength")],
      "A mark below full marks requires a fix comment.",
    ],
    [[comment("x")], "A positive mark requires a strength comment."],
    [
      [comment("x", "strength"), comment("y", "fix", null)],
      "Every fix comment requires a non-empty next_mark.",
    ],
    [
      [comment("x", "strength"), comment("y", "fix", "  ")],
      "Every fix comment requires a non-empty next_mark.",
    ],
  ])("rejects invalid comments %#", (comments, problem) => {
    expect(
      validateGrade(criteria, 4, {
        band_selected: criteria[0].descriptor,
        mark: 3,
        comments,
      }),
    ).toEqual({ ok: false, problem });
  });
  it("accepts strengths only at full marks and fixes only at zero marks", () => {
    expect(
      validateGrade(criteria, 4, {
        band_selected: criteria[0].descriptor,
        mark: 4,
        comments: [comment("x", "strength")],
      }),
    ).toEqual({ ok: true });
    expect(
      validateGrade(criteria, 4, {
        band_selected: "NO BAND SATISFIED",
        mark: 0,
        comments: [comment("x")],
      }),
    ).toEqual({ ok: true });
    expect(
      validateGrade(criteria, 4, {
        band_selected: criteria[0].descriptor,
        mark: 3,
        comments: [comment("x", "strength"), comment("y")],
      }),
    ).toEqual({ ok: true });
  });
  it("still checks fixes at zero marks and strengths at full marks", () => {
    expect(
      validateGrade(criteria, 4, {
        band_selected: "NO BAND SATISFIED",
        mark: 0,
        comments: [],
      }).ok,
    ).toBe(false);
    expect(
      validateGrade(criteria, 4, {
        band_selected: "NO BAND SATISFIED",
        mark: 0,
        comments: [comment("x", "fix", null)],
      }).ok,
    ).toBe(false);
    expect(
      validateGrade(criteria, 4, {
        band_selected: criteria[0].descriptor,
        mark: 4,
        comments: [],
      }).ok,
    ).toBe(false);
  });
  it("checks band and mark rules before comment rules", () => {
    expect(
      validateGrade(criteria, 4, {
        band_selected: "Invented",
        mark: 3,
        comments: [],
      }),
    ).toEqual({
      ok: false,
      problem: "Selected band is not in the marking guideline.",
    });
  });
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

const comment = (
  quote: string,
  kind: "strength" | "fix" = "fix",
  next_mark: string | null = " Add the mechanism. ",
) => ({
  quote,
  kind,
  tag: "Analysis" as const,
  body: " Clear link. ",
  next_mark,
});

describe("anchorComments", () => {
  it.each([
    ["Prices rise.", " Prices rise ", "Prices rise", 0],
    [
      "First. Inflation   raises\n\tprices (2%).",
      "Inflation raises prices (2%).",
      "Inflation   raises\n\tprices (2%).",
      7,
    ],
    ["A ‘rise’ in “prices”", "'rise' in \"prices\"", "‘rise’ in “prices”", 2],
    ["A ‚rise‛ in „prices”", "'rise' in \"prices\"", "‚rise‛ in „prices”", 2],
    ["INFLATION raises prices", "inflation", "INFLATION", 0],
    ["İ prices", "i̇ prices", "İ prices", 0],
  ])(
    "anchors %s using %s and returns the original slice",
    (answer, quote, original, start) => {
      const [anchored] = anchorComments(answer, [comment(quote)]);
      expect(anchored).toEqual({
        ...comment(original),
        start,
        body: "Clear link.",
        next_mark: "Add the mechanism.",
      });
      expect(
        answer.slice(anchored.start!, anchored.start! + anchored.quote.length),
      ).toBe(original);
    },
  );
  it.each(["rise", "RISE"])(
    "chooses repeated %s at or after the previous anchor and falls back to the first",
    (quote) => {
      expect(
        anchorComments("rise middle rise end", [
          comment("middle"),
          comment(quote),
          comment("end"),
          comment(quote),
        ]).map((c) => [c.quote, c.start]),
      ).toEqual([
        ["rise", 0],
        ["middle", 5],
        ["rise", 12],
        ["end", 17],
      ]);
      expect(
        anchorComments("rise rise", [comment(quote), comment(quote)]).map(
          (c) => c.start,
        ),
      ).toEqual([0, 0]);
    },
  );
  it("keeps misses unchanged, sorts them last stably, and does not reset the previous anchor", () => {
    const result = anchorComments("rise middle rise", [
      comment("middle"),
      comment("invented"),
      comment("RISE"),
      comment("  "),
      comment("rises"),
    ]);
    expect(result.map((c) => [c.quote, c.start])).toEqual([
      ["middle", 5],
      ["rise", 12],
      ["invented", null],
      ["  ", null],
      ["rises", null],
    ]);
  });
  it("prefers exact matches before normalised matches", () => {
    expect(anchorComments("RISE middle rise", [comment("rise")])[0].start).toBe(
      12,
    );
  });
  it("trims prose, clears strength next marks, and preserves stable ties without mutating inputs", () => {
    const comments = [
      comment("later", "strength"),
      comment("first", "fix", "  "),
      comment("first", "strength"),
    ];
    expect(anchorComments("first later", comments)).toEqual([
      { ...comments[1], start: 0, body: "Clear link.", next_mark: null },
      { ...comments[2], start: 0, body: "Clear link.", next_mark: null },
      { ...comments[0], start: 6, body: "Clear link.", next_mark: null },
    ]);
    expect(comments[0].next_mark).toBe(" Add the mechanism. ");
    expect(anchorComments("", [comment("first")])[0].start).toBeNull();
  });
});

describe("topicSummary", () => {
  it("groups topics, prioritises misses and identifies strengths", () => {
    const summary = topicSummary([
      { topic: "Inflation", correct: true },
      { topic: "Inflation", correct: false },
      { topic: "Trade", correct: true },
      { topic: "Employment", correct: false },
      { topic: "Employment", correct: false },
    ]);
    expect(summary.strengths).toEqual(["1/1 correct on Trade."]);
    expect(summary.improvements[0]).toBe("2 of 2 missed on Employment.");
    expect(summary.next_steps[0]).toBe("Run a Topic Sprint on Employment.");
  });
  it("handles a perfect session", () => {
    expect(
      topicSummary([{ topic: "Trade", correct: true }]).improvements,
    ).toEqual(["No misses this time: try a harder mode or a mixed sprint."]);
  });
});
