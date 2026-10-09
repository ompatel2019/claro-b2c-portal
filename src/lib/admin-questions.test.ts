import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  reads: [] as string[],
  rpc: vi.fn(),
  statusCount: vi.fn(),
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
        eq: (_column: string, value: string) => {
          query.throwOnError = () => mocks.statusCount(value);
          return query;
        },
        throwOnError: () => mocks.statusCount(),
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
  mocks.statusCount.mockResolvedValue({ count: 0 });
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
  () => loadImportReview(0.82, 1, false),
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

it("keeps the bank usable when the import-review badge times out", async () => {
  mocks.rpc.mockImplementation((name: string, args: { p_ids: string[] }) => ({
    throwOnError: async () => {
      if (name === "admin_import_review") throw new Error("statement timeout");
      return { data: args.p_ids.map((id) => ({ id, attempts: 0 })) };
    },
  }));
  const [review, list] = await Promise.all([
    loadImportReview(0.82, 1, false),
    loadQuestionList({ q: "inflation" }),
  ]);
  expect(review.tabCount).toBeNull();
  expect(list.rows).toHaveLength(50);
  // A failed primary query must not masquerade as an empty review.
  await expect(loadImportReview(0.82)).rejects.toThrow("statement timeout");
});

it("keeps filtered review results when only the unfiltered badge fails", async () => {
  const rows = [
    { draft: { id: "import-1" }, row: { id: "live-1" }, score: 0.9 },
  ];
  mocks.rpc.mockImplementation(
    (
      _name: string,
      args: { p_filters: { q?: string } },
      options?: { head: boolean },
    ) => {
      const query = {
        order: () => query,
        range: () => query,
        throwOnError: async () => {
          if (!args.p_filters.q) throw new Error("statement timeout");
          return options?.head ? { count: 1 } : { data: rows };
        },
      };
      return query;
    },
  );
  const review = await loadImportReview(0.82, 1, true, { q: "inflation" });
  expect(review.tabCount).toBeNull();
  expect(review.rows).toEqual(rows);
  expect(review.pager.total).toBe(1);
});

it("starts filtered and unfiltered review counts together and uses the unfiltered tab count", async () => {
  let resolveFiltered!: (value: { count: number }) => void;
  let resolveUnfiltered!: (value: { count: number }) => void;
  const filtered = new Promise<{ count: number }>((resolve) => {
    resolveFiltered = resolve;
  });
  const unfiltered = new Promise<{ count: number }>((resolve) => {
    resolveUnfiltered = resolve;
  });
  const filteredCount = vi.fn(() => filtered);
  const unfilteredCount = vi.fn(() => unfiltered);
  mocks.rpc.mockImplementation(
    (_name: string, args: { p_filters: { type?: string } }) => ({
      throwOnError: args.p_filters.type ? filteredCount : unfilteredCount,
    }),
  );

  const pendingReview = loadImportReview(0.82, 1, false, { type: "mcq" });
  try {
    await vi.waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
      expect(mocks.rpc).toHaveBeenNthCalledWith(
        1,
        "admin_import_review",
        { p_threshold: 0.82, p_filters: { type: "mcq", q: undefined } },
        { head: true, count: "exact" },
      );
      expect(mocks.rpc).toHaveBeenNthCalledWith(
        2,
        "admin_import_review",
        { p_threshold: 0.82, p_filters: { q: undefined } },
        { head: true, count: "exact" },
      );
      expect(filteredCount).toHaveBeenCalledExactlyOnceWith();
      expect(unfilteredCount).toHaveBeenCalledExactlyOnceWith();
    });
  } finally {
    resolveFiltered({ count: 3 });
    resolveUnfiltered({ count: 17 });
    await pendingReview;
  }

  const review = await pendingReview;
  expect(review.tabCount).toBe(17);
  expect(review.pager.total).toBe(3);
});

it("marks only the failed status badge unavailable and preserves zero counts", async () => {
  mocks.statusCount.mockImplementation(async (status: string) => {
    if (status === "draft") throw new Error("statement timeout");
    return { count: status === "live" ? 1101 : 0 };
  });
  await expect(loadQuestionCounts()).resolves.toEqual({
    live: 1101,
    draft: null,
    retired: 0,
  });
});
