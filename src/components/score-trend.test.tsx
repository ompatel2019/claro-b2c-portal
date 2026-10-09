import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ScoreTrend } from "./score-trend";
import type { Marked } from "@/lib/home";

afterEach(cleanup);
const rows: Marked[] = ["2026-10-01", "2026-10-05", "2026-10-09"].map(
  (day) => ({ day, type: "mcq", mark: 1, max: 2 }),
);

it("labels the percentage and date axes accessibly", () => {
  render(<ScoreTrend rows={rows} today="2026-10-09" />);
  expect(screen.getByTitle("Score trend, 30 days")).toBeInTheDocument();
  for (const label of ["0%", "50%", "100%", "10 Sept 2026", "9 Oct 2026"])
    expect(screen.getByText(label, { selector: "text" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "2026-10-01: 50%" })).toHaveAttribute(
    "href",
    "/activity?date=2026-10-01",
  );
});

it.each([0, 1, 2])(
  "shows a simple state instead of a line for %i points",
  (count) => {
    const { container } = render(
      <ScoreTrend rows={rows.slice(0, count)} today="2026-10-09" />,
    );
    expect(container.querySelector("svg[aria-labelledby]")).toBeNull();
    expect(
      screen.getByText(
        count
          ? "Mark work on at least 3 days to see a trend."
          : "No marked work in this range.",
      ),
    ).toBeVisible();
    expect(screen.queryAllByRole("link")).toHaveLength(count);
  },
);

it("keeps the previous-period line with two points", () => {
  render(
    <ScoreTrend
      rows={[
        ...rows,
        { day: "2026-09-01", type: "mcq", mark: 1, max: 2 },
        { day: "2026-09-05", type: "mcq", mark: 1, max: 2 },
      ]}
      today="2026-10-09"
    />,
  );
  expect(screen.getByTestId("previous-period")).toBeInTheDocument();
});
