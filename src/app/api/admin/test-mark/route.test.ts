import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  requireAdmin: vi.fn(),
  mark: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/marking/engine", () => ({
  markWritten: mocks.mark,
  MARKER: {
    model: "test",
    effort: { grade: "low", check: "low", reconcile: "medium" },
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => {
    throw new Error("Unexpected service access");
  },
}));
import { POST } from "./route";
const valid = {
  question: {
    id: "test-question",
    type: "short",
    marks: 4,
    stem: "Explain inflation.",
    stimulus: null,
    criteria: [{ min: 1, max: 4, descriptor: "Explains inflation" }],
    guideline_notes: null,
    sample_answer: null,
    source: "Test",
  },
  answer: "Demand grows faster than supply.",
};
const request = (body: unknown = valid) =>
  new Request("https://example.test/api/admin/test-mark", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin" } } });
  mocks.maybeSingle.mockResolvedValue({ data: { role: "admin" } });
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "admin" });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
it.each([null, { id: "student" }])(
  "rejects unsigned/student requests before any AI or service access",
  async (user) => {
    mocks.getUser.mockResolvedValue({ data: { user } });
    mocks.maybeSingle.mockResolvedValue({ data: { role: "student" } });
    expect((await POST(request())).status).toBe(user ? 403 : 401);
    expect(mocks.mark).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it("blocks invalid unsaved criteria and oversized answers before reserving or marking", async () => {
  expect(
    (
      await POST(
        request({
          ...valid,
          question: {
            ...valid.question,
            criteria: [{ min: 0, max: 5, descriptor: "bad" }],
          },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({ ...valid, answer: Array(3001).fill("word").join(" ") }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.mark).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("fails closed if the rate reservation fails, and returns Retry-After when limited", async () => {
  const limited = await POST(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  mocks.rpc.mockResolvedValue({
    data: null,
    error: new Error("database unavailable"),
  });
  expect((await POST(request())).status).toBe(503);
  expect(mocks.requireAdmin).toHaveBeenCalled();
  expect(mocks.mark).not.toHaveBeenCalled();
});
