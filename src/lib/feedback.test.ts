import { describe, expect, it } from "vitest";
import {
  bandOf,
  layoutCards,
  markLabel,
  markingState,
  nextMarkLine,
  readComments,
  uncertainParts,
  type ReviewRow,
} from "./feedback";

const state = (
  status: string,
  check_status = "skipped",
  feedback: ReviewRow["feedback"] = null,
) => markingState({ status, check_status, feedback });

describe("markingState", () => {
  it.each([
    ["pending", "skipped", "marking"],
    ["transcribed", "skipped", "marking"],
    ["marking", "pending", "marking"],
    ["marked", "pending", "marking"],
    ["marked", "skipped", "marked"],
    ["marked", "agreed", "marked"],
    ["marked", "second_pass", "marked"],
    ["marked", "in_review", "in_review"],
    ["marked", "reviewed", "reviewed"],
    ["failed", "skipped", "failed"],
    ["unreadable", "skipped", "unreadable"],
    ["skipped", "skipped", "skipped"],
  ])("%s + %s is %s", (status, check, expected) => {
    expect(state(status, check)).toBe(expected);
  });
  it("reads a zero mark with the No answer note as not answered", () => {
    expect(state("marked", "skipped", { note: "No answer" })).toBe(
      "not_answered",
    );
  });
});

describe("readComments", () => {
  const text = "Inflation erodes competitiveness. Exports fall.";
  it("orders new-shape comments by position, unanchored last under Overall", () => {
    const c = readComments(
      {
        comments: [
          {
            quote: "Exports fall",
            start: 34,
            kind: "fix",
            tag: "Analysis",
            body: "Explain why.",
            next_mark: "Link prices to demand.",
          },
          {
            quote: "nowhere",
            start: null,
            kind: "fix",
            tag: "Evidence",
            body: "Add data.",
            next_mark: null,
          },
          {
            quote: "erodes competitiveness",
            start: 10,
            kind: "strength",
            tag: "Knowledge",
            body: "Right idea.",
            next_mark: null,
          },
        ],
      },
      text,
    );
    expect(c.map((x) => [x.n, x.id, x.start])).toEqual([
      [1, 2, 10],
      [2, 0, 34],
      [3, 1, null],
    ]);
    expect(c[1].next_mark).toBe("Link prices to demand.");
  });
  it("reads the old shape: improvement is a fix, comment is the body, no tag", () => {
    const [c] = readComments(
      {
        comments: [
          {
            quote: "Exports fall",
            start: 34,
            line: 1,
            type: "improvement",
            comment: "Say why.",
          },
        ],
      },
      text,
    );
    expect(c).toMatchObject({
      kind: "fix",
      body: "Say why.",
      tag: null,
      next_mark: null,
      start: 34,
    });
  });
  it("unanchors quotes that don't match the answer text and drops empty bodies", () => {
    const c = readComments(
      {
        comments: [
          { quote: "Exports rise", start: 34, kind: "fix", body: "x" },
          { quote: "Exports", start: 34, kind: "strength", body: " " },
          { quote: "fall", start: 999, kind: "fix", body: "y", tag: "Bogus" },
        ],
      },
      text,
    );
    expect(c.map((x) => [x.start, x.tag])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(readComments(null, text)).toEqual([]);
    expect(readComments({ comments: "nope" }, text)).toEqual([]);
  });
  it("never puts next_mark on a strength", () => {
    const [c] = readComments(
      {
        comments: [{ quote: "", kind: "strength", body: "b", next_mark: "z" }],
      },
      text,
    );
    expect(c.next_mark).toBeNull();
  });
});

describe("summary helpers", () => {
  const comments = readComments(
    {
      comments: [
        { quote: "", kind: "fix", body: "a", next_mark: null },
        { quote: "", kind: "fix", body: "b", next_mark: "Add a statistic." },
      ],
    },
    "",
  );
  it("takes the next mark from the top fix, then next_band, and says so at full marks", () => {
    expect(nextMarkLine(comments, null, false)).toBe("Add a statistic.");
    expect(nextMarkLine([], { next_band: "Explain the link." }, false)).toBe(
      "Explain the link.",
    );
    expect(nextMarkLine(comments, null, true)).toBe(
      "Full marks. Nothing missing.",
    );
    expect(nextMarkLine([], null, false)).toBeNull();
  });
  it("labels bands by marks, not band numbers", () => {
    const criteria = [
      { min: 4, max: 5, descriptor: "Sound" },
      { min: 1, max: 1, descriptor: "Some" },
    ];
    expect(bandOf(criteria, "Sound")?.label).toBe("Band: 4–5 marks");
    expect(bandOf(criteria, "Some")?.label).toBe("Band: 1 mark");
    expect(bandOf(criteria, "Other")).toBeNull();
    expect(bandOf(null, "Some")).toBeNull();
  });
  it("shows a range only for an open disagreement", () => {
    const row = {
      mark: 4,
      max_marks: 6,
      marks: 6,
      review: {
        status: "open",
        reason: "check_disagreed",
        ai_mark: 4,
        check_mark: 3,
        final_mark: null,
      },
    } as unknown as ReviewRow;
    expect(markLabel(row, "in_review")).toBe("3–4 / 6");
    expect(markLabel(row, "marked")).toBe("4 / 6");
    expect(
      markLabel(
        { ...row, review: { ...row.review!, reason: "student_dispute" } },
        "in_review",
      ),
    ).toBe("4 / 6");
  });
});

it("marks transcriber-uncertain words", () => {
  expect(uncertainParts("the rate[?] rose [?] fast")).toEqual([
    { text: "the ", uncertain: false },
    { text: "rate[?]", uncertain: true },
    { text: " rose ", uncertain: false },
    { text: "[?]", uncertain: true },
    { text: " fast", uncertain: false },
  ]);
});

it("places cards level with highlights and pushes collisions down 8px", () => {
  expect(
    layoutCards([
      { anchor: 0, height: 50 },
      { anchor: 20, height: 40 },
      { anchor: 200, height: 10 },
    ]),
  ).toEqual([0, 58, 200]);
});
