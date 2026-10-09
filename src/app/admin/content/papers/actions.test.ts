import { beforeEach, expect, it, vi } from "vitest";
import { QUESTION_IMPORT_REVIEW_TAG } from "@/lib/question-review-cache";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  updateTag: vi.fn(),
  from: vi.fn(),
  readUndo: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
  updateTag: mocks.updateTag,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: mocks.from }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/admin-content", () => ({
  contentUndoToken: () => "undo-token",
  readContentUndoToken: mocks.readUndo,
}));
import { savePaper, retirePapers, undoRetirePapers } from "./actions";
const id = "123e4567-e89b-42d3-a456-426614174000";
const expected = "2026-10-09T01:00:00Z";
const input = {
  title: "Trial",
  year: null,
  source: null,
  time_limit_min: 180,
  ranks_enabled: false,
  sections: [{ name: "Short answer", questions: [] }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ id: "admin-id", role: "admin" });
});
it.each([
  ["draft", false],
  ["live", true],
  ["retired", false],
] as const)(
  "invalidates review after saving paper status %s (publish drafts: %s)",
  async (status, publishDrafts) => {
    mocks.rpc.mockResolvedValue({
      data: { total: 4, version: expected, previous_status: "draft" },
      error: null,
    });
    expect(
      await savePaper(id, input, status, publishDrafts, expected),
    ).toMatchObject({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "admin_save_paper",
      expect.objectContaining({ p_publish_drafts: publishDrafts }),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/content/questions");
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith(
      QUESTION_IMPORT_REVIEW_TAG,
    );
  },
);
it("invalidates the live-paper review filter after bulk retirement", async () => {
  mocks.rpc.mockReturnValue({
    throwOnError: async () => ({
      data: { previous: [{ id, status: "live" }], version: expected },
    }),
  });
  expect(await retirePapers([id])).toMatchObject({ done: 1 });
  expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith(
    QUESTION_IMPORT_REVIEW_TAG,
  );
});
it("invalidates the live-paper review filter after undoing retirement", async () => {
  mocks.readUndo.mockReturnValue({
    previous: [{ id, status: "live" }],
    version: expected,
  });
  const query = {
    update: () => query,
    eq: () => query,
    select: () => query,
    throwOnError: async () => ({ data: [{ id }] }),
  };
  mocks.from.mockReturnValue(query);
  expect(await undoRetirePapers("undo-token")).toBe(1);
  expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith(
    QUESTION_IMPORT_REVIEW_TAG,
  );
});
it("does not invalidate when the save RPC fails", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "changed" } });
  expect(await savePaper(id, input, "live", true, expected)).toEqual({
    error: "changed",
  });
  expect(mocks.updateTag).not.toHaveBeenCalled();
});
