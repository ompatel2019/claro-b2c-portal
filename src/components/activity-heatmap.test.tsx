import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { ActivityHeatmap } from "./activity-heatmap";
afterEach(cleanup);
beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

const days = [
  { day: "2026-10-07", questions: 14, cards: 20 },
  { day: "2026-10-08", questions: 3, cards: 0 },
  { day: "2024-01-01", questions: 9, cards: 0 },
];

it("shows streaks, shaded days and a tooltip, and links each day", () => {
  render(
    <ActivityHeatmap days={days} today="2026-10-08" current={2} longest={5} />,
  );
  expect(document.body.textContent).toContain(
    "Current streak 2 days · Longest 5 days · 2 active days in the last year",
  );
  const busy = screen.getByRole("link", {
    name: "Wed 7 Oct 2026 · 14 questions · 20 flashcards (31 or more)",
  });
  expect(busy.getAttribute("href")).toBe("/student/activity?date=2026-10-07");
  expect(busy.style.background).toBe("rgb(245, 79, 27)");
  expect(screen.getAllByRole("link")).toHaveLength(52 * 7 + 4);
  fireEvent.mouseEnter(busy);
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Wed 7 Oct 2026 · 14 questions · 20 flashcards",
  );
  expect(screen.queryByText(/start your streak/)).toBeNull();
});

it("moves focus with arrow keys from today (roving tabindex)", () => {
  render(
    <ActivityHeatmap days={[]} today="2026-10-08" current={0} longest={0} />,
  );
  const today = screen.getByRole("link", { name: /^Thu 8 Oct 2026/ });
  expect(today.tabIndex).toBe(0);
  today.focus();
  fireEvent.keyDown(today, { key: "ArrowUp" });
  expect(document.activeElement?.getAttribute("data-day")).toBe("2026-10-07");
  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  expect(document.activeElement?.getAttribute("data-day")).toBe("2026-09-30");
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(document.activeElement?.getAttribute("data-day")).toBe("2026-10-07");
  screen.getByText(
    "Answer a question or review a flashcard to start your streak.",
  );
});

it("shows an in-card alert on error", () => {
  render(
    <ActivityHeatmap
      days={[]}
      today="2026-10-08"
      current={0}
      longest={0}
      error
    />,
  );
  screen.getByRole("alert");
  expect(screen.queryByText(/Current streak/)).toBeNull();
});
