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

function itemClient(paths: string[], linked = false) {
  const row = {
    id: "feedback",
    user_id: "user",
    message: "Please fix this",
    status: "new",
    screenshots: paths,
    session_id: linked ? "session" : null,
    question_id: linked ? "question" : null,
  };
  const feedback = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    throwOnError: vi.fn().mockResolvedValue({ data: row }),
  };
  const attempts = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    throwOnError: vi.fn().mockResolvedValue({ data: [] }),
  };
  const sign = vi.fn();
  mocks.client.mockResolvedValue({
    from: (table: string) => (table === "feedback" ? feedback : attempts),
    storage: { from: vi.fn().mockReturnValue({ createSignedUrls: sign }) },
  });
  return { sign, attempts };
}

it("loads feedback with the URLs that signed when one screenshot is missing", async () => {
  const { sign } = itemClient(["user/available.png", "user/missing.png"]);
  sign.mockResolvedValue({
    data: [
      { signedUrl: "https://storage/available", error: null },
      { signedUrl: "", error: "Object not found" },
    ],
    error: null,
  });
  await expect(loadFeedbackItem("feedback")).resolves.toMatchObject({
    id: "feedback",
    screenshots: ["https://storage/available"],
    missingScreenshots: 1,
  });
  expect(sign).toHaveBeenCalledWith(
    ["user/available.png", "user/missing.png"],
    3600,
  );
});

it("loads feedback when the entire screenshot signing call errors", async () => {
  const { sign } = itemClient(["user/one.png", "user/two.png"]);
  sign.mockResolvedValue({
    data: null,
    error: new Error("Storage unavailable"),
  });
  await expect(loadFeedbackItem("feedback")).resolves.toMatchObject({
    screenshots: [],
    missingScreenshots: 2,
  });
});

it("loads feedback when screenshot signing rejects", async () => {
  const { sign } = itemClient(["user/one.png"]);
  sign.mockRejectedValue(new Error("Storage unavailable"));
  await expect(loadFeedbackItem("feedback")).resolves.toMatchObject({
    screenshots: [],
    missingScreenshots: 1,
  });
});

it("uses the first ordered attempt when two rows match the session and question", async () => {
  const { attempts, sign } = itemClient([], true);
  attempts.throwOnError.mockResolvedValue({
    data: [
      { id: "first", status: "marked", question: { type: "short" } },
      { id: "second", status: "pending", question: { type: "short" } },
    ],
  });
  await expect(loadFeedbackItem("feedback")).resolves.toMatchObject({
    attempt: { id: "first", status: "marked" },
    screenshots: [],
    missingScreenshots: 0,
  });
  expect(attempts.eq.mock.calls).toEqual([
    ["session_id", "session"],
    ["question_id", "question"],
  ]);
  expect(attempts.order.mock.calls).toEqual([
    ["created_at", { ascending: true }],
    ["id", { ascending: true }],
  ]);
  expect(attempts.limit).toHaveBeenCalledWith(1);
  expect(sign).not.toHaveBeenCalled();
});
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
