// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  spend: vi.fn(),
  auth: vi.fn(),
  mark: vi.fn(),
  cli: vi.fn(),
  beforeUpload: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/marking/engine", () => ({
  MARKER: { model: "gpt-6.1-sol" },
  markWritten: mocks.mark,
}));
vi.mock("../accuracy/eval", () => ({ loadEvalRuns: mocks.cli }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    rpc: mocks.spend,
    storage: {
      from: () => ({
        upload: async (
          path: string,
          body: string,
          options: { upsert: boolean },
        ) => {
          await mocks.beforeUpload(path, body);
          if (!options.upsert && mocks.files.has(path))
            return { error: { message: "Already exists" } };
          mocks.files.set(path, body);
          return { error: null };
        },
        download: async (path: string) =>
          mocks.files.has(path)
            ? { data: new Blob([mocks.files.get(path)!]), error: null }
            : {
                data: null,
                error: { message: "Object not found", statusCode: 404 },
              },
        remove: async (paths: string[]) => {
          paths.forEach((path) => mocks.files.delete(path));
          return { error: null };
        },
        list: async (
          prefix: string,
          options: { offset: number; limit: number },
        ) => ({
          error: null,
          data: [...mocks.files.keys()]
            .filter((path) => path.startsWith(prefix + "/"))
            .slice(options.offset, options.offset + options.limit)
            .map((path) => ({ name: path.slice(prefix.length + 1) })),
        }),
      }),
    },
  }),
}));
import {
  startEvalRun,
  stepEvalRun,
  cancelEvalRun,
  evalRunDialogData,
} from "./actions";
import {
  locked,
  readLease,
  LEASE_MS,
  loadBucketRuns,
  saveRun,
  readJson,
  type WebRun,
} from "./store";
import { mergeRuns } from "./summary";
import a1 from "@/lib/ai/eval/a1-eval-set.json";
const options = { model: "gpt-6.1-sol", effort: "low", blind: true } as const;
const result = {
  mark: 2,
  band: "band",
  check: { status: "agreed", marks: [2, 2] },
  feedback: {
    justification: "Test",
    comments: [],
    next_band: "Test",
    why_not_higher: "Test",
    better_answer_outline: [],
    validated: true,
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.clear();
  mocks.beforeUpload.mockReset();
  mocks.auth.mockResolvedValue({
    id: "admin",
    full_name: "Admin Name",
    role: "admin",
  });
  mocks.spend.mockResolvedValue({ data: 1, error: null });
  mocks.cli.mockResolvedValue([
    {
      meta: {
        stamp: "2026-10-09-0901",
        label: "CLI",
        marker: { model: options.model },
      },
      items: [{ mark: 2, expected: 2, usd: 0.01 }],
    },
  ]);
  mocks.mark.mockImplementation(async (_q, _a, _u, _t, config) => {
    config.onUsage(0.02);
    return result;
  });
});
it("starts the fixed 18-item run and stores admin attribution and selected config", async () => {
  const run = await startEvalRun(options);
  expect(run).toMatchObject({ status: "running", total: 18, done: 0 });
  const stored = JSON.parse(mocks.files.get(`runs/${run.id}.json`)!);
  expect(stored.meta).toMatchObject({
    by: "Admin Name",
    marker: { model: options.model, effort: "low" },
    estimatedCost: 0.18,
  });
  expect(mocks.mark).not.toHaveBeenCalled();
});
it.each([80, 90, 79.9])(
  "blocks start at spend %s without a call",
  async (spent) => {
    mocks.spend.mockResolvedValue({ data: spent });
    await expect(startEvalRun(options)).rejects.toThrow(/limit|exceeds/);
    expect(mocks.mark).not.toHaveBeenCalled();
    expect(
      [...mocks.files.keys()].filter((path) => path.startsWith("runs/")),
    ).toHaveLength(0);
  },
);
it.each([null, NaN])("fails closed for invalid spend %s", async (data) => {
  mocks.spend.mockResolvedValue({ data });
  await expect(startEvalRun(options)).rejects.toThrow("Cannot verify");
});
it("blocks a second running run, including concurrent starts", async () => {
  const results = await Promise.allSettled([
    startEvalRun(options),
    startEvalRun(options),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(startEvalRun(options)).rejects.toThrow("already running");
});
it.each(["start", "step", "cancel", "dialog"])(
  "requires admin for %s",
  async (action) => {
    mocks.auth.mockRejectedValue(new Error("Admin only"));
    const fn = {
      start: () => startEvalRun(options),
      step: () => stepEvalRun("x"),
      cancel: () => cancelEvalRun("x"),
      dialog: evalRunDialogData,
    }[action];
    await expect(fn!()).rejects.toThrow("Admin only");
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(mocks.mark).not.toHaveBeenCalled();
  },
);
it("marks exactly one item with task eval, then stores score, check, time and actual cost", async () => {
  const run = await startEvalRun(options);
  expect(await stepEvalRun(run.id)).toMatchObject({
    done: 1,
    status: "running",
  });
  expect(mocks.mark).toHaveBeenCalledTimes(1);
  expect(mocks.mark).toHaveBeenCalledWith(
    expect.objectContaining({ id: a1[0].questionId }),
    a1[0].studentResponse,
    null,
    "eval",
    expect.objectContaining(options),
  );
  const stored = JSON.parse(mocks.files.get(`runs/${run.id}.json`)!);
  expect(stored.items[0]).toMatchObject({
    exampleId: a1[0].questionId,
    feedbackComments: result.feedback.comments,
    usd: 0.02,
    mark: 2,
    score: { delta: expect.any(Number) },
    check: result.check,
    seconds: expect.any(Number),
  });
});
it("never marks either excluded fixture and completes after 18 client steps", async () => {
  const run = await startEvalRun(options);
  for (let i = 0; i < 18; i++) await stepEvalRun(run.id);
  expect(mocks.mark.mock.calls.map((call) => call[0].id)).toEqual(
    a1
      .filter((i) => !["fm-1", "ei-4"].includes(i.questionId))
      .map((i) => i.questionId),
  );
  expect(await stepEvalRun(run.id)).toMatchObject({
    status: "completed",
    done: 18,
  });
  expect(mocks.mark).toHaveBeenCalledTimes(18);
});
it.each([80, 79.9])(
  "rechecks spend and estimate at every step: %s",
  async (data) => {
    const run = await startEvalRun(options);
    mocks.spend.mockResolvedValue({ data });
    expect(await stepEvalRun(run.id)).toMatchObject({
      status: "failed",
      done: 0,
    });
    expect(mocks.mark).not.toHaveBeenCalled();
  },
);
it("rejects duplicate steps while one item is in flight", async () => {
  const run = await startEvalRun(options);
  let finish!: () => void;
  mocks.mark.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(result);
      }),
  );
  const first = stepEvalRun(run.id);
  await vi.waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(1));
  await expect(stepEvalRun(run.id)).rejects.toThrow("Already exists");
  finish();
  await first;
});
it("cancel stops calls and is idempotent", async () => {
  const run = await startEvalRun(options);
  expect(await cancelEvalRun(run.id)).toMatchObject({ status: "cancelled" });
  await cancelEvalRun(run.id);
  await stepEvalRun(run.id);
  expect(mocks.mark).not.toHaveBeenCalled();
});
it("cancel during a step preserves its completed item and blocks a new run until it settles", async () => {
  const run = await startEvalRun(options);
  let finish!: () => void;
  mocks.mark.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(result);
      }),
  );
  const step = stepEvalRun(run.id);
  await vi.waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(1));
  await cancelEvalRun(run.id);
  await expect(startEvalRun(options)).rejects.toThrow("already running");
  finish();
  expect(await step).toMatchObject({ status: "cancelled", done: 1 });
  await stepEvalRun(run.id);
  expect(mocks.mark).toHaveBeenCalledTimes(1);
});
it("interrupted runs appear in the merged list and do not block a new start", async () => {
  const run = await startEvalRun(options);
  const path = `runs/${run.id}.json`;
  const stored = JSON.parse(mocks.files.get(path)!);
  stored.meta.updatedAt = new Date(Date.now() - 16 * 60_000).toISOString();
  mocks.files.set(path, JSON.stringify(stored));
  const rows = mergeRuns(await mocks.cli(), await loadBucketRuns());
  expect(rows[0]).toMatchObject({
    by: "Admin Name",
    status: "interrupted",
    web: true,
  });
  expect(rows[1].by).toBe("CLI");
  expect(await stepEvalRun(run.id)).toMatchObject({ status: "interrupted" });
  await startEvalRun(options);
  expect(mocks.mark).not.toHaveBeenCalled();
});
it("records item failure without scoring a zero", async () => {
  const run = await startEvalRun(options);
  mocks.mark.mockRejectedValue(new Error("Mock failure"));
  expect(await stepEvalRun(run.id)).toMatchObject({
    status: "failed",
    done: 1,
    error: "Mock failure",
  });
  const stored = JSON.parse(mocks.files.get(`runs/${run.id}.json`)!);
  expect(stored.items[0].mark).toBeNull();
  expect(stored.items[0].score).toBeUndefined();
});

it("times out a stalled spend guard and persists failure without marking", async () => {
  const run = await startEvalRun(options);
  mocks.spend.mockReturnValue(new Promise(() => {}));
  vi.useFakeTimers();
  try {
    const step = stepEvalRun(run.id);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await step).toMatchObject({
      status: "failed",
      done: 0,
      error: "Eval I/O deadline exceeded",
    });
    const stored = JSON.parse(mocks.files.get(`runs/${run.id}.json`)!);
    expect(stored.meta.status).toBe("failed");
    expect(mocks.mark).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it("rejects arbitrary sets and models, and exposes budget/default/estimates without marking", async () => {
  await expect(
    startEvalRun({ ...options, model: "other" } as never),
  ).rejects.toThrow();
  await expect(
    startEvalRun({ ...options, count: 1 } as never),
  ).rejects.toThrow();
  expect(await evalRunDialogData()).toMatchObject({
    spent: 1,
    remaining: 79,
    defaultModel: options.model,
    running: false,
  });
  expect(mocks.mark).not.toHaveBeenCalled();
});

it("persists unlogged usage and adds it to dialog, start and step spend guards", async () => {
  const run = await startEvalRun(options);
  mocks.mark.mockImplementation(async (_q, _a, _u, _t, config) => {
    config.onUsage(1);
    config.onUnloggedUsage(1);
    throw new Error("Eval usage logging failed");
  });
  await stepEvalRun(run.id);
  const stored = JSON.parse(mocks.files.get(`runs/${run.id}.json`)!);
  expect(stored.meta.unloggedUsd).toBe(1);
  expect(stored.items[0].usd).toBe(1);
  mocks.spend.mockResolvedValue({ data: 79, error: null });
  expect(await evalRunDialogData()).toMatchObject({ spent: 80, remaining: 0 });
  await expect(startEvalRun(options)).rejects.toThrow("limit");
  stored.meta.status = "running";
  mocks.files.set(`runs/${run.id}.json`, JSON.stringify(stored));
  expect(await stepEvalRun(run.id)).toMatchObject({
    status: "failed",
    done: 1,
  });
  expect(mocks.mark).toHaveBeenCalledTimes(1);
});
it("takes over an abandoned expired lease and never releases the successor", async () => {
  const path = "locks/abandoned.json";
  mocks.files.set(
    path,
    JSON.stringify({
      owner: "abandoned",
      expiresAt: new Date(Date.now() - 1).toISOString(),
    }),
  );
  let finish!: () => void;
  const old = locked(
    path,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await vi.waitFor(async () =>
    expect((await readLease(path))?.owner).not.toBe("abandoned"),
  );
  await expect(locked(path, async () => {})).rejects.toThrow("Already exists");
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + LEASE_MS + 1);
  let finishNew!: () => void;
  const successor = locked(
    path,
    () =>
      new Promise<void>((resolve) => {
        finishNew = resolve;
      }),
  );
  await vi.waitFor(() => expect(finishNew).toBeTypeOf("function"));
  const owner = (await readLease(path))!.owner;
  finish();
  await old;
  expect((await readLease(path))!.owner).toBe(owner);
  await expect(locked(path, async () => {})).rejects.toThrow("Already exists");
  finishNew();
  await successor;
  now.mockRestore();
});
it.each([false, true])(
  "saves a deadline error and continues even when the provider resolves after abort (late success: %s)",
  async (lateSuccess) => {
    const run = await startEvalRun(options);
    vi.useFakeTimers();
    try {
      mocks.mark.mockImplementationOnce(
        (_q, _a, _u, _t, config) =>
          new Promise((resolve, reject) => {
            expect(config.timeoutMs).toBe(60_000);
            config.onUsage(0.02);
            config.signal.addEventListener(
              "abort",
              () =>
                lateSuccess ? resolve(result) : reject(config.signal.reason),
              { once: true },
            );
          }),
      );
      const step = stepEvalRun(run.id);
      await vi.advanceTimersByTimeAsync(240_000);
      expect(await step).toMatchObject({ done: 1, status: "running" });
      const stored = JSON.parse(mocks.files.get(`runs/${run.id}.json`)!);
      expect(stored.items[0]).toMatchObject({
        error: "Eval step deadline exceeded",
        mark: null,
        usd: 0.02,
      });
      expect(await stepEvalRun(run.id)).toMatchObject({
        done: 2,
        status: "running",
      });
    } finally {
      vi.useRealTimers();
    }
  },
);

it("retains the lease after a timed-out upload so late progress cannot overwrite a later step", async () => {
  const run = await startEvalRun(options);
  const path = `runs/${run.id}.json`;
  let finish!: () => void;
  mocks.beforeUpload
    .mockImplementationOnce(() => {})
    .mockImplementationOnce((uploadPath) => {
      expect(uploadPath).toBe(path);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
  vi.useFakeTimers();
  try {
    const step = stepEvalRun(run.id);
    const rejected = expect(step).rejects.toThrow("Eval I/O deadline exceeded");
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(
      Date.parse((await readLease(`locks/${run.id}.json`))!.expiresAt),
    ).toBeGreaterThan(Date.now());
    await expect(stepEvalRun(run.id)).rejects.toThrow("Already exists");
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(mocks.files.get(path)!)).toMatchObject({
      version: 2,
      items: [expect.anything()],
    });
    await expect(stepEvalRun(run.id)).rejects.toThrow("Already exists");
    await vi.advanceTimersByTimeAsync(LEASE_MS);
    expect(await stepEvalRun(run.id)).toMatchObject({ done: 2 });
    expect(JSON.parse(mocks.files.get(path)!)).toMatchObject({ version: 3 });
  } finally {
    vi.useRealTimers();
  }
});
it("rejects stale and equal run versions, including an expired lease holder", async () => {
  const run = await startEvalRun(options);
  const path = `runs/${run.id}.json`;
  const stale = (await readJson<WebRun>(path))!;
  const latest = (await readJson<WebRun>(path))!;
  await saveRun(latest);
  await expect(saveRun(stale)).rejects.toThrow("newer run version");
  const older = { ...stale, version: 0 };
  await expect(saveRun(older)).rejects.toThrow("newer run version");
  expect(JSON.parse(mocks.files.get(path)!)).toMatchObject({ version: 2 });
});
