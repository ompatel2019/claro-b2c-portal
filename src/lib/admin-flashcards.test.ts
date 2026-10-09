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
