import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { toast } from "sonner";
import { SprintRunner } from "./sprint-runner";
import { type Attempt, type Session } from "@/lib/practice";
import { type PaperConfig } from "@/lib/paper-session";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              select: () => Promise.resolve({ data: [{ id: "a" }] }),
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/app/(focus)/student/papers/[id]/actions", () => ({
  startWriting: vi
    .fn()
    .mockResolvedValue({ writing_started_at: "2026-10-09T00:00:01Z" }),
}));
vi.mock("./session-shell", () => ({
  isTyping: () => false,
  SessionShell: ({
    children,
    booklet,
    onFinish,
    onExit,
  }: {
    children: React.ReactNode;
    booklet: React.ReactNode;
    onFinish: () => void;
    onExit: () => void;
  }) => (
    <div>
      {booklet}
      <button onClick={onExit}>Save and exit</button>
      <button onClick={onFinish}>Finish session</button>
      {children}
    </div>
  ),
}));
vi.mock("./written-answer", () => ({
  WrittenAnswer: ({ disabled }: { disabled: boolean }) => (
    <textarea aria-label="Written answer" disabled={disabled} />
  ),
}));
const config: PaperConfig = {
  time_limit_min: 180,
  reading_min: 5,
  strict: true,
  sections: [
    { position: 24, section: "Section III", choice_group: 1 },
    { position: 25, section: "Section III", choice_group: 1 },
  ],
};
const session = {
  id: "s",
  started_at: "2026-10-09T00:00:00Z",
  elapsed_s: 0,
  config: { time_limit_min: 180 },
} as Session;
const attempt = (id: string, position: number): Attempt => ({
  id,
  position,
  question_id: id,
  status: "pending",
  choice_index: null,
  answer_text: "Draft answer",
  transcript: null,
  image_paths: null,
  flagged: false,
  mark: null,
  max_marks: null,
  band: null,
  feedback: null,
  question: {
    id,
    type: "extended",
    topic_id: "t",
    marks: 20,
    stem: `Stem ${position}`,
    stimulus: null,
    options: null,
    source: "HSC",
    year: 2024,
  },
});
function runner(
  now = Date.parse(session.started_at),
  initial = [attempt("a", 24), attempt("b", 25)],
) {
  return render(
    <SprintRunner
      session={session}
      initial={initial}
      userId="u"
      title="Mock paper"
      paper={{ id: "p", config, serverNow: now }}
    />,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
it("locks written answers during reading and unlocks after Start writing now", async () => {
  runner();
  expect(screen.getByLabelText("Written answer")).toBeDisabled();
  expect(screen.getByText("Reading time · 5:00")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Start writing now" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Written answer")).toBeEnabled(),
  );
});
it("locks MC options in reading time, including keyboard shortcuts", () => {
  const a = attempt("a", 24);
  a.question.type = "mcq";
  a.question.options = ["A", "B", "C", "D"];
  runner(undefined, [a]);
  expect(
    screen.getAllByRole("radio").every((r) => (r as HTMLInputElement).disabled),
  ).toBe(true);
  fireEvent.keyDown(window, { key: "1" });
  expect(
    screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked),
  ).toBe(true);
});
it("shows one booklet chip and section subtotal for two drafted choices", () => {
  runner();
  expect(screen.getByText("24/25")).toBeVisible();
  expect(
    screen.getByText("Section III · 1/1 answered · 20 marks"),
  ).toBeVisible();
  expect(
    screen.getByText("Answer ONE: Question 24 or Question 25"),
  ).toBeVisible();
});
it("forces a finish choice when both questions have drafts", async () => {
  runner(Date.parse(session.started_at) + 300000);
  fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
  expect(await screen.findByText("Which one should we mark?")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Finish and mark" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Question 25" }));
  expect(screen.getByRole("button", { name: "Finish and mark" })).toBeEnabled();
});
it("submits immediately when an expired sit is loaded", async () => {
  const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  runner(Date.parse(session.started_at) + 200 * 60000);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/s/finish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ choices: {} }),
      }),
    ),
  );
  expect(toast).toHaveBeenCalledWith("Time’s up. Submitting your paper now.");
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("counts a single draft as an answered choice without listing its empty alternative", () => {
  const empty = { ...attempt("b", 25), answer_text: null };
  runner(Date.parse(session.started_at) + 300000, [attempt("a", 24), empty]);
  fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
  expect(screen.getByText(/1 of 1 answered/)).toBeVisible();
  expect(screen.queryByText(/Unanswered:/)).toBeNull();
});
it("lists an unanswered choice and a flagged choice once each", () => {
  runner(Date.parse(session.started_at) + 300000, [
    { ...attempt("a", 24), answer_text: null, flagged: true },
    { ...attempt("b", 25), answer_text: null, flagged: true },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
  expect(screen.getByText(/0 of 1 answered/)).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Q24" })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Q25" })).toBeNull();
});
it("waits five seconds before retrying a failed auto-submit and announces expiry once", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ error: "Choose which question we should mark." }),
  });
  vi.stubGlobal("fetch", fetchMock);
  runner(Date.parse(session.started_at) + 200 * 60000);
  await act(async () => {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(toast)
      .mock.calls.filter(
        ([message]) => message === "Time’s up. Submitting your paper now.",
      ),
  ).toHaveLength(1);
});

it("confirms that the paper timer keeps running before save and exit", () => {
  runner();
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(
    "Your timer keeps running.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("does not put the per-second reading countdown in a live region", () => {
  runner();
  expect(
    screen
      .getByText("Reading time · 5:00")
      .closest('[role="status"], [aria-live]'),
  ).toBeNull();
});
