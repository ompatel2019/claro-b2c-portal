import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DECK_DEFAULTS, type DeckCard, type DeckHistory } from "@/lib/deck";
vi.mock("@/app/(app)/flashcards/actions", () => ({
  startFlashcards: vi.fn(async () => ({})),
}));
import { FlashcardBuilder } from "./flashcard-builder";
const cards: DeckCard[] = [
  {
    id: "a",
    topic_id: "t3-inflation",
    kind: "term",
    owner_id: null,
  },
  {
    id: "b",
    topic_id: "t3-unemployment",
    kind: "stat",
    owner_id: null,
  },
];
const topics = [
  { id: "t3", parent_id: null, name: "Economic Issues", sort: 3 },
  { id: "t3-inflation", parent_id: "t3", name: "Inflation", sort: 1 },
  { id: "t3-unemployment", parent_id: "t3", name: "Unemployment", sort: 2 },
];
const history: DeckHistory = {
  today: "2026-10-09",
  userId: "me",
  progress: [],
};
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("updates counts, remembers a subtopic and clamps a custom size", () => {
  render(<FlashcardBuilder cards={cards} topics={topics} history={history} />);
  expect(screen.getByText("2 of 2 cards")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inflation · 1" }));
  expect(screen.getByText("1 of 1 card")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Inflation · 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Terms (1)" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Stats (0)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Custom deck size" }),
    { target: { value: "999" } },
  );
  const input = screen.getByRole("spinbutton", { name: "Custom deck size" });
  expect(input).toHaveValue(999);
  fireEvent.blur(input);
  expect(input).toHaveValue(200);
  fireEvent.change(input, { target: { value: "" } });
  expect(input).toHaveValue(null);
  fireEvent.change(input, { target: { value: "200" } });
  fireEvent.blur(input);
  expect(
    JSON.parse(localStorage.getItem("claro.flashcards.v1")!),
  ).toMatchObject({ size: 200, subtopics: ["t3-inflation"] });
});
it("restores a zero match config and both EmptyState fixes recover it", () => {
  localStorage.setItem(
    "claro.flashcards.v1",
    JSON.stringify({
      ...DECK_DEFAULTS,
      topics: ["t3"],
      subtopics: ["t3-missing"],
      which: "missed",
    }),
  );
  render(<FlashcardBuilder cards={cards} topics={topics} history={history} />);
  expect(screen.getByText("No cards match")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Include all topics" }));
  expect(screen.getByText("No cards match")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All cards" }));
  expect(screen.queryByText("No cards match")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
});
it("has a disabled own-card choice and detects missing speech input for Test", () => {
  render(<FlashcardBuilder cards={cards} topics={topics} history={history} />);
  expect(screen.getByRole("button", { name: "My cards (0)" })).toBeDisabled();
  expect(
    screen.queryByRole("heading", { name: "Answer by" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Test" }));
  expect(screen.getByRole("button", { name: "Speaking" })).toBeDisabled();
  expect(
    screen.getByText("Speech input is not available in this browser."),
  ).toBeInTheDocument();
  const answers = screen.getByRole("group", { name: "Answer by" });
  expect(
    within(answers).getByRole("button", { name: "Either" }),
  ).toHaveAttribute("aria-pressed", "true");
});
it("keyboard Start ignores typing targets and a zero-card deck", () => {
  localStorage.setItem(
    "claro.flashcards.v1",
    JSON.stringify({ ...DECK_DEFAULTS, source: "my" }),
  );
  render(<FlashcardBuilder cards={cards} topics={topics} history={history} />);
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => {});
  fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "All cards" }));
  fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  fireEvent.keyDown(screen.getByRole("spinbutton"), {
    key: "Enter",
    ctrlKey: true,
  });
  expect(submit).toHaveBeenCalledTimes(1);
  submit.mockRestore();
});

it("starts with no pressed topics and the All chip toggles its parent", () => {
  render(<FlashcardBuilder cards={cards} topics={topics} history={history} />);
  const group = screen.getByRole("group", {
    name: "Economic Issues subtopics",
  });
  const all = within(group).getByRole("button", { name: /^All$/ });
  expect(all).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(all);
  expect(all).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(all);
  expect(all).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(within(group).getByRole("button", { name: "Inflation · 1" }));
  fireEvent.click(within(group).getByRole("button", { name: "Inflation · 1" }));
  expect(all).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText(/All topics · Study/)).toBeInTheDocument();
});
