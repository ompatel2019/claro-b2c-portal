import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}));
vi.mock("../actions", () => ({ resolveReview: vi.fn() }));
import { toast } from "sonner";
import type { ReviewRow } from "@/lib/feedback";
import type { Review } from "../data";
import { ReviewEditor } from "./review-editor";
afterEach(cleanup);
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = () => ({ matches: true }) as MediaQueryList;
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  push.mockClear();
  vi.mocked(toast).mockClear();
  vi.mocked(toast.dismiss).mockClear();
});

const text = "Inflation rose because demand grew. Wages lagged behind.";
const row: ReviewRow = {
  attempt_id: "a1",
  position: 0,
  question_id: "q1",
  type: "short",
  marks: 6,
  stem: "Explain inflation.",
  stimulus: null,
  options: null,
  source: "2023 HSC",
  topic_id: null,
  year: null,
  choice_index: null,
  answer_text: text,
  transcript: null,
  image_paths: null,
  flagged: false,
  status: "marked",
  check_status: "in_review",
  mark: 3,
  max_marks: 6,
  band: "Sound",
  feedback: {
    comments: [
      {
        quote: "Inflation rose",
        start: 0,
        kind: "fix",
        tag: "Evidence",
        body: "Give a CPI figure.",
        next_mark: "Quote the 2022 CPI.",
      },
      {
        quote: "demand grew",
        start: 23,
        kind: "strength",
        tag: "Knowledge",
        body: "Correct cause.",
        next_mark: null,
      },
    ],
    justification: "Sound but no data.",
  },
  correct_index: null,
  criteria: [
    { min: 5, max: 6, descriptor: "Thorough" },
    { min: 3, max: 4, descriptor: "Sound" },
  ],
  sample_answer: null,
  explanation: null,
  review: null,
};
const review: Review = {
  id: "r1",
  attempt_id: "a1",
  user_id: "u1",
  status: "open",
  reason: "check_disagreed",
  ai_mark: 3,
  check_mark: 5,
  final_mark: null,
  created_at: "2026-10-08T00:00:00.000Z",
  check_notes: "Two causes given.",
  student_note: null,
  admin_note: null,
  resolved_by: null,
  resolved_at: null,
};
function setup(overrides: Partial<Review> = {}) {
  render(
    <ReviewEditor
      id="r1"
      row={row}
      review={{ ...review, ...overrides }}
      photos={[]}
      prev="prev-id"
      next="next-id"
      guidelineNotes="Reward two causes."
    />,
  );
  return {
    mark: screen.getByRole("spinbutton", { name: "Final mark" }),
    key: (key: string, init: KeyboardEventInit = {}) =>
      fireEvent.keyDown(window, { key, ...init }),
    summary: () => screen.getByText(/^Mark \d+ → \d+/).textContent,
    bodies: () =>
      screen
        .queryAllByLabelText("Comment")
        .map((b) => (b as HTMLTextAreaElement).value),
    // The band shows in the summary card and beside the stepper.
    band: (label: string) =>
      expect(screen.getAllByText(label).length).toBeGreaterThan(0),
  };
}

it("A, C and the arrows set the mark and the band follows", () => {
  const { mark, key, summary, band } = setup();
  expect(mark).toHaveValue(3);
  expect(screen.getByText("Reward two causes.")).toBeTruthy();
  key("c");
  expect(mark).toHaveValue(5);
  band("Band: 5–6 marks");
  expect(screen.getByText("5 / 6")).toBeTruthy();
  key("a");
  expect(mark).toHaveValue(3);
  key("ArrowUp");
  expect(mark).toHaveValue(4);
  band("Band: 3–4 marks");
  key("ArrowDown");
  key("ArrowDown");
  expect(mark).toHaveValue(2);
  band("No band satisfied");
  expect(summary()).toBe("Mark 3 → 2");
  for (let i = 0; i < 3; i++) key("ArrowDown");
  expect(mark).toHaveValue(0);
  expect(screen.getByRole("button", { name: /Decrease mark/ })).toBeDisabled();
});

it("ignores mark and navigation keys while typing, but still undoes and resolves", () => {
  const { mark, key } = setup();
  const note = screen.getByLabelText(/Admin note/);
  note.focus();
  for (const k of ["c", "a", "n", "p", "ArrowUp"])
    fireEvent.keyDown(note, { key: k });
  expect(mark).toHaveValue(3);
  expect(push).not.toHaveBeenCalled();
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => {});
  fireEvent.keyDown(note, { key: "Enter", metaKey: true });
  expect(submit).toHaveBeenCalledWith(
    screen.getByRole("button", { name: "Resolve (⌘/Ctrl+Enter)" }),
  );
  submit.mockRestore();
  key("n");
  expect(push).toHaveBeenCalledWith("/admin/marking/review/next-id");
  key("p");
  expect(push).toHaveBeenCalledWith("/admin/marking/review/prev-id");
  key("Enter", { ctrlKey: true, shiftKey: false });
});

it("summarises edits, deletions and additions; ⌘Z undoes one change at a time", () => {
  const { key, summary } = setup();
  const undo = screen.getByRole("button", { name: /^Undo/ });
  expect(undo).toBeDisabled();
  const [body] = screen.getAllByLabelText("Comment");
  fireEvent.change(body, { target: { value: "Give a CPI figure." } });
  expect(summary()).toBe("Mark 3 → 3");
  fireEvent.change(body, { target: { value: "Give the 2022 CPI figure." } });
  expect(summary()).toBe("Mark 3 → 3 · 1 comment edited");
  fireEvent.click(screen.getByRole("button", { name: "Delete comment 2" }));
  expect(summary()).toBe("Mark 3 → 3 · 1 comment edited · 1 deleted");
  expect(screen.queryByText("Correct cause.")).toBeNull();
  key("z", { metaKey: true });
  expect(summary()).toBe("Mark 3 → 3 · 1 comment edited");
  expect(screen.getByDisplayValue("Correct cause.")).toBeTruthy();
  key("z", { ctrlKey: true });
  expect(summary()).toBe("Mark 3 → 3");
  expect(screen.getByDisplayValue("Give a CPI figure.")).toBeTruthy();
  expect(undo).toBeDisabled();
  const hidden = () =>
    JSON.parse(
      (document.querySelector('input[name="comments"]') as HTMLInputElement)
        .value,
    );
  expect(hidden()).toHaveLength(2);
  const line = screen.getByRole("textbox", {
    name: "What gets you the next mark",
  });
  expect(line).toHaveValue("Quote the 2022 CPI.");
  fireEvent.change(line, { target: { value: "Add a CPI figure." } });
  expect(
    (document.querySelector('input[name="next_mark_line"]') as HTMLInputElement)
      .value,
  ).toBe("Add a CPI figure.");
});

it.each([{ metaKey: true }, { ctrlKey: true }, {}])(
  "undo dismisses the restored comment's delete toast (%j)",
  (modifiers) => {
    const { key, bodies } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
    const [first, second] = vi
      .mocked(toast)
      .mock.calls.map((call) => call[1]!.id);
    expect(first).toBeDefined();
    expect(second).not.toBe(first);
    if (modifiers.metaKey || modifiers.ctrlKey) key("z", modifiers);
    else fireEvent.click(screen.getByRole("button", { name: /^Undo/ }));
    expect(bodies()).toEqual(["Correct cause."]);
    expect(toast.dismiss).toHaveBeenCalledExactlyOnceWith(second);
  },
);

it("the delete toast's Undo restores that comment only, once, keeping later edits", () => {
  const { summary, bodies } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
  expect(bodies()).toEqual(["Correct cause."]);
  // Another change after the delete, plus a second delete with its own toast.
  const line = screen.getByRole("textbox", {
    name: "What gets you the next mark",
  });
  fireEvent.change(line, { target: { value: "Add a CPI figure." } });
  fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
  expect(bodies()).toEqual([]);
  expect(summary()).toBe("Mark 3 → 3 · 2 deleted");
  expect(toast).toHaveBeenCalledTimes(2);
  const [first, second] = vi
    .mocked(toast)
    .mock.calls.map(
      (call) => call[1]!.action as unknown as { onClick: () => void },
    )
    .map((action) => () => act(() => action.onClick()));
  // Undo on the first toast brings back "Give a CPI figure." and nothing else.
  first();
  expect(toast.dismiss).toHaveBeenCalledWith(
    vi.mocked(toast).mock.calls[0][1]!.id,
  );
  expect(bodies()).toEqual(["Give a CPI figure."]);
  expect(summary()).toBe("Mark 3 → 3 · 1 deleted");
  expect(line).toHaveValue("Add a CPI figure.");
  // A second click on the same Undo is a no-op (no duplicate).
  first();
  expect(bodies()).toEqual(["Give a CPI figure."]);
  second();
  expect(bodies()).toEqual(["Give a CPI figure.", "Correct cause."]);
  expect(summary()).toBe("Mark 3 → 3");
  const hidden = JSON.parse(
    (document.querySelector('input[name="comments"]') as HTMLInputElement)
      .value,
  ) as { id: number; body: string }[];
  expect(hidden.map((c) => c.id).sort()).toEqual([0, 1]);
});

it("a resolved review is read-only: no editing, resolving or mark keys", () => {
  const { mark, key } = setup({
    status: "resolved",
    final_mark: 4,
    resolved_at: "2026-10-08T01:00:00.000Z",
  });
  expect(mark).toHaveValue(4);
  expect(mark).toBeDisabled();
  key("c");
  key("ArrowUp");
  expect(mark).toHaveValue(4);
  expect(screen.queryByRole("button", { name: /Resolve/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  expect(screen.queryByLabelText("Comment")).toBeNull();
  expect(screen.getByText("Give a CPI figure.")).toBeTruthy();
  expect(screen.getByLabelText(/Admin note/)).toBeDisabled();
  key("n");
  expect(push).toHaveBeenCalledWith("/admin/marking/review/next-id");
});
