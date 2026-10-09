import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  range: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.client }));
import {
  loadFeedbackCounts,
  loadFeedbackItem,
  loadFeedbackList,
} from "./admin-feedback";
beforeEach(() => vi.resetAllMocks());
it.each([
  loadFeedbackCounts,
  () => loadFeedbackItem("id"),
  () => loadFeedbackList({}),
])("guards every inbox loader before data access", async (load) => {
  mocks.guard.mockRejectedValue(new Error("redirect:/student"));
  await expect(load()).rejects.toThrow("redirect:/student");
  expect(mocks.client).not.toHaveBeenCalled();
});
it("pages explicitly beyond 1000 rows before searching and rendering 50", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i).padStart(4, "0"),
    user_id: "user",
    kind: "general",
    message: `message-${i}`,
    page_path: null,
    screenshots: [],
    question_id: null,
    flashcard_id: null,
    session_id: null,
    status: "new",
    created_at: "2026-10-09T00:00:00Z",
    profile: { full_name: "Ada" },
    question: null,
  }));
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: mocks.range,
  };
  for (const method of [query.select, query.eq, query.order])
    method.mockReturnValue(query);
  mocks.client.mockResolvedValue({ from: () => query });
  mocks.range.mockImplementation((from, to) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  );
  const all = await loadFeedbackList({ sort: "__proto__", page: "999" });
  expect(all.pager).toMatchObject({
    total: 1001,
    page: 21,
    pages: 21,
    sort: { id: "age", dir: "desc" },
  });
  expect(mocks.range.mock.calls).toEqual([
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
  const result = await loadFeedbackList({ q: "message-1000" });
  expect(result.rows.map((r) => r.id)).toEqual(["1000"]);
});
