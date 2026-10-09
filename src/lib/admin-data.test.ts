import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  throwOnError: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: vi.fn(() => {
    throw new Error("Unexpected service-role access");
  }),
}));
import {
  loadAdminBadges,
  loadDashboard,
  loadStudentRows,
  loadStudent,
  loadSpend,
} from "./admin-data";

const empty = {
  students: 0,
  active: { now: 0, prev: 0 },
  sessionsWeek: 0,
  openReviews: { count: 0, oldestDays: null },
  spend: { month: 0, all: 0 },
  sessionsTotal: 0,
  spendTotal: 0,
  sessionsPerDay: [],
  spendPerDay: [],
  attention: {
    failed: 0,
    newFeedback: 0,
    contentReports: 0,
    importReview: 0,
    agreement: null,
  },
  latest: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: "admin" });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ throwOnError: mocks.throwOnError });
  mocks.throwOnError.mockResolvedValue({ data: empty });
});
it.each([
  loadDashboard,
  loadAdminBadges,
  loadStudentRows,
  () => loadStudent("id"),
  loadSpend,
])("authorises before reading admin data", async (load) => {
  mocks.requireAdmin.mockRejectedValue(new Error("redirect:/student"));
  await expect(load()).rejects.toThrow("redirect:/student");
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("reads SQL aggregates through the signed-in client", async () => {
  expect(await loadDashboard()).toEqual({
    ...empty,
    spend: { ...empty.spend, cap: 100 },
  });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_dashboard");
});
it("shares the SQL attention counts with sidebar badges", async () => {
  mocks.throwOnError.mockResolvedValue({
    data: {
      ...empty,
      attention: { ...empty.attention, importReview: 1200, newFeedback: 1500 },
    },
  });
  expect(await loadAdminBadges()).toEqual({
    "/admin/content/questions": 1200,
    "/admin/feedback": 1500,
  });
});
it("propagates read failures instead of showing zero statistics", async () => {
  mocks.throwOnError.mockRejectedValue(new Error("Unavailable"));
  await expect(loadDashboard()).rejects.toThrow("Unavailable");
});
it("rejects malformed RPC data instead of rendering misleading values", async () => {
  mocks.throwOnError.mockResolvedValue({ data: { ...empty, spend: null } });
  await expect(loadDashboard()).rejects.toThrow();
});
