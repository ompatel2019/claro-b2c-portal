import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  client: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ auth: { admin: { getUserById: mocks.user } } }),
}));
import {
  loadStudentDetail,
  loadSessionReport,
  loadStudentFeedback,
} from "./admin-data";
const id = "11111111-1111-4111-8111-111111111111";
const stats = {
  week: { thisWeek: 1501, lastWeek: 1400 },
  averages: { avg30: 82.5, prev30: null },
  due: { today: 1001, tomorrow: 2 },
  streaks: { current_streak: 3, longest_streak: 6 },
  lastActive: "2026-10-09T00:00:00Z",
  callsLastHour: 1200,
  spend30: 25,
  usage: [{ task: "mark_written", calls: 2001, tokens: 300000, usd: 25 }],
};
function query(rows: unknown[], single?: unknown) {
  const q: Record<string, unknown> = {};
  for (const key of ["select", "eq", "order", "maybeSingle", "throwOnError"])
    q[key] = vi.fn(() => q);
  q.range = vi.fn((from: number, to: number) => {
    const result = Promise.resolve({
      data: rows.slice(from, to + 1),
      error: null,
    });
    return Object.assign(result, { overrideTypes: () => result });
  });
  q.then = (resolve: (result: unknown) => unknown) =>
    Promise.resolve({ data: single ?? rows, error: null }).then(resolve);
  return q;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ role: "admin" });
  mocks.client.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.user.mockResolvedValue({
    data: { user: { email: "student@example.com" } },
    error: null,
  });
});
it.each([
  () => loadStudentDetail(id),
  () => loadSessionReport(id, id),
  () => loadStudentFeedback(id, id),
])(
  "guards every detail loader before any data or auth API reads",
  async (load) => {
    mocks.guard.mockRejectedValue(new Error("Denied"));
    await expect(load()).rejects.toThrow("Denied");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  },
);
it("pages sessions and attempts independently and preserves SQL totals beyond 1000", async () => {
  const sessions = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i),
    kind: "sprint",
    config: {},
    started_at: "2026-10-09T00:00:00Z",
    finished_at: null,
  }));
  const attempts = Array.from({ length: 1501 }, (_, i) => ({
    id: String(i),
    session_id: "1000",
    status: "marked",
    check_status: "pending",
    answered: true,
    day: "2026-10-09",
  }));
  const sessionQuery = query(sessions),
    attemptQuery = query(attempts);
  mocks.from.mockImplementation((name) =>
    name === "profiles"
      ? query([], { id, role: "student" })
      : name === "sessions"
        ? sessionQuery
        : query([]),
  );
  mocks.rpc.mockImplementation((name) =>
    name === "admin_student_detail"
      ? query([], stats)
      : name === "admin_student_attempts"
        ? attemptQuery
        : query([]),
  );
  const detail = await loadStudentDetail(id);
  expect(detail?.sessions).toHaveLength(1001);
  expect(detail?.sessions.at(-1)?.attempts).toHaveLength(1501);
  expect(detail).toMatchObject({
    week: stats.week,
    usage: stats.usage,
    callsLastHour: 1200,
  });
  expect(sessionQuery.range).toHaveBeenLastCalledWith(1000, 1499);
  expect(attemptQuery.range).toHaveBeenLastCalledWith(1500, 1999);
  expect(mocks.from).not.toHaveBeenCalledWith("ai_usage");
});
it("does not fetch keys or sample answers for an unfinished session", async () => {
  mocks.from.mockReturnValue(
    query([], { id, kind: "sprint", finished_at: null }),
  );
  const result = await loadSessionReport(id, id);
  expect(result).toMatchObject({ finished: false, rows: [] });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects invalid IDs and unavailable associations before signing storage URLs", async () => {
  expect(await loadStudentDetail("bad")).toBeNull();
  expect(await loadSessionReport("bad", id)).toBeNull();
  expect(await loadStudentFeedback("bad", id)).toBeNull();
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.from.mockReturnValue(query([], null));
  // maybeSingle null is represented explicitly for this query.
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => ({ throwOnError: async () => ({ data: null }) }),
        }),
      }),
    }),
  });
  expect(await loadSessionReport(id, id)).toBeNull();
});
it("propagates auth read errors rather than showing an unblocked student", async () => {
  mocks.from.mockImplementation((name) =>
    name === "profiles" ? query([], { id, role: "student" }) : query([]),
  );
  mocks.rpc.mockImplementation((name) =>
    query([], name === "admin_student_detail" ? stats : undefined),
  );
  mocks.user.mockResolvedValue({
    data: { user: null },
    error: new Error("Auth unavailable"),
  });
  await expect(loadStudentDetail(id)).rejects.toThrow("Auth unavailable");
});
