import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BreakdownTable, DisagreedQuestions, percentLabel } from "./tables";

afterEach(cleanup);

it("percentLabel prints one decimal or the given empty wording", () => {
  expect(percentLabel(1, 3)).toBe("33.3%");
  expect(percentLabel(0, 0)).toBe("No checked answers");
  expect(percentLabel(0, 0, "No resolved reviews yet")).toBe(
    "No resolved reviews yet",
  );
});

it("breakdown table shows rates per bucket and words for missing values", () => {
  render(
    <BreakdownTable
      title="By type and marks"
      heading="Type / max marks"
      rows={[
        { id: "1", label: "1", checked: 0, agreed: 0, review: 0, deltas: [] },
        {
          id: "2–3",
          label: "2–3",
          checked: 4,
          agreed: 2,
          review: 1,
          deltas: [1, 2],
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "By type and marks" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Type / max marks", "Checked", "Agreed", "Review", "Mean |Δ|"]);
  const cells = (row: HTMLElement) =>
    [...row.querySelectorAll("th,td")].map((c) => c.textContent);
  const [, one, two] = within(table).getAllByRole("row");
  expect(cells(one)).toEqual([
    "1",
    "0",
    "No checked answers",
    "No checked answers",
    "No resolved marks",
  ]);
  expect(cells(two)).toEqual([
    "2–3",
    "4",
    "50.0%",
    "25.0%",
    "1.50 marks (2 reviews)",
  ]);
  cleanup();
  render(<BreakdownTable title="By topic" heading="Parent topic" rows={[]} />);
  expect(screen.getByText("No data by topic")).toBeInTheDocument();
  expect(screen.queryByRole("table")).toBeNull();
});

it("most disagreed questions link to the editor's Stats tab with a 60-char stem", () => {
  const question = {
    id: "q 1",
    type: "short",
    marks: 4,
    topic_id: null,
    source: "2023 HSC Q21",
    stem: `  ${"A".repeat(40)}\n\n${"B".repeat(40)}`,
  };
  render(
    <DisagreedQuestions rows={[{ question, checked: 4, disagreed: 3 }]} />,
  );
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute(
    "href",
    "/admin/content/questions/q%201?tab=stats",
  );
  expect(link).toHaveTextContent("2023 HSC Q21");
  expect(link.textContent).toContain(`${"A".repeat(40)} ${"B".repeat(18)}…`);
  const [, row] = screen.getAllByRole("row");
  expect(
    within(row)
      .getAllByRole("cell")
      .slice(1)
      .map((c) => c.textContent),
  ).toEqual(["4", "75.0%"]);
  cleanup();
  render(<DisagreedQuestions rows={[]} />);
  expect(
    screen.getByText("No questions with 3 checked answers yet"),
  ).toBeInTheDocument();
});

it("sorts every topic column in both directions, keeping all topics and missing rates last", () => {
  render(
    <BreakdownTable
      title="By topic"
      heading="Parent topic"
      rows={[
        {
          id: "b",
          label: "Beta",
          checked: 4,
          agreed: 1,
          review: 2,
          deltas: [1],
        },
        {
          id: "a",
          label: "Alpha",
          checked: 2,
          agreed: 2,
          review: 0,
          deltas: [4],
        },
        {
          id: "c",
          label: "Gamma",
          checked: 0,
          agreed: 0,
          review: 0,
          deltas: [],
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "By topic" });
  const labels = () =>
    within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0].textContent);
  for (const [header, asc, desc] of [
    ["Parent topic", ["Alpha", "Beta", "Gamma"], ["Gamma", "Beta", "Alpha"]],
    ["Checked", ["Gamma", "Alpha", "Beta"], ["Beta", "Alpha", "Gamma"]],
    ["Agreed", ["Beta", "Alpha", "Gamma"], ["Alpha", "Beta", "Gamma"]],
    ["Review", ["Alpha", "Beta", "Gamma"], ["Beta", "Alpha", "Gamma"]],
    ["Mean |Δ|", ["Beta", "Alpha", "Gamma"], ["Alpha", "Beta", "Gamma"]],
  ] as const) {
    const button = within(table).getByRole("button", { name: header });
    fireEvent.click(button);
    expect(button.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(labels()).toEqual(asc);
    fireEvent.click(button);
    expect(labels()).toEqual(desc);
    fireEvent.click(button);
    expect(labels()).toEqual(["Beta", "Alpha", "Gamma"]);
  }
});
