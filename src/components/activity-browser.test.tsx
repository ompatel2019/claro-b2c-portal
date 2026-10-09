import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/student/activity",
}));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
import { ActivityBrowser } from "./activity-browser";
import {
  parseActivityFilters,
  type ActivityData,
  type ActivityRow,
} from "@/lib/activity-filters";
import ActivityError from "@/app/(app)/student/activity/error";
import ActivityLoading from "@/app/(app)/student/activity/loading";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const filters = parseActivityFilters({}, "2026-10-09");
const row: ActivityRow = {
  id: "s",
  kind: "sprint",
  title: "Short answer sprint · Inflation",
  status: "Finished",
  provisional: false,
  study: false,
  pct: 75,
  items: 8,
  answered: 8,
  elapsed_s: 65,
  started_at: "2026-10-09T00:00:00Z",
  finished_at: "2026-10-09T00:01:00Z",
};
const data: ActivityData = {
  rows: [row],
  page: 1,
  total: 25,
  all_total: 25,
  kinds: { sprint: 25 },
  kind_total: 25,
  stats: { sessions: 25, questions: 200, average: 75, best: 75 },
};
const show = (d = data, f = filters) =>
  render(
    <ActivityBrowser data={d} filters={f} topics={[]} today="2026-10-09" />,
  );
it("links rows to canonical reports and preserves filters in pagination", () => {
  show(data, { ...filters, kind: "sprint" });
  expect(screen.getByRole("link", { name: row.title })).toHaveAttribute(
    "href",
    "/student/sprint/s/results",
  );
  expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
    "href",
    "/student/activity?kind=sprint&page=2",
  );
  expect(screen.getByText("75%")).toBeVisible();
  fireEvent.click(screen.getAllByText("8 questions")[0]);
  expect(push).toHaveBeenCalledWith("/student/sprint/s/results");
});
it("uses distinct first-use and filtered empty actions", () => {
  show({ ...data, rows: [], all_total: 0 });
  expect(screen.getByText("Nothing here yet")).toBeVisible();
  expect(screen.getByRole("link", { name: "Start sprint" })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  cleanup();
  show({ ...data, rows: [] });
  expect(screen.getByText("No sessions match")).toBeVisible();
  expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
    "href",
    "/student/activity",
  );
});
it("kind chips reset paging while retaining other filters", () => {
  show(data, { ...filters, q: "Inflation", page: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Sprints · 25" }));
  expect(push).toHaveBeenCalledWith(
    "/student/activity?kind=sprint&q=Inflation",
  );
});
it("shows the heatmap day chip and removes it", () => {
  show(data, parseActivityFilters({ date: "2026-10-08" }, "2026-10-09"));
  fireEvent.click(screen.getByRole("button", { name: "Remove day filter" }));
  expect(push).toHaveBeenCalledWith("/student/activity");
});
it("has an in-card error and skeleton rows", () => {
  const reset = vi.fn();
  render(<ActivityError unstable_retry={reset} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load this. Try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
  cleanup();
  render(<ActivityLoading />);
  expect(
    screen.getByRole("status", { name: "Loading activity" }),
  ).toBeVisible();
});

it("keeps pending scores hidden and provisional marks labelled", () => {
  show({
    ...data,
    rows: [{ ...row, status: "Marking", provisional: true, pct: 90 }],
  });
  expect(screen.queryByText("90%")).not.toBeInTheDocument();
  expect(screen.getAllByText("Provisional")).toHaveLength(2);
  cleanup();
  show({
    ...data,
    rows: [{ ...row, kind: "flashcards", study: true, pct: 100 }],
  });
  expect(screen.getByLabelText("Study session, no score")).toHaveTextContent(
    "—",
  );
});

it("links a single-answer session to its own report", () => {
  show({
    ...data,
    rows: [{ ...row, kind: "single", title: "Mark my answer" }],
  });
  for (const link of screen.getAllByRole("link", { name: /Mark my answer/ }))
    expect(link).toHaveAttribute("href", "/student/activity/s");
});
it("sorts on the server, resets paging and clears every external filter", () => {
  show(
    data,
    parseActivityFilters(
      { kind: "sprint", date: "2026-10-08", page: "2" },
      "2026-10-09",
    ),
  );
  expect(screen.getByRole("link", { name: "Clear (2)" })).toHaveAttribute(
    "href",
    "/student/activity",
  );
  fireEvent.click(screen.getByRole("button", { name: "Score" }));
  expect(push).toHaveBeenCalledWith(
    "/student/activity?kind=sprint&sort=lowest&date=2026-10-08",
  );
  expect(screen.getAllByRole("row")[1]).toHaveClass("h-14");
});

it("toggles the default date order to oldest and back to newest", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Date" }));
  expect(push).toHaveBeenCalledWith("/student/activity?sort=oldest");
  cleanup();
  show(data, { ...filters, sort: "oldest" });
  fireEvent.click(screen.getByRole("button", { name: "Date" }));
  expect(push).toHaveBeenCalledWith("/student/activity");
});

it("ignores a legacy paper session alongside supported activity", () => {
  show({
    ...data,
    rows: [
      row,
      { ...row, id: "old-paper", kind: "paper", title: "Removed session" },
    ],
  });
  expect(screen.queryByText("Removed session")).toBeNull();
  expect(screen.getAllByRole("link", { name: row.title })[0]).toHaveAttribute(
    "href",
    "/student/sprint/s/results",
  );
});
