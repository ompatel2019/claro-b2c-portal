import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  reads: [] as string[],
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
const bank = Array.from({ length: 1101 }, (_, i) => ({
  id: `q-${String(i).padStart(4, "0")}`,
  source: "Test source",
  stem: "Explain inflation",
  year: 2026,
  type: "short",
  topic_id: "t3-inflation",
  marks: 4,
  verb: "Explain",
  status: "live",
  origin: "claro",
  updated_at: "2026-10-09T01:00:00Z",
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    from: (table: string) => {
      mocks.reads.push(table);
      const rows =
        table === "questions"
          ? bank
          : table === "topics"
            ? [
                { id: "t3", parent_id: null, name: "Economic issues", sort: 1 },
                {
                  id: "t3-inflation",
                  parent_id: "t3",
                  name: "Inflation",
                  sort: 2,
                },
              ]
            : [];
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        range: (from: number, to: number) =>
          Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        overrideTypes: () => query,
      };
      return query;
    },
  }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
import {
  loadQuestionList,
  loadQuestion,
  loadTopics,
  livePaperTitles,
  loadImportReview,
  loadQuestionCounts,
} from "./admin-questions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reads.length = 0;
  mocks.requireAdmin.mockResolvedValue({ role: "admin" });
  mocks.rpc.mockImplementation((_name: string, args: { p_ids: string[] }) => ({
    throwOnError: async () => ({
      data: args.p_ids.map((id) => ({
        id,
        attempts: 1501,
        avg: 75,
        disagreements: 23,
        reports: 1200,
        histogram: [],
        picks: { rates: [], flagged: false, picks: 0 },
      })),
    }),
  }));
});
it.each([
  loadTopics,
  livePaperTitles,
  loadQuestionCounts,
  () => loadQuestionList({}),
  () => loadQuestion("q-0000"),
  () => loadImportReview(0.82),
])("guards every loader before service data access", async (load) => {
  mocks.requireAdmin.mockRejectedValue(new Error("student"));
  await expect(load()).rejects.toThrow("student");
  expect(mocks.reads).toEqual([]);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("pages the whole bank, sorts aggregate columns and clamps the 50-row page", async () => {
  const list = await loadQuestionList({
    sort: "attempts",
    dir: "desc",
    page: "9999",
  });
  expect(list.pager).toMatchObject({ total: 1101, pages: 23, page: 23 });
  expect(list.rows).toHaveLength(1);
  expect(list.rows[0]).toMatchObject({
    id: "q-1100",
    attempts: 1501,
    avg: 75,
    reports: 1200,
  });
});
it("searches displayed topic names and aggregate values without truncating the bank", async () => {
  expect((await loadQuestionList({ q: "Inflation" })).pager.total).toBe(1101);
  expect((await loadQuestionList({ q: "1200" })).pager.total).toBe(1101);
  expect((await loadQuestionList({ q: "missing text" })).pager.total).toBe(0);
});
