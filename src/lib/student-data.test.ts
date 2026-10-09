import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  rpc: vi.fn(),
  list: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ auth: { admin: { listUsers: mocks.list } } }),
}));
import { loadStudentRows } from "./admin-data";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ role: "admin" });
  mocks.rpc.mockReturnValue({ order: mocks.order });
  mocks.order.mockReturnValue({ range: mocks.range });
});
it("pages all SQL rows and auth users, preserving SQL totals above 1000", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: `student-${i}`,
    answered: 1500,
    open_disputes: 1001,
  }));
  mocks.range.mockImplementation(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
  mocks.list.mockImplementation(async ({ page }: { page: number }) => ({
    data: {
      users:
        page === 1
          ? rows
              .slice(0, 1000)
              .map((r) => ({ id: r.id, email: `${r.id}@example.com` }))
          : [
              {
                id: "student-1000",
                email: "last@example.com",
                banned_until: "2999-01-01",
              },
            ],
    },
    error: null,
  }));
  const result = await loadStudentRows();
  expect(result).toHaveLength(1001);
  expect(result.at(-1)).toMatchObject({
    answered: 1500,
    open_disputes: 1001,
    email: "last@example.com",
    blocked: true,
  });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_student_rows");
  expect(mocks.range).toHaveBeenNthCalledWith(3, 1000, 1499);
  expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, perPage: 1000 });
});
it("does not mask aggregate or auth read errors", async () => {
  mocks.range.mockResolvedValue({
    data: null,
    error: new Error("SQL unavailable"),
  });
  await expect(loadStudentRows()).rejects.toThrow("SQL unavailable");
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.range.mockResolvedValue({ data: [{ id: "student" }], error: null });
  mocks.list.mockResolvedValue({
    data: null,
    error: new Error("Auth unavailable"),
  });
  await expect(loadStudentRows()).rejects.toThrow(
    "Could not load student emails",
  );
});
