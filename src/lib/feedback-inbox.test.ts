import { expect, it } from "vitest";
import { feedbackStatus, filterFeedback } from "./feedback-inbox";
const row = {
  id: "feedback-id",
  user_id: "student-id",
  kind: "feature",
  name: "Ada",
  message: "Timer stopped",
  page_path: "/student/sprint",
  linked: "HSC 2025",
  question_id: "question-id",
  flashcard_id: "flashcard-id",
  session_id: "session-id",
  screenshots: 2,
  status: "new",
  created_at: "2026-10-08T13:30:00Z",
};
it("searches all displayed text and linked IDs without case sensitivity", () => {
  for (const q of [
    "feedback-id",
    "student-id",
    "FEATURE",
    "Ada",
    "Timer",
    "/student",
    "HSC",
    "question-id",
    "flashcard-id",
    "session-id",
    "new",
    "2",
  ])
    expect(filterFeedback([row], { q })).toEqual([row]);
  expect(filterFeedback([row], { q: "missing" })).toEqual([]);
  expect(filterFeedback([row], { q: "  " })).toEqual([row]);
});
it("uses inclusive Sydney days in both summer and winter", () => {
  expect(
    filterFeedback([row], { from: "2026-10-09", to: "2026-10-09" }),
  ).toEqual([row]);
  expect(filterFeedback([row], { to: "2026-10-08" })).toEqual([]);
  const winter = { ...row, created_at: "2026-07-08T14:30:00Z" };
  expect(
    filterFeedback([winter], { from: "2026-07-09", to: "2026-07-09" }),
  ).toEqual([winter]);
  const end = { ...row, created_at: "2026-10-09T12:59:59.999Z" };
  expect(filterFeedback([end], { to: "2026-10-09" })).toEqual([end]);
  expect(filterFeedback([row], { from: "2026-02-30", to: "bad" })).toEqual([
    row,
  ]);
});
it("requires the enabled screenshot value and normalises status", () => {
  expect(
    filterFeedback([{ ...row, screenshots: 0 }, row], { shots: "1" }),
  ).toEqual([row]);
  expect(
    filterFeedback([{ ...row, screenshots: 0 }], { shots: "0" }),
  ).toHaveLength(1);
  expect(feedbackStatus("triaged")).toBe("triaged");
  expect(feedbackStatus("resolved")).toBe("resolved");
  expect(feedbackStatus("invalid")).toBe("new");
});

it("searches the displayed relative age", () => {
  expect(
    filterFeedback(
      [row],
      { q: "12 min ago" },
      new Date("2026-10-08T13:42:00Z"),
    ),
  ).toEqual([row]);
});
