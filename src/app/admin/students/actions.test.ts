import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  ban: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ auth: { admin: { updateUserById: mocks.ban } } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { openSpotCheck, setBlocked, updateStudentFeedback } from "./actions";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ role: "admin" });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
});
it.each([
  () => openSpotCheck(id),
  () => setBlocked(id, true),
  () => updateStudentFeedback(id, id, "resolved", "Reply"),
])("rejects non-admin writes before reaching data", async (action) => {
  mocks.guard.mockRejectedValue(new Error("Denied"));
  await expect(action()).rejects.toThrow("Denied");
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.ban).not.toHaveBeenCalled();
});
it("delegates review creation and reuse to one atomic admin RPC and returns its editor ID", async () => {
  mocks.rpc.mockReturnValue({ throwOnError: async () => ({ data: id }) });
  expect(await openSpotCheck(id)).toEqual({ id });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_open_student_review", {
    p_attempt: id,
  });
  expect(mocks.ban).not.toHaveBeenCalled();
});
it("propagates review failures without claiming success or invalidating caches", async () => {
  mocks.rpc.mockReturnValue({
    throwOnError: async () => {
      throw new Error("Only finished written answers can be reviewed");
    },
  });
  await expect(openSpotCheck(id)).rejects.toThrow("Only finished written");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("cannot ban an admin even when passed a valid UUID", async () => {
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => ({
          throwOnError: async () => ({ data: { role: "admin" } }),
        }),
      }),
    }),
  });
  await expect(setBlocked(id, true)).rejects.toThrow("Student not found");
  expect(mocks.ban).not.toHaveBeenCalled();
});
it("validates feedback status and reply length before writing", async () => {
  await expect(updateStudentFeedback(id, id, "bad", "Reply")).rejects.toThrow();
  await expect(
    updateStudentFeedback(id, id, "resolved", "x".repeat(2001)),
  ).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});
