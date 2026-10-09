// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  mark: vi.fn(),
  summary: vi.fn(),
  finish: vi.fn(),
  update: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: mocks.from }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "student" } } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: {
            kind: "paper",
            config: { sections: [], time_limit_min: 180, reading_min: 5 },
            started_at: new Date().toISOString(),
            finished_at: null,
          },
        }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/marking/engine", () => ({
  markAttempt: mocks.mark,
  summariseSession: mocks.summary,
  finishSession: mocks.finish,
  STALE_CLAIM_MS: 180000,
}));
import { POST } from "./route";
const question = {
  marks: 4,
  source: "Trial",
  stem: "Explain inflation",
  topic: { name: "Inflation" },
};
const row = {
  id: "answer",
  position: 1,
  status: "marked",
  check_status: "agreed",
  mark: 3,
  max_marks: 4,
  band: "3–4",
  question,
  feedback: {
    analysis: { strengths: ["Definition"] },
    missing_points: ["Causal link"],
  },
};
const finish = () =>
  POST(new Request("http://localhost/api", { method: "POST", body: "{}" }), {
    params: Promise.resolve({ id: "sit" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [{ ...row }];
  mocks.summary.mockResolvedValue({ strengths: ["Clear definitions"] });
  mocks.from.mockImplementation((table: string) => {
    const q = {
      select: () => q,
      eq: vi.fn(() => q),
      neq: () => q,
      order: () => q,
      update: mocks.update.mockReturnThis(),
      throwOnError: async () => ({
        data:
          table === "attempts"
            ? mocks.rows.filter((r) => r.status !== "skipped")
            : null,
      }),
    };
    // update must continue on the same query, retaining the ownership filters.
    q.update = mocks.update.mockReturnValue(q);
    return q;
  });
});
it("summarises settled marked rows, stores and returns the summary", async () => {
  mocks.rows.push(
    { ...row, id: "failed", status: "failed" },
    { ...row, id: "unchosen", status: "skipped" },
  );
  mocks.mark.mockRejectedValue(new Error("Cannot mark"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await finish();
  expect(response.status).toBe(200);
  expect(mocks.summary).toHaveBeenCalledExactlyOnceWith(
    [
      {
        source: "Trial",
        stem: question.stem,
        mark: 3,
        max: 4,
        band: "3–4",
        strengths: ["Definition"],
        improvements: ["Causal link"],
      },
    ],
    "student",
  );
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      score: 3,
      max_score: 8,
      summary: { strengths: ["Clear definitions"] },
    }),
  );
  expect(await response.json()).toMatchObject({
    summary: { strengths: ["Clear definitions"] },
    finished: true,
  });
  expect(mocks.finish).not.toHaveBeenCalled();
  log.mockRestore();
});
it("uses the deterministic topic summary when no marked answer has analysis", async () => {
  mocks.rows = [{ ...row, mark: 4, feedback: {} }];
  expect((await finish()).status).toBe(200);
  expect(mocks.summary).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      summary: expect.objectContaining({
        strengths: ["1/1 correct on Inflation."],
      }),
    }),
  );
});
it("finishes with a null summary if summary generation fails", async () => {
  mocks.summary.mockRejectedValue(new Error("Summary unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await finish();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    summary: null,
    finished: true,
  });
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ summary: null }),
  );
  log.mockRestore();
});
it("does not summarise when no successful marks exist", async () => {
  mocks.rows = [];
  expect((await finish()).status).toBe(200);
  expect(mocks.summary).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ summary: null }),
  );
});
it("waits for marking to settle before summarising the reread marks", async () => {
  mocks.rows = [{ ...row, status: "pending", mark: null, feedback: null }];
  mocks.mark.mockImplementation(async () => {
    mocks.rows = [{ ...row }];
  });
  await finish();
  expect(mocks.mark).toHaveBeenCalledWith("answer");
  expect(mocks.summary).toHaveBeenCalledWith(
    [expect.objectContaining({ mark: 3, strengths: ["Definition"] })],
    "student",
  );
  expect(mocks.mark.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.summary.mock.invocationCallOrder[0],
  );
});
