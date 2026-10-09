import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RunsTable } from "./runs-table";
import { summariseRun, type OfflineEvalRun } from "./summary";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(cleanup);

it.each([
  { items: 223, n: 223 },
  { items: 250, n: 223 },
  { items: 250, n: 0 },
  { items: 0, n: 0 },
])(
  "renders scored counts consistently for $n of $items items",
  ({ items, n }) => {
    const row = {
      ...summariseRun({
        meta: {
          stamp: "2026-10-09-0901",
          label: "test",
          marker: { model: "test-model" },
        },
        items: [],
      }),
      items,
      n,
    };
    render(<RunsTable rows={[row]} />);
    const table = screen.getByRole("table", { name: "Eval runs" });
    const itemsCell = within(table).getAllByRole("cell")[4];
    const cards = screen.getByRole("list", { name: "Eval runs" });
    const itemsMetric = within(cards).getByText("Items").parentElement!;
    for (const container of [itemsCell, itemsMetric]) {
      expect(
        within(container).getByText(String(items), { exact: true }),
      ).toBeInTheDocument();
      const scored = within(container).queryByText(`${n} scored`);
      if (n === items) {
        expect(scored).not.toBeInTheDocument();
      } else {
        expect(scored).toHaveClass("whitespace-nowrap", "block");
        expect(scored).not.toHaveClass("whitespace-normal");
        expect(scored).toHaveAttribute(
          "title",
          `${n} items with valid marks and expectations used for comparison metrics`,
        );
      }
    }
    for (const name of ["Date", "Model", "Thinking", "Passes"]) {
      const header = within(table).getByRole("columnheader", { name });
      expect(header).toHaveClass("text-left");
      expect(within(header).getByRole("button", { name })).toHaveClass(
        "[text-align:inherit]",
      );
    }
  },
);

it("renders unrecorded thinking and sorts it last in both directions", () => {
  const evaluation: OfflineEvalRun = {
    meta: {
      stamp: "2026-10-09-0901",
      label: "without-effort",
      marker: { model: "test-model" },
    },
    items: [{ mark: 1, expected: 1, marks: 5, section: "A1" }],
  };
  const missing = summariseRun(evaluation);
  expect(missing.thinking).toBeUndefined();
  render(
    <RunsTable
      rows={[
        missing,
        { ...missing, id: "low", label: "low-effort", thinking: "low" },
        { ...missing, id: "high", label: "high-effort", thinking: "high" },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "Eval runs" });
  const thinkingCells = () =>
    within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[2].textContent);
  expect(thinkingCells()).toEqual(["Not recorded", "low", "high"]);
  const sort = within(table).getByRole("button", { name: "Thinking" });
  fireEvent.click(sort);
  expect(thinkingCells()).toEqual(["high", "low", "Not recorded"]);
  const cards = screen.getByRole("list", { name: "Eval runs" });
  expect(
    within(cards)
      .getAllByRole("listitem")
      .map(
        (row) => row.textContent?.split("Thinking: ")[1]?.split("Passes:")[0],
      ),
  ).toEqual(["high", "low", "Not recorded"]);
  fireEvent.click(sort);
  expect(thinkingCells()).toEqual(["low", "high", "Not recorded"]);
});

it("summarises every real result file without throwing and renders every run", () => {
  const directory = path.join(process.cwd(), "src/lib/ai/eval/results");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  expect(files).toContain("2026-10-09-0901.json");
  const rows = files.map((file) => {
    const evaluation = JSON.parse(
      readFileSync(path.join(directory, file), "utf8"),
    ) as OfflineEvalRun;
    expect(() => summariseRun(evaluation, file), file).not.toThrow();
    return summariseRun(evaluation, file);
  });
  expect(rows.find((row) => row.label === "baseline-old-engine")).toMatchObject(
    {
      thinking: "low",
    },
  );
  render(<RunsTable rows={rows} />);
  const table = screen.getByRole("table", { name: "Eval runs" });
  const renderedRows = within(table).getAllByRole("row").slice(1);
  expect(renderedRows).toHaveLength(files.length);
  rows.forEach((row, index) => {
    const cells = within(renderedRows[index]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent(row.label);
    expect(cells[2].textContent).toBe(
      row.thinking?.split("/").join("/\u200b") ?? "Not recorded",
    );
  });
});

it("renders all eight mobile metrics and constrains the desktop table to its wrapper", () => {
  const row = summariseRun({
    meta: {
      stamp: "2026-10-09-0901",
      label: "test",
      marker: { model: "test-model" },
    },
    items: [],
  });
  render(<RunsTable rows={[row]} />);
  const list = screen.getByRole("list", { name: "Eval runs" });
  for (const label of [
    "Items",
    "Exact %",
    "Agree %",
    "Mean |Δ|",
    "Total |Δ|",
    "Cost",
    "Time",
    "By",
  ])
    expect(within(list).getByText(label, { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Eval runs" })).toHaveClass(
    "table-fixed",
  );
  expect(screen.getByTestId("runs-region")).toHaveClass("min-w-0");
});

it("selects exactly two stable run ids and opens Compare", () => {
  const base = summariseRun({
    meta: { stamp: "2026-10-09-0901", label: "one", marker: { model: "test" } },
    items: [],
  });
  render(
    <RunsTable
      rows={[
        base,
        { ...base, id: "two", label: "two" },
        { ...base, id: "three", label: "three" },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "Eval runs" });
  const compare = screen.getByRole("button", { name: "Compare" });
  expect(compare).toBeDisabled();
  fireEvent.click(within(table).getByLabelText("Select one (2026-10-09-0901)"));
  expect(compare).toBeDisabled();
  fireEvent.click(within(table).getByLabelText("Select two (two)"));
  expect(within(table).getByLabelText("Select three (three)")).toBeDisabled();
  expect(
    within(screen.getByRole("list", { name: "Eval runs" })).getByLabelText(
      "Select two (two)",
    ),
  ).toBeChecked();
  fireEvent.click(compare);
  expect(push).toHaveBeenCalledWith(
    "/admin/marking/engine?tab=runs&a=2026-10-09-0901&b=two",
  );
  fireEvent.click(within(table).getByLabelText("Select two (two)"));
  expect(compare).toBeDisabled();
  expect(within(table).getByLabelText("Select three (three)")).toBeEnabled();
});
