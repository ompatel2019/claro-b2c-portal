import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  service: vi.fn(),
  rpc: vi.fn(),
  range: vi.fn(),
  topics: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.service }));
vi.mock("@/lib/admin-content", () => ({ loadTopics: mocks.topics }));
import {
  loadFlashcardCounts,
  loadFlashcardList,
  sharedFrontKeys,
} from "./admin-flashcards";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ role: "admin" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ order: () => ({ range: mocks.range }) });
  mocks.topics.mockResolvedValue([]);
});
it.each([loadFlashcardCounts, () => loadFlashcardList({}), sharedFrontKeys])(
  "authorises before any admin read",
  async (load) => {
    mocks.guard.mockRejectedValue(new Error("redirect:/student"));
    await expect(load()).rejects.toThrow("redirect:/student");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  },
);
it("loads every SQL aggregate row through the authenticated client", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i),
    status: "live",
    updated_at: "2026-10-09",
    reviews: 0,
  }));
  mocks.range.mockImplementation((from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  );
  const result = await loadFlashcardList({});
  expect(result.pager.total).toBe(1001);
  expect(mocks.rpc).toHaveBeenCalledWith("admin_flashcard_rows");
  expect(mocks.range.mock.calls).toEqual([
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
  expect(mocks.service).not.toHaveBeenCalled();
});

function countQueries(results: Record<string, number | null | Error>) {
  const queries: {
    select: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    not: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
  }[] = [];
  mocks.service.mockReturnValue({
    from: vi.fn((table: string) => {
      expect(table).toBe("flashcards");
      let key = "own";
      const query = {
        select: vi.fn(() => query),
        is: vi.fn(() => query),
        not: vi.fn(() => query),
        eq: vi.fn((column: string, value: string) => {
          if (column === "status") key = value;
          return query;
        }),
        throwOnError: vi.fn(async () => {
          const result = results[key];
          if (result instanceof Error) throw result;
          return { count: result };
        }),
      };
      queries.push(query);
      return query;
    }),
  });
  return queries;
}

it("counts the whole shared bank by status and keeps student-owned cards separate", async () => {
  const queries = countQueries({ own: 9, live: 1101, draft: 4, retired: 0 });
  await expect(loadFlashcardCounts()).resolves.toEqual({
    own: 9,
    live: 1101,
    draft: 4,
    retired: 0,
  });
  expect(queries[0].select).toHaveBeenCalledWith(
    "id,profiles!owner_id!inner(role)",
    { count: "exact", head: true },
  );
  expect(queries[0].not).toHaveBeenCalledWith("owner_id", "is", null);
  expect(queries[0].eq).toHaveBeenCalledWith("profiles.role", "student");
  for (const [index, status] of ["live", "draft", "retired"].entries()) {
    expect(queries[index + 1].select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(queries[index + 1].is).toHaveBeenCalledWith("owner_id", null);
    expect(queries[index + 1].eq).toHaveBeenCalledWith("status", status);
  }
});

it("isolates a failed status count and preserves zero", async () => {
  countQueries({ own: 9, live: 1101, draft: new Error("timeout"), retired: 0 });
  await expect(loadFlashcardCounts()).resolves.toEqual({
    own: 9,
    live: 1101,
    draft: null,
    retired: 0,
  });
});

it("keeps missing counts and a failed student count unavailable", async () => {
  countQueries({
    own: new Error("timeout"),
    live: null,
    draft: 0,
    retired: null,
  });
  await expect(loadFlashcardCounts()).resolves.toEqual({
    own: null,
    live: null,
    draft: 0,
    retired: null,
  });
});
