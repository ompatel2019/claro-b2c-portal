import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RunsTable } from "./runs-table";
import { summariseRun, type OfflineEvalRun } from "./summary";

afterEach(cleanup);

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
