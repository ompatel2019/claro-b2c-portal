import { beforeEach, expect, it, vi } from "vitest";
import { unstable_cache } from "next/cache";
import { QUESTION_IMPORT_REVIEW_TAG } from "./question-review-cache";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  reads: [] as string[],
  rpc: vi.fn(),
  reviewRpc: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  cache: new Map<string, Promise<unknown>>(),
  statusCount: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: vi.fn((fn: () => Promise<unknown>, keys: string[]) => () => {
    const key = JSON.stringify(keys);
    if (!mocks.cache.has(key)) {
      const pending = fn().catch((error) => {
        mocks.cache.delete(key);
        throw error;
      });
      mocks.cache.set(key, pending);
    }
    return mocks.cache.get(key);
  }),
  updateTag: vi.fn(),
}));
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
    rpc: mocks.reviewRpc,
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
  loadImportReview,
  loadQuestionCounts,
} from "./admin-questions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reads.length = 0;
  mocks.cache.clear();
  mocks.reviewRpc.mockImplementation(() => reviewResult([]));
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
  expect(mocks.reviewRpc).not.toHaveBeenCalled();
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

const reviewRows = Array.from({ length: 103 }, (_, i) => ({
  id: `draft-${String(i).padStart(3, "0")}`,
  draft: { id: `draft-${i}` },
  row: { id: `live-${i}` },
  score: 0.9,
}));

function reviewResult(data = reviewRows) {
  return {
    order: mocks.order.mockImplementation(() => ({
      range: mocks.range.mockImplementation((from: number, to: number) => ({
        throwOnError: vi.fn(async () => ({ data: data.slice(from, to + 1) })),
      })),
    })),
  };
}

it("keeps the bank usable when the import-review badge times out", async () => {
  mocks.reviewRpc.mockImplementation(() => ({
    order: () => ({
      range: () => ({
        throwOnError: async () => {
          throw new Error("statement timeout");
        },
      }),
    }),
  }));
  const [review, list] = await Promise.all([
    loadImportReview(0.82, 1, false),
    loadQuestionList({ q: "inflation" }),
  ]);
  expect(review).toMatchObject({
    tabCount: null,
    rows: [],
    pager: { total: 0, page: 1, pages: 1 },
  });
  expect(list.rows).toHaveLength(50);
  await expect(loadImportReview(0.82)).rejects.toThrow("statement timeout");
});

it("keeps filtered review results when only the unfiltered badge fails", async () => {
  mocks.reviewRpc.mockImplementation((_name, args) =>
    args.p_filters.q
      ? reviewResult(reviewRows.slice(0, 1))
      : {
          order: () => ({
            range: () => ({
              throwOnError: async () => {
                throw new Error("statement timeout");
              },
            }),
          }),
        },
  );
  const review = await loadImportReview(0.82, 1, true, { q: "inflation" });
  expect(review.tabCount).toBeNull();
  expect(review.rows).toEqual(reviewRows.slice(0, 1));
  expect(review.pager.total).toBe(1);
});

it("reuses one service RPC for repeated reviews and the unfiltered badge", async () => {
  mocks.reviewRpc.mockImplementation(() => reviewResult());
  expect((await loadImportReview(0.82, 1, false)).tabCount).toBe(103);
  const first = await loadImportReview(0.82);
  expect(await loadImportReview(0.82)).toEqual(first);
  // Status and paging do not affect the pair set.
  await loadImportReview(0.82, 2, true, {
    status: "review",
    page: "2",
    q: "  ",
  });
  expect(mocks.reviewRpc).toHaveBeenCalledExactlyOnceWith(
    "question_import_review",
    { p_threshold: 0.82, p_filters: {} },
  );
  expect(mocks.order).toHaveBeenCalledExactlyOnceWith("id");
  expect(mocks.range).toHaveBeenCalledExactlyOnceWith(0, 999);
  expect(mocks.range.mock.results[0].value.throwOnError).toHaveBeenCalledOnce();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("fetches all 2,350 review pairs across three service RPC pages", async () => {
  const pairs = Array.from({ length: 2350 }, (_, i) => ({
    id: `draft-${String(i).padStart(4, "0")}`,
    draft: { id: `draft-${i}` },
    row: { id: `live-${i}` },
    score: 0.9,
  }));
  mocks.reviewRpc.mockImplementation(() => reviewResult(pairs));

  const review = await loadImportReview(0.82, 999);

  expect(review.tabCount).toBe(2350);
  expect(review.pager).toEqual({
    page: 47,
    pages: 47,
    total: 2350,
    sort: { id: "id", dir: "asc" },
  });
  expect(review.rows).toEqual(pairs.slice(2300));
  expect(review.rows.at(-1)).toEqual(pairs.at(-1));
  expect(mocks.reviewRpc).toHaveBeenCalledTimes(3);
  for (let call = 1; call <= 3; call++) {
    expect(mocks.reviewRpc).toHaveBeenNthCalledWith(
      call,
      "question_import_review",
      { p_threshold: 0.82, p_filters: {} },
    );
    expect(mocks.order).toHaveBeenNthCalledWith(call, "id");
    expect(
      mocks.range.mock.results[call - 1].value.throwOnError,
    ).toHaveBeenCalledOnce();
  }
  expect(mocks.order).toHaveBeenCalledTimes(3);
  expect(mocks.range.mock.calls).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

it("normalizes search and filter key order and includes threshold in the cache key", async () => {
  mocks.reviewRpc.mockImplementation(() => reviewResult());
  const q = "a".repeat(100);
  await loadImportReview(0.82, 1, true, { q: `  ${q}extra `, type: "mcq" });
  await loadImportReview(0.82, 1, true, { type: "mcq", q });
  expect(mocks.reviewRpc).toHaveBeenCalledTimes(2);
  expect(mocks.reviewRpc).toHaveBeenCalledWith("question_import_review", {
    p_threshold: 0.82,
    p_filters: { q, type: "mcq" },
  });
  await loadImportReview(0.9);
  expect(mocks.reviewRpc).toHaveBeenCalledTimes(3);
  expect(vi.mocked(unstable_cache)).toHaveBeenCalledWith(
    expect.any(Function),
    [QUESTION_IMPORT_REVIEW_TAG, "0.82", JSON.stringify({ q, type: "mcq" })],
    { revalidate: 120, tags: [QUESTION_IMPORT_REVIEW_TAG] },
  );
});

it("starts filtered and unfiltered pairs concurrently and uses at most two RPCs", async () => {
  let resolveFiltered!: (value: { data: typeof reviewRows }) => void;
  let resolveUnfiltered!: (value: { data: typeof reviewRows }) => void;
  const filtered = new Promise<{ data: typeof reviewRows }>((resolve) => {
    resolveFiltered = resolve;
  });
  const unfiltered = new Promise<{ data: typeof reviewRows }>((resolve) => {
    resolveUnfiltered = resolve;
  });
  const filteredRead = vi.fn(() => filtered);
  const unfilteredRead = vi.fn(() => unfiltered);
  mocks.reviewRpc.mockImplementation((_name, args) => ({
    order: () => ({
      range: (from: number, to: number) => ({
        throwOnError: () =>
          (args.p_filters.type ? filteredRead() : unfilteredRead()).then(
            ({ data }) => ({ data: data.slice(from, to + 1) }),
          ),
      }),
    }),
  }));
  const pending = loadImportReview(0.82, 1, true, { type: "mcq" });
  try {
    await vi.waitFor(() => {
      expect(mocks.reviewRpc).toHaveBeenCalledTimes(2);
      expect(filteredRead).toHaveBeenCalledOnce();
      expect(unfilteredRead).toHaveBeenCalledOnce();
    });
  } finally {
    resolveFiltered({ data: reviewRows.slice(0, 3) });
    resolveUnfiltered({ data: reviewRows.slice(0, 17) });
    await pending;
  }
  const review = await pending;
  expect(review).toMatchObject({
    tabCount: 17,
    rows: reviewRows.slice(0, 3),
    pager: { total: 3 },
  });
  await loadImportReview(0.82, 1, true, { type: "mcq" });
  await loadImportReview(0.82, 1, false);
  expect(mocks.reviewRpc).toHaveBeenCalledTimes(2);
});

it.each([
  [999, 3, 3],
  [0, 1, 50],
  [-1, 1, 50],
  [NaN, 1, 50],
  [1.5, 1, 50],
  [2, 2, 50],
])(
  "clamps requested page %s and preserves ordered 50-row slices",
  async (requested, page, length) => {
    mocks.reviewRpc.mockImplementation(() => reviewResult());
    const review = await loadImportReview(0.82, requested);
    expect(review.pager).toEqual({
      page,
      pages: 3,
      total: 103,
      sort: { id: "id", dir: "asc" },
    });
    expect(review.rows).toEqual(reviewRows.slice((page - 1) * 50, page * 50));
    expect(review.rows).toHaveLength(length);
    expect(mocks.reviewRpc).toHaveBeenCalledOnce();
  },
);

it("preserves zero counts and empty review pagination", async () => {
  expect(await loadImportReview(0.82, 999)).toEqual({
    tabCount: 0,
    rows: [],
    pager: { page: 1, pages: 1, total: 0, sort: { id: "id", dir: "asc" } },
  });
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

it("ignores the removed filter when loading import review", async () => {
  await loadImportReview(0.82, 1, true, { paper: "yes", type: "mcq" });
  expect(mocks.reviewRpc).toHaveBeenCalledWith("question_import_review", {
    p_threshold: 0.82,
    p_filters: { type: "mcq" },
  });
});

it("loads Questions without reading removed content tables", async () => {
  const result = await loadQuestionList({});
  expect(result.pager.total).toBe(bank.length);
  expect(mocks.reads.length).toBeGreaterThan(0);
  expect(
    mocks.reads.every((table) => ["questions", "topics"].includes(table)),
  ).toBe(true);
});
