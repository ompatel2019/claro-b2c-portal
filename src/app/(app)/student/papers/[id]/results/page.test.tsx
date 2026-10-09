import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PaperResults from "./page";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  storage: vi.fn(),
  data: {} as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "student" }),
}));
vi.mock("@/lib/flashcard-data", () => ({
  pages: async (
    query: (from: number, to: number) => Promise<{ data: unknown[] }>,
  ) => (await query(0, 499)).data,
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrls: mocks.storage }) },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/feedback-widget", () => ({ ReportProblem: () => null }));
vi.mock("@/components/question-mark", () => ({ QuestionMark: () => null }));
vi.mock("@/components/annotated-feedback", () => ({
  AnnotatedFeedback: () => <p>Written feedback</p>,
}));
vi.mock("@/components/session-shell", () => ({ isTyping: () => false }));
const config = {
  time_limit_min: 180,
  reading_min: 5,
  strict: true,
  sections: [
    { position: 24, section: "Section III", choice_group: 1 },
    { position: 25, section: "Section III", choice_group: 1 },
  ],
};
const one = {
  id: "one",
  started_at: "2026-10-09T00:00:00Z",
  finished_at: "2026-10-09T03:00:00Z",
  config,
  score: 14,
  max_score: 20,
  elapsed_s: 100,
  summary: null,
};
const two = {
  ...one,
  id: "two",
  started_at: "2026-10-12T00:00:00Z",
  finished_at: "2026-10-12T03:00:00Z",
};
const props = (sit?: string) => ({
  params: Promise.resolve({ id: "paper" }),
  searchParams: Promise.resolve(sit ? { sit } : {}),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = {
    papers: { id: "paper", title: "Economics trial", ranks_enabled: false },
    sessions: [one, two],
    topics: [],
    flashcards: [],
  };
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "range", "maybeSingle"])
      query[method] = () => query;
    query.then = (resolve: (data: unknown) => unknown) =>
      Promise.resolve(resolve({ data: mocks.data[table], error: null }));
    return query;
  });
  mocks.rpc.mockImplementation((name: string) =>
    Promise.resolve({
      data:
        name === "paper_rank"
          ? [{ percentile: 70, cohort: 84 }]
          : [
              {
                attempt_id: "24",
                position: 24,
                type: "extended",
                stem: "Chosen stem",
                marks: 20,
                max_marks: 20,
                mark: 14,
                status: "marked",
                check_status: "agreed",
                feedback: {},
                source: "Trial",
              },
              {
                attempt_id: "25",
                position: 25,
                type: "extended",
                stem: "Hidden stem",
                marks: 20,
                max_marks: 0,
                mark: 0,
                status: "skipped",
                check_status: "pending",
                source: "Trial",
              },
            ],
      error: null,
    }),
  );
});
afterEach(cleanup);
it("defaults to the latest finished sit, hides unchosen questions and shows settled null summaries as unavailable", async () => {
  render(await PaperResults(props()));
  expect(mocks.rpc).toHaveBeenCalledWith("session_review", {
    p_session: "two",
  });
  expect(mocks.rpc).not.toHaveBeenCalledWith("paper_rank", expect.anything());
  expect(
    screen.getByRole("heading", { name: "Economics trial" }),
  ).toBeVisible();
  expect(
    screen.getByText(/Sit 2 · Mon 12 Oct/, { selector: "p" }),
  ).toBeVisible();
  expect(screen.getByText("Not chosen: Q25")).toBeVisible();
  expect(screen.queryByText("Hidden stem")).not.toBeInTheDocument();
  expect(screen.getByText(/isn’t available for this paper/)).toBeVisible();
  expect(screen.queryByText("Your first sit rank")).not.toBeInTheDocument();
});
it("renders a rank only on the first sit and displays stored feedback per section", async () => {
  mocks.data.papers = {
    id: "paper",
    title: "Economics trial",
    ranks_enabled: true,
  };
  mocks.data.sessions = [
    {
      ...one,
      summary: {
        sections: {
          "Section III": {
            strengths: ["Clear argument"],
            top_fixes: ["Add data"],
            next_steps: ["Practise evaluation"],
          },
        },
      },
    },
    two,
  ];
  render(await PaperResults(props("one")));
  expect(mocks.rpc).toHaveBeenCalledWith("paper_rank", { p_paper: "paper" });
  expect(screen.getByText("Top 30% of first sits (n = 84)")).toBeVisible();
  expect(screen.getByText("Clear argument")).toBeVisible();
  expect(screen.getByText("Add data")).toBeVisible();
  expect(screen.getByText("Practise evaluation")).toBeVisible();
});
it("rejects unknown or other-student sits and redirects unfinished sits", async () => {
  await expect(PaperResults(props("someone-elses-sit"))).rejects.toThrow("404");
  mocks.data.sessions = [{ ...one, finished_at: null }];
  await expect(PaperResults(props("one"))).rejects.toThrow(
    "redirect:/student/papers/paper",
  );
  await expect(PaperResults(props())).rejects.toThrow(
    "redirect:/student/papers/paper",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("renders nothing when an enabled rank RPC returns no row", async () => {
  mocks.data.papers = {
    id: "paper",
    title: "Economics trial",
    ranks_enabled: true,
  };
  const rpc = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name: string, ...args: unknown[]) =>
    name === "paper_rank"
      ? Promise.resolve({ data: [], error: null })
      : rpc(name, ...args),
  );
  render(await PaperResults(props("one")));
  expect(screen.queryByText("Your first sit rank")).not.toBeInTheDocument();
});
it("compares score and time with the previous finished sit from loaded history", async () => {
  mocks.data.sessions = [one, { ...two, score: 16, elapsed_s: 220 }];
  render(await PaperResults(props()));
  expect(screen.getByText("+10 pts vs your previous sit")).toBeVisible();
  expect(screen.getByText("+2 min vs your previous sit")).toBeVisible();
});
it("keeps a null summary pending only while answers are marking", async () => {
  mocks.rpc.mockResolvedValue({
    data: [
      {
        attempt_id: "24",
        position: 24,
        type: "extended",
        stem: "Waiting",
        marks: 20,
        status: "marking",
        check_status: "pending",
        source: "Trial",
      },
    ],
    error: null,
  });
  render(await PaperResults(props()));
  expect(screen.getByText(/once marking finishes/)).toBeVisible();
  expect(screen.queryByText(/isn’t available/)).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole("status")
      .some((s) => s.textContent?.includes("1 still marking")),
  ).toBe(true);
});
