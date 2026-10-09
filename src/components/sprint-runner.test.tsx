import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Attempt, Session } from "@/lib/practice";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  update: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  ensureSession: vi.fn(),
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: mocks.update,
      eq() {
        return this;
      },
      is: async () => ({ error: null }),
      in() {
        return this;
      },
      select: async () => ({ data: [{ id: "a" }], error: null }),
    }),
  }),
}));
vi.mock("./session-shell", () => ({
  isTyping: () => false,
  SessionShell: ({
    booklet,
    children,
    onExit,
  }: {
    booklet: React.ReactNode;
    children: React.ReactNode;
    onExit: () => void;
  }) => (
    <>
      <button onClick={onExit}>Save and exit</button>
      {booklet}
      {children}
    </>
  ),
}));
import { SprintRunner } from "./sprint-runner";
const session = {
  id: "s",
  kind: "sprint",
  config: { mode: "mcq", feedback: "each" },
  elapsed_s: 0,
} as Session;
const attempt = {
  id: "a",
  question_id: "q",
  position: 1,
  status: "pending",
  choice_index: 0,
  question: {
    id: "q",
    type: "mcq",
    marks: 1,
    stem: "What is inflation?",
    options: ["Price increases", "Price decreases"],
    topic_id: "t",
    source: "HSC",
  },
} as Attempt;
function show() {
  mocks.update.mockReturnThis();
  return render(
    <SprintRunner
      session={session}
      initial={[attempt]}
      userId="u"
      title="Sprint"
    />,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("checks an MC sprint answer and renders its feedback", async () => {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      status: "marked",
      mark: 1,
      max_marks: 1,
      feedback: { correct_index: 0 },
      explanation: "Prices rise.",
    }),
  });
  vi.stubGlobal("fetch", mocks.fetch);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(await screen.findByText("Correct")).toBeVisible();
  expect(screen.getByText("Prices rise.")).toBeVisible();
  expect(mocks.fetch).toHaveBeenCalledWith(
    "/api/attempts/a/mark",
    expect.objectContaining({ method: "POST" }),
  );
});
it("persists sprint time on save and exit, and keeps the finish confirmation", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(
    await screen.findByRole("dialog", { name: "Finish and mark?" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/student"));
  expect(mocks.update).toHaveBeenCalledWith({ elapsed_s: 0 });
});
