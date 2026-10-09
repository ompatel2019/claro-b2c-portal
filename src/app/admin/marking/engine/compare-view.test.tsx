import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CompareView } from "./compare-view";
import { compareRuns, type CompareRun } from "./compare";
const details = vi.hoisted(() => vi.fn());
vi.mock("./compare-actions", () => ({ compareDetails: details }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const run = (marks: number[]): CompareRun => ({
  meta: { stamp: "test", label: "test", marker: { model: "test" } },
  items: marks.map((mark, index) => ({
    id: `q${index}`,
    section: "A1",
    mark,
    expected: 2,
    marks: 5,
  })),
});
const data = {
  ...compareRuns(run([2, 1]), run([2, 2])),
  idA: "a",
  idB: "b",
  labelA: "first",
  labelB: "second",
};
it("filters differing rows in the table and cards; lazily expands feedback and caches it", async () => {
  details.mockResolvedValue({
    answer: "Anonymised answer",
    notes: "Tutor notes",
    feedbackA: "First line\nSecond line",
    feedbackB: "Other feedback",
  });
  render(<CompareView data={data} />);
  expect(details).not.toHaveBeenCalled();
  const table = screen.getByRole("table", { name: "Compared items" });
  const cards = screen.getByRole("list", { name: "Compared items" });
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
  fireEvent.click(screen.getByLabelText("Only rows where runs differ"));
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(within(cards).getAllByRole("listitem")).toHaveLength(1);
  const expand = within(table).getByRole("button", { name: /Expand A1 q1/ });
  fireEvent.click(expand);
  expect(expand).toHaveAttribute("aria-expanded", "true");
  await waitFor(() =>
    expect(within(table).getByText("Run A feedback")).toBeInTheDocument(),
  );
  expect(within(table).getByText("Run B feedback")).toBeInTheDocument();
  expect(within(table).getAllByText("Anonymised answer")).toHaveLength(2);
  expect(within(table).getByText("Karan's feedback notes")).toBeInTheDocument();
  expect(within(table).getByText("First line Second line")).toHaveClass(
    "whitespace-pre-wrap",
  );
  expect(details).toHaveBeenCalledWith("a", "b", data.rows[1].key);
  fireEvent.click(expand);
  expect(within(table).queryByText("Run A feedback")).not.toBeInTheDocument();
  fireEvent.click(expand);
  expect(details).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByLabelText("Only rows where runs differ"));
  expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Back to runs" })).toHaveAttribute(
    "href",
    "/admin/marking/engine?tab=runs",
  );
});
it("offers retry after detail read failure and omits absent notes", async () => {
  details
    .mockRejectedValueOnce(new Error("failed"))
    .mockResolvedValueOnce({ feedbackA: "a", feedbackB: "b" });
  render(<CompareView data={data} />);
  const cards = screen.getByRole("list", { name: "Compared items" });
  const expand = within(cards).getByRole("button", { name: /Expand A1 q0/ });
  fireEvent.click(expand);
  await waitFor(() =>
    expect(within(cards).getByText(/Could not load/)).toBeInTheDocument(),
  );
  fireEvent.click(expand);
  fireEvent.click(expand);
  await waitFor(() =>
    expect(within(cards).getByText("Run A feedback")).toBeInTheDocument(),
  );
  expect(
    within(cards).queryByText("Karan's feedback notes"),
  ).not.toBeInTheDocument();
});

it("renders saved annotated comments over each run's answer read-only", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  details.mockResolvedValue({
    answerA: "Trade expands",
    answerB: "Demand grows",
    markA: 2,
    markB: 3,
    marksA: 5,
    marksB: 5,
    commentsA: [
      {
        kind: "strength",
        quote: "Trade",
        start: 0,
        tag: "Knowledge",
        body: "A saved comment",
        next_mark: null,
      },
    ],
    commentsB: [
      {
        kind: "fix",
        quote: "Demand",
        start: 0,
        tag: "Analysis",
        body: "B saved comment",
        next_mark: "Explain why",
      },
    ],
    feedbackA: "unused rendered A",
    feedbackB: "unused rendered B",
  });
  render(<CompareView data={data} />);
  const table = screen.getByRole("table", { name: "Compared items" });
  fireEvent.click(within(table).getByRole("button", { name: /Expand A1 q0/ }));
  await waitFor(() =>
    expect(
      within(table).getByRole("button", {
        name: /Strength 1.*A saved comment/,
      }),
    ).toBeInTheDocument(),
  );
  expect(
    within(table).getByRole("button", { name: /Fix 1.*B saved comment/ }),
  ).toBeInTheDocument();
  expect(
    within(table).queryByText("unused rendered A"),
  ).not.toBeInTheDocument();
  expect(within(table).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(table).queryByText("Retry")).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});
it("shows the legacy identity warning and rendered feedback without exposing an answer", async () => {
  details.mockResolvedValue({
    answerWarningA: "Answer not shown: legacy run without a stable answer id",
    answerWarningB: "Answer not shown: legacy run without a stable answer id",
    feedbackA: "Legacy A",
    feedbackB: "Legacy B",
  });
  render(<CompareView data={data} />);
  const cards = screen.getByRole("list", { name: "Compared items" });
  fireEvent.click(within(cards).getByRole("button", { name: /Expand A1 q0/ }));
  await waitFor(() =>
    expect(
      within(cards).getAllByText(
        "Answer not shown: legacy run without a stable answer id",
      ),
    ).toHaveLength(2),
  );
  expect(within(cards).getByText("Legacy A")).toBeInTheDocument();
  expect(within(cards).getByText("Legacy B")).toBeInTheDocument();
});
