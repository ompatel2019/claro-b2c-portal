import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ResultsBrowser, SitSelect } from "./results-browser";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./session-shell", () => ({
  isTyping: (target: HTMLElement) => target.tagName === "INPUT",
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
const items = [1, 24, 26].map((position) => ({
  position,
  type: "Short answer",
  topic: "Inflation",
  source: "HSC",
  mark: "2 / 4",
  tone: "",
  pill: null,
}));
const views = [1, 24, 26].map((p) => <p key={p}>Answer to Q{p}</p>);
it("preserves paper numbering and opens a question from the MC grid", () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(
    <ResultsBrowser
      items={items}
      views={views}
      initial={1}
      mcGrid={[{ position: 1, your: "B", correct: "C", right: false }]}
    />,
  );
  expect(screen.getByText("Answer to Q24")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Question 26, 2 / 4 marks" }),
  ).toBeVisible();
  expect(screen.getByText("Incorrect")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Review question 1" }));
  expect(screen.getByText("Answer to Q1")).toBeVisible();
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});
it("supports table selection and keyboard question navigation while ignoring typing", () => {
  render(
    <>
      <input aria-label="Note" />
      <ResultsBrowser items={items} views={views} initial={0} />
    </>,
  );
  fireEvent.keyDown(screen.getByLabelText("Note"), { key: "k" });
  expect(screen.getByText("Answer to Q1")).toBeVisible();
  fireEvent.keyDown(window, { key: "k" });
  expect(screen.getByText("Answer to Q24")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Question 26, 2 / 4 marks" }),
  );
  expect(screen.getByText("Answer to Q26")).toBeVisible();
});
it("switches sits using the paper URL and shows the current sit label", async () => {
  render(
    <SitSelect
      paperId="paper"
      value="two"
      sits={[
        { id: "one", label: "Sit 1 · Fri 9 Oct" },
        { id: "two", label: "Sit 2 · Mon 12 Oct" },
      ]}
    />,
  );
  expect(
    screen.getByRole("combobox", { name: "Switch sit" }),
  ).toHaveTextContent("Sit 2 · Mon 12 Oct");
  fireEvent.click(screen.getByRole("combobox", { name: "Switch sit" }));
  const option = await screen.findByRole("option", {
    name: "Sit 1 · Fri 9 Oct",
  });
  fireEvent.mouseMove(option);
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  expect(push).toHaveBeenCalledWith("/student/papers/paper/results?sit=one");
});

it("ignores consumed keys and keys within comment navigation", () => {
  render(
    <ResultsBrowser
      items={items}
      initial={0}
      views={[
        <div key="comment" data-comment-navigation>
          <button>Comment</button>
        </div>,
        ...views.slice(1),
      ]}
    />,
  );
  const consumed = new KeyboardEvent("keydown", { key: "k", cancelable: true });
  consumed.preventDefault();
  fireEvent(window, consumed);
  expect(screen.getByText("Comment")).toBeVisible();
  fireEvent.keyDown(screen.getByText("Comment"), { key: "k" });
  expect(screen.getByText("Comment")).toBeVisible();
  fireEvent.keyDown(window, { key: "k" });
  expect(screen.getByText("Answer to Q24")).toBeVisible();
});

it("opens the questioned mark from a report hash and responds to hash changes", async () => {
  window.history.replaceState(null, "", "/student/sprint/sit/results#q-26");
  render(<ResultsBrowser items={items} views={views} initial={0} />);
  expect(await screen.findByText("Answer to Q26")).toBeVisible();
  window.history.replaceState(null, "", "#q-24");
  fireEvent(window, new Event("hashchange"));
  expect(screen.getByText("Answer to Q24")).toBeVisible();
  window.history.replaceState(null, "", "#q-999");
  fireEvent(window, new Event("hashchange"));
  expect(screen.getByText("Answer to Q24")).toBeVisible();
});
