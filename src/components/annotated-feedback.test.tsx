import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";
import type { ReviewRow } from "@/lib/feedback";
import { AnnotatedFeedback, type FeedbackEdit } from "./annotated-feedback";
import { McReview } from "./mc-review";
afterEach(cleanup);
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = () => ({ matches: true }) as MediaQueryList;
  Element.prototype.scrollIntoView = vi.fn();
});

const text = "Inflation rose because demand grew. Wages lagg[?] behind.";
const row: ReviewRow = {
  attempt_id: "a1",
  position: 1,
  question_id: "q1",
  type: "short",
  marks: 6,
  stem: "Explain inflation.",
  stimulus: null,
  options: null,
  source: "2023 HSC",
  topic_id: "macro",
  year: 2023,
  choice_index: null,
  answer_text: text,
  transcript: null,
  image_paths: null,
  flagged: false,
  status: "marked",
  check_status: "agreed",
  mark: 3,
  max_marks: 6,
  band: "Sound",
  feedback: {
    comments: [
      {
        quote: "demand grew",
        start: 23,
        kind: "strength",
        tag: "Knowledge",
        body: "Correct cause.",
        next_mark: null,
      },
      {
        quote: "Inflation rose",
        start: 0,
        kind: "fix",
        tag: "Evidence",
        body: "Give a CPI figure.",
        next_mark: "Quote the 2022 CPI.",
      },
      {
        quote: "",
        start: null,
        kind: "fix",
        tag: "Structure",
        body: "Add a conclusion.",
        next_mark: null,
      },
    ],
  },
  correct_index: null,
  criteria: [
    { min: 5, max: 6, descriptor: "Thorough" },
    { min: 3, max: 4, descriptor: "Sound" },
  ],
  sample_answer: "Model text.",
  explanation: null,
  review: null,
};

it("shows the summary, numbered highlights and an Overall group", () => {
  render(<AnnotatedFeedback row={row} />);
  expect(screen.getByText("3 / 6")).toBeTruthy();
  expect(screen.getByText("Band: 3–4 marks")).toBeTruthy();
  expect(screen.getByText("Marked")).toBeTruthy();
  expect(screen.getAllByText("Quote the 2022 CPI.")).toHaveLength(2);
  const fix = screen.getByRole("button", {
    name: "Fix 1, Evidence: Give a CPI figure.",
  });
  expect(fix.textContent).toBe("Inflation rose");
  screen.getByRole("button", { name: "Strength 2, Knowledge: Correct cause." });
  expect(screen.getByText("Overall")).toBeTruthy();
  expect(
    screen.getByTitle("Hard to read. Not counted against you.").textContent,
  ).toBe("lagg[?]");
});

it("filters to strengths and moves through comments with J", () => {
  render(<AnnotatedFeedback row={row} />);
  fireEvent.click(screen.getByRole("button", { name: "Strengths (1)" }));
  expect(screen.queryByRole("button", { name: /^Fix 1/ })).toBeNull();
  expect(screen.queryByText("Overall")).toBeNull();
  fireEvent.keyDown(screen.getByText("Strengths"), { key: "j" });
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /^Strength 2/,
  );
});

it("opens the comment in a popover when a highlight is tapped on narrow screens", async () => {
  render(<AnnotatedFeedback row={row} />);
  expect(screen.getAllByText("Give a CPI figure.")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /^Fix 1/ }));
  expect(await screen.findAllByText("Give a CPI figure.")).toHaveLength(2);
});

it("reads old-shape comments without tags", () => {
  render(
    <AnnotatedFeedback
      row={{
        ...row,
        feedback: {
          comments: [
            {
              quote: "demand grew",
              start: 23,
              line: 1,
              type: "improvement",
              comment: "Say why.",
            },
          ],
        },
      }}
    />,
  );
  screen.getByRole("button", { name: "Fix 1: Say why." });
});

it("hides the mark while marking and pills each review state", () => {
  const { rerender } = render(
    <AnnotatedFeedback row={{ ...row, status: "marking" }} />,
  );
  expect(screen.queryByText("3 / 6")).toBeNull();
  screen.getByText("Marking");
  const review = {
    status: "open",
    ai_mark: 3,
    check_mark: 4,
    final_mark: null,
  } as const;
  rerender(
    <AnnotatedFeedback
      row={{
        ...row,
        check_status: "in_review",
        review: { ...review, reason: "check_disagreed" },
      }}
    />,
  );
  screen.getByText("3–4 / 6");
  screen.getByText("Provisional");
  rerender(
    <AnnotatedFeedback
      row={{
        ...row,
        check_status: "in_review",
        review: { ...review, reason: "student_dispute" },
      }}
    />,
  );
  screen.getByText("Being double-checked");
  rerender(<AnnotatedFeedback row={{ ...row, check_status: "reviewed" }} />);
  screen.getByText("Checked by our team");
  rerender(<AnnotatedFeedback row={{ ...row, status: "failed" }} />);
  screen.getByRole("alert");
  screen.getByRole("button", { name: "Retry" });
});

it("edit mode makes comments and the next-mark line editable; read-only view has no fields", () => {
  const { rerender } = render(<AnnotatedFeedback row={row} />);
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /^Delete comment/ })).toBeNull();
  screen.getByRole("link", { name: "Practise similar" });
  const edit: FeedbackEdit = {
    comments: [
      {
        id: 1,
        quote: "Inflation rose",
        start: 0,
        kind: "fix",
        tag: "Evidence",
        body: "Give a CPI figure.",
        next_mark: "Quote the 2022 CPI.",
      },
      {
        id: 0,
        quote: "demand grew",
        start: 23,
        kind: "strength",
        tag: "Knowledge",
        body: "Correct cause.",
        next_mark: null,
      },
    ],
    nextMark: "Quote the 2022 CPI.",
    onChange: vi.fn(),
    onUndo: vi.fn(),
  };
  rerender(<AnnotatedFeedback row={row} edit={edit} />);
  expect(screen.queryByRole("link", { name: "Practise similar" })).toBeNull();
  // Numbered by position, not by id.
  screen.getByRole("button", { name: "Fix 1, Evidence: Give a CPI figure." });
  const bodies = screen.getAllByLabelText("Comment");
  expect(bodies.map((b) => (b as HTMLTextAreaElement).value)).toEqual([
    "Give a CPI figure.",
    "Correct cause.",
  ]);
  fireEvent.change(bodies[1], { target: { value: "Correct, clear cause." } });
  // The edited entry also carries the display number `n` (see review notes).
  expect(edit.onChange).toHaveBeenLastCalledWith(
    [
      edit.comments[0],
      expect.objectContaining({
        ...edit.comments[1],
        body: "Correct, clear cause.",
      }),
    ],
    "Quote the 2022 CPI.",
  );
  fireEvent.change(screen.getAllByLabelText("Kind")[0], {
    target: { value: "strength" },
  });
  expect(edit.onChange).toHaveBeenLastCalledWith(
    [
      expect.objectContaining({
        ...edit.comments[0],
        kind: "strength",
        next_mark: null,
      }),
      edit.comments[1],
    ],
    "Quote the 2022 CPI.",
  );
  // Delete buttons are labelled by display number so screen readers can tell them apart.
  fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
  expect(edit.onChange).toHaveBeenLastCalledWith(
    [edit.comments[1]],
    "Quote the 2022 CPI.",
  );
  const [title, options] = vi.mocked(toast).mock.calls[0];
  expect(title).toBe("Comment deleted");
  (options!.action as { onClick: (e?: unknown) => void }).onClick();
  // The toast's Undo hands back exactly the deleted comment (no display number).
  expect(edit.onUndo).toHaveBeenCalledWith(edit.comments[0]);
  expect(edit.onUndo).toHaveBeenCalledTimes(1);
  expect(vi.mocked(edit.onUndo).mock.calls[0][0]).not.toHaveProperty("n");
  fireEvent.change(
    screen.getByRole("textbox", { name: "What gets you the next mark" }),
    { target: { value: "Cite CPI." } },
  );
  expect(edit.onChange).toHaveBeenLastCalledWith(edit.comments, "Cite CPI.");
  const removeAllRanges = vi.fn();
  window.getSelection = () => ({ removeAllRanges }) as unknown as Selection;
  fireEvent.keyDown(window, { key: "Escape" });
  expect(removeAllRanges).toHaveBeenCalled();
});

const mc: ReviewRow = {
  ...row,
  type: "mcq",
  options: ["One", "Two", "Three", "Four"],
  correct_index: 2,
  choice_index: 1,
  explanation: "Because three.",
};

it("shows the MC answer line with the explanation open when wrong", () => {
  const { container, rerender } = render(<McReview row={mc} />);
  screen.getByText("Your answer: B · Correct: C");
  expect(container.querySelector("details")?.open).toBe(true);
  rerender(<McReview row={{ ...mc, choice_index: 2 }} />);
  expect(container.querySelector("details")?.open).toBe(false);
  rerender(<McReview row={{ ...mc, choice_index: null }} />);
  screen.getByText("Not answered · Correct: C");
});
