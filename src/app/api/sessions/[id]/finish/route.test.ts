// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ kind: "sprint", finish: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({ data: { kind: mocks.kind } }),
    }),
  }),
}));
vi.mock("@/lib/marking/engine", () => ({ finishSession: mocks.finish }));
import { POST } from "./route";
const finish = () =>
  POST(new Request("http://localhost/api", { method: "POST" }), {
    params: Promise.resolve({ id: "s" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.kind = "sprint";
  mocks.finish.mockResolvedValue({ score: 2, max_score: 4, summary: null });
});
it.each(["sprint", "flashcards"])(
  "finishes %s using the shared engine",
  async (kind) => {
    mocks.kind = kind;
    const response = await finish();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      score: 2,
      max_score: 4,
      summary: null,
      finished: true,
    });
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("s");
  },
);
it("returns not found for a legacy paper row without calling the engine", async () => {
  mocks.kind = "paper";
  const response = await finish();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Session not found" });
  expect(mocks.finish).not.toHaveBeenCalled();
});
it("keeps single checks on their own submission flow", async () => {
  mocks.kind = "single";
  expect((await finish()).status).toBe(409);
  expect(mocks.finish).not.toHaveBeenCalled();
});
