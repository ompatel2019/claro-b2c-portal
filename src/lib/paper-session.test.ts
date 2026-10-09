import { answered } from "./practice";
import { describe, it, expect } from "vitest";
import {
  paperClock,
  paperDuration,
  paperSections,
  resolvePaperChoices,
  type PaperConfig,
} from "./paper-session";
const config: PaperConfig = {
  time_limit_min: 180,
  reading_min: 5,
  strict: true,
  sections: [
    { position: 1, section: "I", choice_group: null },
    { position: 24, section: "III", choice_group: 1 },
    { position: 25, section: "III", choice_group: 1 },
  ],
};
const start = "2026-10-09T00:00:00Z";
const rows = [
  {
    id: "1",
    position: 1,
    question: { marks: 1 },
    choice_index: 0,
    answer_text: null,
    transcript: null,
  },
  {
    id: "24",
    position: 24,
    question: { marks: 20 },
    choice_index: null,
    answer_text: "First draft",
    transcript: null,
  },
  {
    id: "25",
    position: 25,
    question: { marks: 20 },
    choice_index: null,
    answer_text: "Second draft",
    transcript: null,
  },
];
describe("strict paper clock", () => {
  it("includes reading time in the fixed deadline", () => {
    expect(paperClock(start, config, Date.parse(start))).toMatchObject({
      remaining: 11100,
      reading: true,
      readingRemaining: 300,
      deadline: Date.parse(start) + 11100000,
    });
  });
  it("unlocks at the exact reading boundary", () => {
    expect(paperClock(start, config, Date.parse(start) + 300000)).toMatchObject(
      { reading: false, remaining: 10800 },
    );
  });
  it("early writing persists without moving the deadline", () => {
    expect(
      paperClock(
        start,
        { ...config, writing_started_at: start },
        Date.parse(start),
      ),
    ).toMatchObject({ reading: false, remaining: 11100 });
  });
  it("has no reading lock when disabled", () => {
    expect(
      paperClock(start, { ...config, reading_min: 0 }, Date.parse(start)),
    ).toMatchObject({ reading: false, remaining: 10800 });
  });
  it("never grants overtime to an expired or reopened sit", () => {
    expect(
      paperClock(start, config, Date.parse(start) + 12000000),
    ).toMatchObject({ reading: false, remaining: 0 });
  });
});
describe("paper sections and choices", () => {
  it("counts a choice group once for marks and answered subtotal", () => {
    expect(
      paperSections(
        config.sections,
        rows.map((r) => ({
          position: r.position,
          marks: r.question.marks,
          answered: answered(r),
        })),
      ),
    ).toMatchObject([
      { name: "I", total: 1, answered: 1, marks: 1 },
      {
        name: "III",
        total: 1,
        answered: 1,
        marks: 20,
        units: [{ positions: [24, 25] }],
      },
    ]);
  });
  it("requires a choice when both are drafted", () => {
    expect(resolvePaperChoices(config.sections, rows, {})).toEqual({
      skipped: [],
      unresolved: [1],
    });
  });
  it("keeps the explicitly selected answer", () => {
    expect(resolvePaperChoices(config.sections, rows, { "1": 25 })).toEqual({
      skipped: ["24"],
      unresolved: [],
    });
  });
  it("chooses the only draft automatically", () => {
    expect(
      resolvePaperChoices(
        config.sections,
        rows.map((r) => (r.id === "24" ? { ...r, answer_text: null } : r)),
        {},
      ),
    ).toEqual({ skipped: ["24"], unresolved: [] });
  });
  it("keeps one unanswered question when neither was drafted", () => {
    expect(
      resolvePaperChoices(
        config.sections,
        rows.map((r) => ({ ...r, answer_text: null })),
        {},
      ),
    ).toEqual({ skipped: ["25"], unresolved: [] });
  });
  it("resolves both drafts at timeout deterministically", () => {
    expect(resolvePaperChoices(config.sections, rows, {}, true)).toEqual({
      skipped: ["25"],
      unresolved: [],
    });
  });
  it("rejects an unrelated position as a selection", () => {
    expect(resolvePaperChoices(config.sections, rows, { "1": 1 })).toEqual({
      skipped: [],
      unresolved: [1],
    });
  });
});

it("ignores a saved choice whose draft was cleared", () => {
  const cleared = rows.map((r) =>
    r.id === "25" ? { ...r, answer_text: "" } : r,
  );
  expect(resolvePaperChoices(config.sections, cleared, { "1": 25 })).toEqual({
    skipped: ["25"],
    unresolved: [],
  });
});
it("ignores a saved choice when neither side is answered", () => {
  expect(
    resolvePaperChoices(
      config.sections,
      rows.map((r) => ({ ...r, answer_text: null })),
      { "1": 25 },
    ),
  ).toEqual({ skipped: ["25"], unresolved: [] });
});
it("unlocks immediately after early writing despite client clock skew", () => {
  expect(
    paperClock(
      start,
      { ...config, writing_started_at: "2026-10-09T00:01:00Z" },
      Date.parse(start) + 59000,
    ).reading,
  ).toBe(false);
});
it.each([
  [60, "1 hour", "1-hour"],
  [150, "2 hours 30 minutes", "2-hour 30-minute"],
  [180, "3 hours", "3-hour"],
  [1, "1 minute", "1-minute"],
])(
  "formats %i minutes for the pre-start and timer copy",
  (min, display, timer) => {
    expect(paperDuration(min as number)).toBe(display);
    expect(paperDuration(min as number, true)).toBe(timer);
  },
);
