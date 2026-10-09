import { describe, expect, it } from "vitest";
import type { ReviewRow } from "./feedback";
import {
  delta,
  firstBelow,
  kpis,
  markTone,
  nextActions,
  sprintHref,
  timeMeta,
} from "./results";

const row = (o: Partial<ReviewRow>): ReviewRow =>
  ({
    type: "short",
    marks: 4,
    max_marks: 4,
    status: "marked",
    check_status: "none",
    feedback: {},
    mark: 4,
    topic_id: "t3-inflation",
    ...o,
  }) as ReviewRow;
const topics = [
  { id: "t3-inflation", parent_id: "t3", name: "Inflation", sort: 1 },
  { id: "t3-unemployment", parent_id: "t3", name: "Unemployment", sort: 2 },
];

describe("results", () => {
  it("tallies scored questions only, split by MC and written", () => {
    const k = kpis([
      row({ type: "mcq", marks: 1, max_marks: 1, mark: 1 }),
      row({ mark: 2 }),
      row({ status: "pending", mark: null }),
      row({ mark: 0, feedback: { note: "No answer" } }),
    ]);
    expect(k.score).toEqual({ mark: 3, max: 9 });
    expect(k.mc).toEqual({ mark: 1, max: 1 });
    expect(k.written).toEqual({ mark: 2, max: 8 });
    expect(k.writtenCount).toBe(3);
  });
  it("opens on the first question below full marks", () => {
    expect(
      firstBelow([row({}), row({ status: "pending" }), row({ mark: 3 })]),
    ).toBe(2);
    expect(firstBelow([row({}), row({})])).toBe(0);
  });
  it("labels time against the limit", () => {
    expect(timeMeta(1930, 2700)).toBe("32:10 of 45:00");
    expect(timeMeta(2892, 2700)).toBe("3:12 over time");
    expect(timeMeta(65, null)).toBe("1:05");
  });
  it("describes deltas", () => {
    expect(delta(70, 64, " pts")).toBe("+6 pts vs your average");
    expect(delta(60, 64.4, " pts")).toBe("−4 pts vs your average");
    expect(delta(64, 64.2)).toBe("Same as your average");
    expect(delta(60, null)).toBeNull();
  });
  it("colours chips by share of marks", () => {
    expect(markTone(4, 4)).toMatch(/success/);
    expect(markTone(1, 4)).toMatch(/warning/);
    expect(markTone(0, 4)).toMatch(/destructive/);
  });
  it("links back to setup with the same type and topics", () => {
    expect(
      sprintHref(
        { mode: "short", topics: ["t3"], subtopics: ["t3-inflation"] },
        { history: "mistakes" },
      ),
    ).toBe(
      "/student/sprint?type=short&topics=t3&sub=t3-inflation&history=mistakes",
    );
  });
  it("builds next-step actions from the weakest subtopics, deterministically", () => {
    const actions = nextActions(
      [
        row({ topic_id: "t3-inflation", mark: 1 }),
        row({ topic_id: "t3-unemployment", mark: 3 }),
        row({ topic_id: "t3-unemployment", mark: 4 }),
      ],
      "short",
      topics,
      { "t3-inflation": 6 },
    );
    expect(actions).toEqual([
      {
        label: "Practise Inflation short answers",
        href: "/student/sprint?type=short&sub=t3-inflation",
      },
      {
        label: "Practise Unemployment short answers",
        href: "/student/sprint?type=short&sub=t3-unemployment",
      },
      {
        label: "Review 6 flashcards on Inflation",
        href: "/flashcards?topic=t3-inflation",
      },
    ]);
    expect(nextActions([row({})], "short", topics, {})).toEqual([]);
  });
});
