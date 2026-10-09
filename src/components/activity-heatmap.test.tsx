import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityHeatmap } from "./activity-heatmap";
let resize: (width: number) => void;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = (width) =>
          callback(
            [{ contentRect: { width } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
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

it("keeps whole recent weeks and drops month labels without enough room on resize", () => {
  const { container } = render(
    <ActivityHeatmap days={days} today="2026-10-08" current={2} longest={5} />,
  );
  const oldest = screen.getAllByRole("link")[0];
  act(() => oldest.focus());
  act(() => resize(242));
  expect(screen.getAllByRole("link")).toHaveLength(14 * 7 + 4);
  expect(screen.getAllByRole("link")[0]).toHaveAttribute(
    "data-day",
    "2026-06-29",
  );
  expect(screen.getByRole("link", { name: /^Thu 8 Oct 2026/ })).toHaveAttribute(
    "tabindex",
    "0",
  );
  expect(document.activeElement).toBe(
    screen.getByRole("link", { name: /^Thu 8 Oct 2026/ }),
  );
  expect(screen.getByRole("group")).toHaveAccessibleName(
    "Activity from 2026-06-29 to 2026-10-08",
  );
  expect(
    Array.from(
      container.querySelectorAll("[data-month-label]"),
      (el) => el.textContent,
    ),
  ).toEqual(["Jul", "Aug", "Sep"]);
  act(() => resize(774));
  expect(screen.getAllByRole("link")).toHaveLength(52 * 7 + 4);
  expect(container.querySelector("[data-month-label]")).toHaveTextContent(
    "Oct",
  );
});

it("keeps every year day reachable in compact views and preserves custom links", () => {
  render(
    <ActivityHeatmap
      days={days}
      today="2026-10-08"
      current={2}
      longest={5}
      link="/admin/students/s?tab=sessions&date="
    />,
  );
  const allDays = new Set(
    screen.getAllByRole("link").map((link) => link.getAttribute("data-day")),
  );
  act(() => resize(242));
  const seen = new Set<string | null>();
  const earlier = screen.getByRole("button", { name: "Earlier weeks" });
  do {
    expect(
      screen.getAllByRole("link").filter((link) => link.tabIndex === 0),
    ).toHaveLength(1);
    for (const link of screen.getAllByRole("link")) {
      const day = link.getAttribute("data-day");
      seen.add(day);
      expect(link).toHaveAttribute(
        "href",
        `/admin/students/s?tab=sessions&date=${day}`,
      );
    }
    if (earlier.hasAttribute("disabled")) break;
    fireEvent.click(earlier);
  } while (true);
  expect(seen).toEqual(allDays);
  const last = screen.getAllByRole("link").find((link) => link.tabIndex === 0)!;
  act(() => last.focus());
  fireEvent.keyDown(last, { key: "ArrowRight" });
  expect(document.activeElement).toBe(last);
  const later = screen.getByRole("button", { name: "Later weeks" });
  while (!later.hasAttribute("disabled")) {
    fireEvent.click(later);
    expect(
      screen.getAllByRole("link").filter((link) => link.tabIndex === 0),
    ).toHaveLength(1);
  }
  expect(screen.getByRole("link", { name: /^Thu 8 Oct 2026/ })).toHaveAttribute(
    "tabindex",
    "0",
  );
});
