import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CategoryBar, WeeklyChart } from "./charts";
import type { Week } from "./data";

afterEach(cleanup);
const weeks: Week[] = [
  { day: "2026-09-28", written: 2, checked: 1, agreed: 1, disputes: 0 },
  { day: "2026-10-05", written: 6, checked: 6, agreed: 3, disputes: 2 },
  { day: "2026-10-12", written: 0, checked: 0, agreed: 0, disputes: 0 },
];

it("agreement chart names every week in the image label and an sr-only table", () => {
  render(<WeeklyChart weeks={weeks} kind="agreement" />);
  expect(
    screen.getByRole("heading", { level: 2, name: "Agreement per week" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAccessibleName(
    /^Agreement per week\. Week of 28 Sep\w* 2026: 100\.0%; Week of 5 Oct 2026: 50\.0%; Week of 12 Oct 2026: no checked answers$/,
  );
  const table = screen.getByRole("table", { name: "Agreement per week" });
  const rows = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => [...r.querySelectorAll("th,td")].map((c) => c.textContent));
  expect(rows).toEqual([
    ["2026-09-28", "100.0%", "1", "1"],
    ["2026-10-05", "50.0%", "3", "6"],
    ["2026-10-12", "No answers", "0", "0"],
  ]);
  // The gap week has no point and the line only joins weeks with data.
  expect(document.querySelectorAll("circle")).toHaveLength(2);
  expect(document.querySelector("path")!.getAttribute("d")).toMatch(
    /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+ $/,
  );
});

it("disputes chart is per 100 written answers and scales to the maximum", () => {
  render(<WeeklyChart weeks={weeks} kind="disputes" />);
  expect(screen.getByRole("img")).toHaveAccessibleName(
    /^Disputes per 100 written answers\. Week of 28 Sep\w* 2026: 0\.0 per 100; Week of 5 Oct 2026: 33\.3 per 100; Week of 12 Oct 2026: no written answers$/,
  );
  // Axis ticks: 0, half, and the ceiling of the maximum rate.
  expect(
    [...document.querySelectorAll("svg text")]
      .slice(0, 3)
      .map((t) => t.textContent),
  ).toEqual(["0", "17", "34"]);
});

it("charts show an empty state instead of an empty svg", () => {
  const empty: Week[] = [
    { day: "2026-10-05", written: 3, checked: 0, agreed: 0, disputes: 1 },
  ];
  render(<WeeklyChart weeks={empty} kind="agreement" />);
  expect(screen.getByText("No checked answers yet")).toBeInTheDocument();
  expect(screen.queryByRole("img")).toBeNull();
  cleanup();
  render(
    <WeeklyChart
      weeks={[{ ...empty[0], written: 0, disputes: 0 }]}
      kind="disputes"
    />,
  );
  expect(screen.getByText("No written answers yet")).toBeInTheDocument();
  expect(screen.queryByRole("img")).toBeNull();
});

it("status mix bar labels each segment with its count and share", () => {
  const mix = [
    { status: "agreed", count: 4 },
    { status: "second_pass", count: 1 },
    { status: "in_review", count: 1 },
    { status: "reviewed", count: 1 },
  ];
  render(<CategoryBar mix={mix} />);
  expect(
    screen.getByRole("heading", { level: 2, name: "Check status mix" }),
  ).toBeInTheDocument();
  expect(screen.getByText("7 checked written answers")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Agreed: 4 (57.1%); Second pass: 1 (14.3%); In review: 1 (14.3%); Reviewed: 1 (14.3%)",
  );
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "Agreed4 · 57.1%",
    "Second pass1 · 14.3%",
    "In review1 · 14.3%",
    "Reviewed1 · 14.3%",
  ]);
  cleanup();
  render(<CategoryBar mix={mix.map((p) => ({ ...p, count: 0 }))} />);
  expect(screen.getByText("No checked answers yet")).toBeInTheDocument();
  expect(screen.queryByRole("img")).toBeNull();
});
