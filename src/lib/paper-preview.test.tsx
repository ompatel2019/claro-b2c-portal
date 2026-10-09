import { beforeEach, expect, it, vi } from "vitest";
import Papers from "@/app/(app)/student/papers/page";
import PaperPage from "@/app/(focus)/student/papers/[id]/page";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  filter: vi.fn(),
  eq: vi.fn(),
  role: "student",
  visible: true,
  session: null as Record<string, unknown> | null,
}));
const title = "QA preview · 2018 HSC short paper (test student only)";
const paper = {
  id: "preview",
  title,
  year: 2018,
  origin: "nesa",
  time_limit_min: 20,
  total_marks: 5,
};
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "listed-user", role: mocks.role }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
}));
vi.mock("@/components/filter-bar", () => ({ FilterBar: () => null }));
vi.mock("@/components/sprint-runner", () => ({ SprintRunner: () => null }));
vi.mock("@/components/paper-start", () => ({ PaperStart: () => null }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const data =
        table === "papers"
          ? mocks.visible
            ? [paper]
            : []
          : table === "sessions"
            ? mocks.session
              ? [mocks.session]
              : []
            : table === "paper_questions"
              ? [
                  {
                    position: 1,
                    section: "Short answer",
                    choice_group: null,
                    question: { marks: 5, type: "short" },
                  },
                ]
              : [
                  {
                    id: "attempt",
                    position: 1,
                    question: { marks: 5, type: "short" },
                  },
                ];
      const query = {
        select: () => query,
        or: (filter: string) => {
          mocks.filter(table, filter);
          return query;
        },
        eq: (column: string, value: string) => {
          mocks.eq(table, column, value);
          return query;
        },
        is: () => query,
        order: () => query,
        limit: () => query,
        range: async () => ({ data, error: null }),
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data, error: null })),
      };
      return query;
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "student";
  mocks.visible = true;
  mocks.session = null;
});
const props = () => ({ params: Promise.resolve({ id: "preview" }) });
it.each(["student", "admin"])(
  "scopes the list and pre-start query to the %s's listed drafts",
  async (role) => {
    mocks.role = role;
    await Papers({ searchParams: Promise.resolve({}) });
    const start = await PaperPage(props());
    expect(mocks.filter.mock.calls).toEqual([
      [
        "papers",
        "status.eq.live,and(status.eq.draft,preview_user_ids.cs.{listed-user})",
      ],
      [
        "papers",
        "status.eq.live,and(status.eq.draft,preview_user_ids.cs.{listed-user})",
      ],
    ]);
    expect(start.props.paper.title).toBe(title);
    expect(start.props.sections).toEqual([
      expect.objectContaining({ name: "Short answer", marks: 5 }),
    ]);
  },
);
it("resumes a listed draft with the owned session's snapshotted config and attempts", async () => {
  const config = {
    time_limit_min: 20,
    reading_min: 5,
    strict: true,
    sections: [],
  };
  mocks.session = { id: "sit", kind: "paper", config };
  const runner = await PaperPage(props());
  expect(runner.props.title).toBe(title);
  expect(runner.props.paper.config).toEqual(config);
  expect(runner.props.initial).toEqual([
    expect.objectContaining({ id: "attempt" }),
  ]);
  expect(mocks.eq).toHaveBeenCalledWith("sessions", "user_id", "listed-user");
  expect(mocks.eq).toHaveBeenCalledWith("attempts", "user_id", "listed-user");
});
it("rejects an excluded paper before reading sessions or questions", async () => {
  mocks.visible = false;
  await expect(PaperPage(props())).rejects.toThrow("404");
  expect(mocks.eq.mock.calls).toEqual([["papers", "id", "preview"]]);
});
