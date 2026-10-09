import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OverallFeedback, ResultsAnswers } from "./results-report";
import type { ReviewRow } from "@/lib/feedback";
vi.mock("./feedback-widget", () => ({
  ReportProblem: () => <button>Report a problem</button>,
}));
vi.mock("./question-mark", () => ({
  QuestionMark: () => <button>Question this mark</button>,
}));
vi.mock("./annotated-feedback", () => ({
  AnnotatedFeedback: ({ row }: { row: ReviewRow }) => (
    <p>Written feedback: {row.status}</p>
  ),
}));
vi.mock("./session-shell", () => ({ isTyping: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);
it("renders stored feedback and deterministic next-step links", () => {
  render(
    <OverallFeedback
      summary={{
        strengths: ["Precise definitions"],
        improvements: ["Add a causal link"],
        next_steps: ["Review inflation"],
      }}
      pending={false}
      actions={[
        {
          label: "Practise Inflation questions",
          href: "/student/sprint?sub=inflation",
        },
      ]}
    />,
  );
  expect(screen.getByText("Precise definitions")).toBeVisible();
  expect(screen.getByText("Add a causal link")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Practise Inflation questions" }),
  ).toHaveAttribute("href", "/student/sprint?sub=inflation");
});
it("renders a section's top fixes and pending summary skeletons", () => {
  const { rerender } = render(
    <OverallFeedback
      section="Section II"
      summary={{ top_fixes: ["Use evidence"] }}
      pending={false}
    />,
  );
  expect(screen.getByText("Section II")).toBeVisible();
  expect(screen.getByText("Use evidence")).toBeVisible();
  rerender(<OverallFeedback summary={null} pending />);
  expect(screen.getByRole("status")).toHaveTextContent("once marking finishes");
  expect(screen.queryByText(/isn’t available/)).not.toBeInTheDocument();
});
it("reuses the MC review and selects the first lost-mark question with original numbering", () => {
  const row = (position: number, mark: number): ReviewRow =>
    ({
      attempt_id: String(position),
      position,
      question_id: null,
      type: "mcq",
      marks: 1,
      max_marks: 1,
      mark,
      status: "marked",
      check_status: "skipped",
      feedback: null,
      stem: `Stem ${position}`,
      stimulus: null,
      options: ["One", "Two"],
      choice_index: 0,
      correct_index: mark ? 0 : 1,
      source: "HSC",
      topic_id: null,
      explanation: "Explanation",
      image_paths: [],
      review: null,
      year: null,
      answer_text: null,
      transcript: null,
      flagged: false,
      band: null,
      criteria: null,
      sample_answer: null,
    }) as ReviewRow;
  render(
    <ResultsAnswers
      rows={[row(1, 1), row(24, 0)]}
      id="sit"
      name={() => ""}
      photos={new Map()}
    />,
  );
  expect(screen.getByText("Question 24")).toBeVisible();
  expect(screen.getByText("Stem 24")).toBeVisible();
  expect(screen.getByText(/Your answer: A/)).toBeVisible();
  expect(
    screen.getByText("Explanation", { selector: "summary" }),
  ).toBeVisible();
});

it("uses real section headings and context-specific unavailable copy without skeletons", () => {
  const { container } = render(
    <OverallFeedback summary={null} pending={false} context="paper" />,
  );
  expect(
    screen.getByRole("heading", { level: 2, name: "Overall feedback" }),
  ).toBeVisible();
  expect(screen.getByText(/isn’t available for this paper/)).toBeVisible();
  expect(container.querySelector(".animate-pulse")).toBeNull();
});
