import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
vi.mock("@/lib/admin-content", () => ({
  contentUndoToken: vi.fn(),
  readContentUndoToken: vi.fn(),
}));
import { bulkFeedback, undoFeedback } from "./actions";
import { updateStudentFeedback } from "../students/actions";
import { contentUndoToken, readContentUndoToken } from "@/lib/admin-content";
import { revalidatePath } from "next/cache";
beforeEach(() => vi.resetAllMocks());
it.each([() => bulkFeedback([], "triaged"), () => undoFeedback("bad")])(
  "authorises before validating input or touching data",
  async (act) => {
    mocks.guard.mockRejectedValue(new Error("redirect:/student"));
    await expect(act()).rejects.toThrow("redirect:/student");
    expect(mocks.client).not.toHaveBeenCalled();
  },
);
it("rejects invalid status, IDs and oversized bulk requests before data access", async () => {
  mocks.guard.mockResolvedValue({ id: "admin" });
  const id = "11111111-1111-4111-8111-111111111111";
  await expect(bulkFeedback([id], "new" as "triaged")).rejects.toThrow();
  await expect(bulkFeedback(["invalid"], "resolved")).rejects.toThrow();
  await expect(bulkFeedback(Array(51).fill(id), "resolved")).rejects.toThrow();
  expect(mocks.client).not.toHaveBeenCalled();
});

const feedbackId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
type Row = {
  id: string;
  user_id: string;
  status: string;
  admin_note: string | null;
  resolved_at: string | null;
};

/** Execute updates only when every WHERE filter matches, including SQL nulls. */
function feedbackDb(rows: Row[]) {
  const filters = vi.fn();
  const updates = vi.fn();
  const from = () => {
    const predicates: ((row: Row) => boolean)[] = [];
    let patch: Partial<Row> | undefined;
    let single = false;
    const execute = () => {
      const matches = rows.filter((row) => predicates.every((p) => p(row)));
      if (patch) matches.forEach((row) => Object.assign(row, patch));
      const data = matches.map((row) => ({ ...row }));
      return { data: single ? (data[0] ?? null) : data, error: null };
    };
    const query = {
      select: () => query,
      update: (value: Partial<Row>) => {
        patch = value;
        updates(value);
        return query;
      },
      eq: (field: keyof Row, value: string) => {
        filters("eq", field, value);
        predicates.push((row) => row[field] === value);
        return query;
      },
      is: (field: keyof Row, value: null) => {
        filters("is", field, value);
        predicates.push((row) => row[field] === value);
        return query;
      },
      in: (field: keyof Row, values: string[]) => {
        predicates.push((row) => values.includes(row[field] ?? ""));
        return query;
      },
      maybeSingle: () => {
        single = true;
        return query;
      },
      throwOnError: async () => execute(),
      then: (resolve: (result: ReturnType<typeof execute>) => unknown) =>
        Promise.resolve(execute()).then(resolve),
    };
    return query;
  };
  mocks.guard.mockResolvedValue({ id: "admin" });
  mocks.client.mockResolvedValue({ from });
  vi.mocked(contentUndoToken).mockImplementation((_scope, _admin, data) =>
    JSON.stringify(data),
  );
  vi.mocked(readContentUndoToken).mockImplementation((_scope, _admin, token) =>
    JSON.parse(token),
  );
  return { filters, updates };
}

function newFeedback(): Row {
  return {
    id: feedbackId,
    user_id: userId,
    status: "new",
    admin_note: null,
    resolved_at: null,
  };
}

it("restores an unchanged reply and guards nullable fields in the UPDATE", async () => {
  const row = newFeedback();
  const { filters } = feedbackDb([row]);
  const { undo } = await updateStudentFeedback(
    feedbackId,
    userId,
    "triaged",
    "A",
  );
  filters.mockClear();
  const result = await undoFeedback(undo);
  expect(row).toEqual(newFeedback());
  expect(result).toEqual({
    ok: true,
    restored: [expect.objectContaining({ status: "new", admin_note: null })],
  });
  expect(filters.mock.calls).toEqual([
    ["eq", "id", feedbackId],
    ["eq", "status", "triaged"],
    ["eq", "admin_note", "A"],
    ["is", "resolved_at", null],
  ]);
});

it("preserves reply B when undoing reply A, then allows undo B", async () => {
  const row = newFeedback();
  feedbackDb([row]);
  const a = await updateStudentFeedback(feedbackId, userId, "triaged", "A");
  const b = await updateStudentFeedback(feedbackId, userId, "triaged", "B");
  vi.mocked(revalidatePath).mockClear();
  expect(await undoFeedback(a.undo)).toEqual({
    error: "Changed since — nothing was undone.",
  });
  expect(row.admin_note).toBe("B");
  expect(row.status).toBe("triaged");
  expect(revalidatePath).toHaveBeenCalledWith("/admin/feedback");
  expect(await undoFeedback(b.undo)).toMatchObject({ ok: true });
  expect(row.admin_note).toBe("A");
});

it.each([
  { status: "resolved" },
  { admin_note: "Later reply" },
  { resolved_at: "2026-10-10T01:00:00Z" },
])("skips bulk undo when a guarded field changes: %j", async (later) => {
  const row = newFeedback();
  feedbackDb([row]);
  const result = await bulkFeedback([feedbackId], "triaged");
  if (!result.undo) throw new Error("Bulk write failed");
  Object.assign(row, later);
  const before = { ...row };
  expect(await undoFeedback(result.undo)).toEqual({
    error: "Changed since — nothing was undone.",
  });
  expect(row).toEqual(before);
});

it("restores bulk resolution with SQL null and timestamp guards", async () => {
  const row = newFeedback();
  const { filters } = feedbackDb([row]);
  const result = await bulkFeedback([feedbackId], "resolved");
  if (!result.undo) throw new Error("Bulk write failed");
  const resolvedAt = row.resolved_at;
  filters.mockClear();
  expect(await undoFeedback(result.undo)).toMatchObject({ ok: true });
  expect(row).toEqual(newFeedback());
  expect(filters).toHaveBeenCalledWith("is", "admin_note", null);
  expect(filters).toHaveBeenCalledWith("eq", "resolved_at", resolvedAt);
  expect(await undoFeedback(result.undo)).toEqual({
    error: "Changed since — nothing was undone.",
  });
});

it("reports partial bulk undo honestly and preserves changed rows", async () => {
  const first = newFeedback();
  const second = {
    ...newFeedback(),
    id: "33333333-3333-4333-8333-333333333333",
  };
  feedbackDb([first, second]);
  const result = await bulkFeedback([first.id, second.id], "resolved");
  if (!result.undo) throw new Error("Bulk write failed");
  second.admin_note = "Later reply";
  const changed = { ...second };
  expect(await undoFeedback(result.undo)).toEqual({
    error: "Changed since — 1 undone; 1 skipped.",
  });
  expect(first).toEqual(newFeedback());
  expect(second).toEqual(changed);
});

it("rejects old snapshots without a written-state guard before data access", async () => {
  mocks.guard.mockResolvedValue({ id: "admin" });
  vi.mocked(readContentUndoToken).mockReturnValue([newFeedback()]);
  await expect(undoFeedback("old-token")).rejects.toThrow();
  expect(mocks.client).not.toHaveBeenCalled();
});
