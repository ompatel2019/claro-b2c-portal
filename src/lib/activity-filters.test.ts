import { describe, expect, it } from "vitest";
import { parseActivityFilters, activityHref } from "./activity-filters";
import {
  sessionTitle,
  sessionStatus,
  sessionScore,
  sessionHref,
} from "./session-summary";
const today = "2026-10-09";
const topics = [
  { id: "inflation", parent_id: "policy", name: "Inflation", sort: 1 },
];
describe("Activity filters", () => {
  it("validates untrusted URL values and leap days", () => {
    expect(
      parseActivityFilters(
        {
          kind: "bad",
          status: "bad",
          sort: "bad",
          page: "1.5",
          date: "2026-02-30",
          q: ["a", "b"],
        },
        today,
      ),
    ).toMatchObject({
      kind: "",
      status: "",
      sort: "newest",
      page: 1,
      date: "",
      q: "",
    });
    expect(parseActivityFilters({ date: "2024-02-29" }, today).from).toBe(
      "2024-02-29",
    );
  });
  it("uses inclusive Sydney day ranges and gives heatmap days precedence", () => {
    expect(parseActivityFilters({ range: "7" }, today)).toMatchObject({
      from: "2026-10-03",
      to: today,
    });
    expect(
      parseActivityFilters({ date: "2026-10-01", range: "90" }, today),
    ).toMatchObject({ from: "2026-10-01", to: "2026-10-01" });
  });
  it("normalises backwards custom dates and preserves filters during paging", () => {
    const f = parseActivityFilters(
      {
        range: "custom",
        from: today,
        to: "2026-10-01",
        kind: "single",
        q: "  Inflation  ",
        sort: "lowest",
      },
      today,
    );
    expect(f).toMatchObject({ from: "2026-10-01", to: today, q: "Inflation" });
    expect(activityHref(f, { page: 2 })).toContain("page=2");
    expect(activityHref(f, { page: 2 })).toContain("kind=single");
    expect(
      activityHref(parseActivityFilters({ date: today }, today), { date: "" }),
    ).toBe("/student/activity");
    expect(activityHref(parseActivityFilters({}, today))).toBe(
      "/student/activity",
    );
  });
});
describe("Shared session summary", () => {
  it("derives each kind's title, preferring subtopics and paper titles", () => {
    expect(
      sessionTitle(
        {
          kind: "sprint",
          config: {
            mode: "short",
            topics: ["policy"],
            subtopics: ["inflation"],
          },
        },
        topics,
      ),
    ).toBe("Short answer sprint · Inflation");
    expect(
      sessionTitle({ kind: "flashcards", config: { mode: "study" } }),
    ).toBe("Flashcards · Study");
    expect(
      sessionTitle(
        { kind: "single", config: { question: { topic_id: "inflation" } } },
        topics,
      ),
    ).toBe("Mark my answer · Inflation");
    expect(sessionTitle({ kind: "paper", config: {} }, [], "Trial 2026")).toBe(
      "Trial 2026",
    );
  });
  it("distinguishes pending marking from provisional and reviewed marks", () => {
    const s = { config: {}, finished_at: today };
    expect(
      sessionStatus({ ...s, finished_at: null }, [{ status: "pending" }]),
    ).toBe("In progress");
    expect(
      sessionStatus(s, [
        { status: "marking" },
        { status: "marked", check_status: "in_review" },
      ]),
    ).toBe("Marking");
    expect(
      sessionStatus(s, [{ status: "marked", check_status: "in_review" }]),
    ).toBe("Provisional");
    for (const check_status of ["skipped", "agreed", "second_pass", "reviewed"])
      expect(sessionStatus(s, [{ status: "marked", check_status }])).toBe(
        "Finished",
      );
    expect(sessionScore(90, "Marking")).toBe("Marking");
    expect(sessionScore(0, "Finished")).toBe("0%");
    expect(sessionScore(null, "Finished", true)).toBe("—");
  });
});

it.each([
  ["sprint", null, null, "/student/sprint/s"],
  ["sprint", null, today, "/student/sprint/s/results"],
  ["paper", "p", null, "/student/papers/p"],
  ["paper", "p", today, "/student/papers/p/results?sit=s"],
  ["paper", null, today, null],
  ["flashcards", null, null, "/student/flashcards/s"],
  ["flashcards", null, today, "/student/flashcards/s"],
  ["single", null, null, "/student/activity/s"],
  ["single", null, today, "/student/activity/s"],
])(
  "links %s to an existing runner or report",
  (kind, paper_id, finished_at, expected) => {
    expect(sessionHref({ id: "s", kind: kind!, paper_id, finished_at })).toBe(
      expected,
    );
  },
);
it("bounds pages, ignores duplicate parameters, and never interprets malformed days", () => {
  for (const page of ["0", "-1", "Infinity", "9007199254740992"])
    expect(parseActivityFilters({ page }, today).page).toBe(1);
  expect(parseActivityFilters({ page: "1000001" }, today).page).toBe(1000000);
  for (const date of ["0000-01-01", "2026-13-01", "2026-02-29", "2026-1-01"])
    expect(parseActivityFilters({ date }, today).date).toBe("");
  expect(
    parseActivityFilters({ topic: ["a", "b"], status: ["finished"] }, today),
  ).toMatchObject({ topic: "", status: "" });
});
