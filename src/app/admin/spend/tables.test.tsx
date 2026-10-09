import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ModelTable, TaskTable, StudentTable } from "./tables";
import { usd, avgUsd } from "./helpers";

afterEach(cleanup);
it("money has two decimal places, with four for small call averages", () => {
  expect(usd(0)).toBe("$0.00");
  expect(usd(1.234)).toBe("$1.23");
  expect(avgUsd(0.00123)).toBe("$0.0012");
  expect(avgUsd(0.01)).toBe("$0.01");
});
it("model columns sort in both directions and token columns stay hidden in narrow model cards", () => {
  render(
    <ModelTable
      rows={[
        {
          model: "Beta",
          calls: 2,
          input_tokens: 100,
          cached_tokens: 50,
          output_tokens: 10,
          usd: 0.2,
        },
        {
          model: "Alpha",
          calls: 1,
          input_tokens: 20,
          cached_tokens: 0,
          output_tokens: 1,
          usd: 0.1,
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "By model" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Model", "Calls", "Input", "Cached", "Output tokens", "USD"]);
  for (const header of [
    "Model",
    "Calls",
    "Input",
    "Cached",
    "Output tokens",
    "USD",
  ]) {
    const button = within(table).getByRole("button", {
      name: header,
    });
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Alpha");
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Beta");
    fireEvent.click(button);
  }
  expect(
    within(table).getByRole("columnheader", { name: "Input" }),
  ).toHaveClass("hidden", "@min-[640px]:table-cell");
});
it("task subtotals precede their own sortable tasks, including Other and no-call wording", () => {
  render(
    <TaskTable
      groups={[
        {
          name: "Marking",
          calls: 3,
          usd: 0.202,
          avgPerCall: 0.202 / 3,
          tasks: [
            { task: "mark_written", calls: 1, usd: 0.002, avgPerCall: 0.002 },
            { task: "summary", calls: 2, usd: 0.2, avgPerCall: 0.1 },
          ],
        },
        {
          name: "Admin and evals",
          calls: 0,
          usd: 0,
          avgPerCall: null,
          tasks: [],
        },
        {
          name: "Other",
          calls: 2,
          usd: 0.2,
          avgPerCall: 0.1,
          tasks: [{ task: "other_task", calls: 2, usd: 0.2, avgPerCall: 0.1 }],
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "By task" });
  expect(screen.getAllByRole("table")).toHaveLength(1);
  const rowLabels = () =>
    within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.querySelector("th, td")?.textContent);
  expect(rowLabels()).toEqual([
    "Marking only",
    "mark_written",
    "summary",
    "Admin and evals",
    "Other",
    "other_task",
  ]);
  expect(within(table).getByText("No calls")).toBeInTheDocument();
  expect(within(table).getAllByText("$0.0020")).toHaveLength(1);
  for (const header of ["Task", "Calls", "USD", "Avg per call"]) {
    const button = within(table).getByRole("button", { name: header });
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(rowLabels()).toEqual([
      "Marking only",
      "mark_written",
      "summary",
      "Admin and evals",
      "Other",
      "other_task",
    ]);
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(rowLabels()).toEqual([
      "Marking only",
      "summary",
      "mark_written",
      "Admin and evals",
      "Other",
      "other_task",
    ]);
    fireEvent.click(button);
  }
});
it("student names link to detail, with formatted costs and percentages", () => {
  render(
    <StudentTable
      rows={[
        {
          id: "Student A",
          name: "Student A",
          calls: 3,
          usd: 1.23,
          percent: 25,
        },
      ]}
    />,
  );
  expect(screen.getByRole("link", { name: "Student A" })).toHaveAttribute(
    "href",
    "/admin/students/Student%20A",
  );
  expect(screen.getByText("$1.23")).toBeInTheDocument();
  expect(screen.getByText("25.0%")).toBeInTheDocument();
  for (const button of screen.getAllByRole("button")) {
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "descending");
  }
});
it("each empty table gets words instead of a blank table", () => {
  render(
    <>
      <ModelTable rows={[]} />
      <TaskTable groups={[]} />
      <StudentTable rows={[]} />
    </>,
  );
  expect(screen.queryByRole("table")).toBeNull();
  for (const title of [
    "No model spend yet",
    "No task spend yet",
    "No student spend in the last 30 days",
  ])
    expect(screen.getByText(title)).toBeInTheDocument();
});
