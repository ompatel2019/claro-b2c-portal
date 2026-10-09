import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  service: vi.fn(),
  topics: vi.fn(),
  keys: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.service }));
vi.mock("@/lib/admin-content", () => ({ loadTopics: mocks.topics }));
vi.mock("@/lib/admin-flashcards", () => ({ sharedFrontKeys: mocks.keys }));
import {
  bulkFlashcards,
  deleteCards,
  importCards,
  reviewCards,
  saveCard,
  undoFlashcards,
} from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ role: "admin" });
  mocks.topics.mockResolvedValue([
    { id: "parent", parent_id: null },
    { id: "child", parent_id: "parent" },
  ]);
  mocks.keys.mockResolvedValue(new Set());
});
it.each([
  () => saveCard({}),
  () => bulkFlashcards([], { kind: "retire" }),
  () => reviewCards([]),
  () => importCards([]),
  () => deleteCards([], ""),
  () => undoFlashcards([], ""),
])(
  "checks admin before validating or accessing service-role data",
  async (action) => {
    mocks.guard.mockRejectedValue(new Error("redirect:/student"));
    await expect(action()).rejects.toThrow("redirect:/student");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.topics).not.toHaveBeenCalled();
    expect(mocks.keys).not.toHaveBeenCalled();
  },
);
it("rejects parent topics and forged bulk actions before writing", async () => {
  expect(
    await saveCard({
      id: null,
      front: "GDP",
      back: "Output",
      kind: "term",
      topic_id: "parent",
      status: "draft",
    }),
  ).toEqual({ error: "Choose a subtopic." });
  expect(
    await bulkFlashcards(["id"], { kind: "topic", topic_id: "parent" }),
  ).toEqual({ error: "Choose a subtopic." });
  await expect(
    bulkFlashcards(["id"], { kind: "delete" } as never),
  ).rejects.toThrow();
  expect(mocks.service).not.toHaveBeenCalled();
});
it("revalidates trimmed import rows against real subtopics and shared dedupe", async () => {
  const rows = await reviewCards([
    { front: " GDP ", back: " Output ", kind: "term", topic_id: "child" },
    { front: "GDP", back: "Duplicate", kind: "term", topic_id: "child" },
    { front: "Prices", back: "CPI", kind: "term", topic_id: "parent" },
  ]);
  expect(rows.map((r) => r.status)).toEqual(["ready", "duplicate", "invalid"]);
  expect(rows[0].front).toBe("GDP");
  expect(mocks.service).not.toHaveBeenCalled();
});
