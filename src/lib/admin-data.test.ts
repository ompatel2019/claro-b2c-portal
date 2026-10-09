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
  loadStudentDetail,
  loadSessionReport,
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
  () => loadStudentDetail("id"),
  () => loadSessionReport("session", "user"),
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

function spendClient(options: { fail?: string; count?: number } = {}) {
  const queries: {
    table: string;
    query: Record<string, ReturnType<typeof vi.fn>>;
  }[] = [];
  const from = vi.fn((table: string) => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "lt", "gte", "eq", "order"])
      query[method] = vi.fn(() => query);
    query.range = vi.fn((start: number, end: number) => {
      if (table === options.fail)
        return Promise.resolve({
          data: null,
          error: new Error("Spend unavailable"),
        });
      const row =
        table === "profiles"
          ? { id: "fake-student-a", full_name: "Student A" }
          : table === "attempts"
            ? {
                marked_at: "2026-10-09T02:30:00Z",
                question_id: null,
                question: null,
                note: null,
              }
            : {
                usd: "0.01",
                created_at: "2026-10-09T02:30:00Z",
                user_id: "fake-student-a",
                model: "Model A",
                task: "mark_written",
                input_tokens: 10,
                cached_tokens: 2,
                output_tokens: 5,
              };
      const count = table === "ai_usage" ? (options.count ?? 1) : 1;
      return Promise.resolve({
        data: Array.from(
          { length: Math.max(0, Math.min(end + 1, count) - start) },
          () => row,
        ),
        error: null,
      });
    });
    queries.push({ table, query });
    return query;
  });
  mocks.createClient.mockResolvedValue({ from, rpc: mocks.rpc });
  return queries;
}
const spendNow = new Date("2026-10-09T03:00:00Z");
it("pages usage past 1000 rows and returns shared caps and limits", async () => {
  const queries = spendClient({ count: 1201 });
  mocks.throwOnError.mockResolvedValue({
    data: { ...empty, spend: { month: 42, all: 84 } },
  });
  const result = await loadSpend("month", spendNow);
  expect(result.today).toBeCloseTo(12.01);
  expect(result.month).toBe(42);
  expect(result.all).toBe(84);
  expect(mocks.rpc).toHaveBeenCalledWith("admin_dashboard");
  expect(result.byModel[0]).toMatchObject({
    calls: 1201,
    input_tokens: 12010,
    cached_tokens: 2402,
    output_tokens: 6005,
  });
  expect(result.markedWritten).toBe(1);
  expect(result.cap).toBe(100);
  expect(result.markers).toEqual([80, 90, 100]);
  expect(result.limits).toEqual({
    perMinute: 20,
    perHour: 200,
    markMyAnswerPerDay: 20,
    openDisputesPerAnswer: 1,
    openDisputesPerStudent: 3,
  });
  const usage = queries.filter((q) => q.table === "ai_usage");
  expect(usage).toHaveLength(3);
  expect(usage.map(({ query }) => query.range.mock.calls[0])).toEqual([
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
  for (const { query } of usage) {
    expect(query.order).toHaveBeenCalledWith("id");
    expect(query.lt).toHaveBeenCalledWith("created_at", spendNow.toISOString());
    expect(query.select.mock.calls[0][0]).not.toContain("*");
  }
  for (const { query } of usage) {
    expect(query.select).toHaveBeenCalledWith(
      "created_at,user_id,model,task,input_tokens,cached_tokens,output_tokens,usd",
    );
    expect(query.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-09-09T14:00:00.000Z",
    );
  }
  const profiles = queries.find((q) => q.table === "profiles")!.query;
  expect(profiles.eq).toHaveBeenCalledWith("role", "student");
  expect(profiles.select).toHaveBeenCalledWith("id,full_name");
});
it("filters custom attempt dates server-side while preserving fixed recent usage", async () => {
  const queries = spendClient();
  await loadSpend({ from: "2026-08-01", to: "2026-08-31" }, spendNow);
  const attempts = queries.find((q) => q.table === "attempts")!.query;
  expect(attempts.eq).toHaveBeenCalledWith("status", "marked");
  expect(attempts.select).toHaveBeenCalledWith(
    "marked_at,question_id,note:feedback->>note,question:questions(type)",
  );
  expect(attempts.gte).toHaveBeenCalledWith(
    "marked_at",
    "2026-07-31T14:00:00.000Z",
  );
  expect(attempts.lt).toHaveBeenCalledWith(
    "marked_at",
    "2026-08-31T14:00:00.000Z",
  );
  const detail = queries.find((q) => q.table === "ai_usage")!.query;
  expect(detail.gte).toHaveBeenCalledWith(
    "created_at",
    "2026-07-31T14:00:00.000Z",
  );
});
it("does not apply a lower bound for all-time reads", async () => {
  const queries = spendClient();
  await loadSpend("all", spendNow);
  for (const { query } of queries) expect(query.gte).not.toHaveBeenCalled();
});
it.each(["ai_usage", "attempts", "profiles"])(
  "propagates %s failures",
  async (fail) => {
    spendClient({ fail });
    await expect(loadSpend("month", spendNow)).rejects.toThrow(
      "Spend unavailable",
    );
  },
);

it("propagates dashboard failures through spend", async () => {
  spendClient();
  mocks.throwOnError.mockRejectedValue(new Error("Dashboard unavailable"));
  await expect(loadSpend("month", spendNow)).rejects.toThrow(
    "Dashboard unavailable",
  );
});
