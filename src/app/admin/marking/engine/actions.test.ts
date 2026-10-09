// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  cached: new Map<string, string>(),
  download: vi.fn(),
  list: vi.fn(),
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
        download: mocks.download,
        remove: async (paths: string[]) => {
          paths.forEach((path) => mocks.files.delete(path));
          return { error: null };
        },
        list: mocks.list,
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
  writeJson,
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
  mocks.cached.clear();
  mocks.download.mockReset();
  mocks.download.mockImplementation(
    async (path: string, options?: { cacheNonce?: string }) => {
      // CDN entries survive upserts; only a new nonce reads the current body.
      const key = JSON.stringify([path, options?.cacheNonce]);
      const body = mocks.cached.get(key) ?? mocks.files.get(path);
      if (body === undefined)
        return {
          data: null,
          error: { message: "Object not found", statusCode: 404 },
        };
      mocks.cached.set(key, body);
      return { data: new Blob([body]), error: null };
    },
  );
  mocks.list.mockReset();
  mocks.list.mockImplementation(
    async (
      prefix: string,
      options: { offset: number; limit: number; search?: string },
    ) => ({
      error: null,
      data: [...mocks.files.keys()]
        .filter((path) => path.startsWith(prefix + "/"))
        .map((path) => ({ name: path.slice(prefix.length + 1) }))
        .filter(
          (file) => !options.search || file.name.startsWith(options.search),
        )
        .slice(options.offset, options.offset + options.limit),
    }),
  );
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
it("loads each page's runs, then running cancel markers, in parallel and listing order", async () => {
  const started = await startEvalRun(options);
  const run = JSON.parse(mocks.files.get(`runs/${started.id}.json`)!);
  mocks.list.mockResolvedValue({
    data: [
      "first.json",
      "ignored.txt",
      "missing.json",
      "second.json",
      "done.json",
    ].map((name) => ({ name })),
    error: null,
  });
  const pending = new Map<string, (value: unknown) => void>();
  mocks.download.mockReset();
  mocks.download.mockImplementation(
    (path: string) => new Promise((resolve) => pending.set(path, resolve)),
  );
  const resolve = (path: string, value: unknown) =>
    pending.get(path)!({
      data: value === null ? null : new Blob([JSON.stringify(value)]),
      error:
        value === null
          ? { message: "Object not found", statusCode: 404 }
          : null,
    });
  const loading = loadBucketRuns();
  await vi.waitFor(() => expect(pending.size).toBe(4));
  expect([...pending.keys()]).toEqual([
    "runs/first.json",
    "runs/missing.json",
    "runs/second.json",
    "runs/done.json",
  ]);
  resolve("runs/second.json", { ...run, meta: { ...run.meta, id: "second" } });
  resolve("runs/done.json", {
    ...run,
    meta: { ...run.meta, id: "done", status: "completed" },
  });
  resolve("runs/missing.json", null);
  // No cancellation checks until all run files have downloaded.
  await new Promise((resolve) => setImmediate(resolve));
  expect(pending.size).toBe(4);
  resolve("runs/first.json", { ...run, meta: { ...run.meta, id: "first" } });
  await vi.waitFor(() => expect(pending.size).toBe(6));
  expect([...pending.keys()].slice(4)).toEqual([
    "cancel/first.json",
    "cancel/second.json",
  ]);
  resolve("cancel/second.json", { at: "2026-10-10T00:00:00Z" });
  resolve("cancel/first.json", null);
  const runs = await loading;
  expect(runs.map((r) => [r.meta.id, r.meta.status])).toEqual([
    ["first", "running"],
    ["second", "cancelled"],
    ["done", "completed"],
  ]);
  expect(runs[1].meta.finishedAt).toBe("2026-10-10T00:00:00Z");
  const before = JSON.stringify(runs);
  mergeRuns([], runs);
  expect(JSON.stringify(runs)).toBe(before);
});
it("paginates using the listing size even when all files are filtered out", async () => {
  mocks.list
    .mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, i) => ({ name: `${i}.txt` })),
      error: null,
    })
    .mockResolvedValueOnce({ data: [{ name: "missing.json" }], error: null });
  expect(await loadBucketRuns()).toEqual([]);
  expect(mocks.list.mock.calls).toEqual([
    ["runs", { limit: 100, offset: 0 }],
    ["runs", { limit: 100, offset: 100 }],
  ]);
  expect(mocks.download).toHaveBeenCalledTimes(1);
});
it.each(["listing", "run", "cancel"])(
  "propagates %s storage errors",
  async (phase) => {
    const run = await startEvalRun(options);
    const error = { message: "Storage unavailable", statusCode: 500 };
    if (phase === "listing")
      mocks.list.mockResolvedValue({ data: null, error });
    else {
      const download = mocks.download.getMockImplementation()!;
      const failing =
        phase === "run" ? `runs/${run.id}.json` : `cancel/${run.id}.json`;
      mocks.download.mockImplementation((path, options) =>
        path === failing
          ? Promise.resolve({ data: null, error })
          : download(path, options),
      );
    }
    await expect(loadBucketRuns()).rejects.toThrow("Storage unavailable");
  },
);
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
it("saves two sequential steps through a stale CDN with fresh nonces", async () => {
  const run = await startEvalRun(options);
  const path = `runs/${run.id}.json`;
  expect(JSON.parse(mocks.files.get(path)!)).toMatchObject({ version: 1 });
  // Prime the unbusted URL with the same v1 that the first step reads.
  await mocks.download(path);
  expect(await stepEvalRun(run.id)).toMatchObject({ done: 1 });
  expect(JSON.parse(mocks.files.get(path)!)).toMatchObject({ version: 2 });
  const stale = await mocks.download(path);
  const staleRun = JSON.parse(await stale.data.text()) as WebRun;
  expect(staleRun).toMatchObject({ version: 1, items: [] });
  // The stale second-step read would attempt v2 and hit the unchanged guard.
  await expect(saveRun(staleRun)).rejects.toThrow("newer run version");
  expect(await stepEvalRun(run.id)).toMatchObject({ done: 2 });
  const stored = JSON.parse(mocks.files.get(path)!);
  expect(stored.version).toBe(3);
  expect(stored.items).toHaveLength(2);
  expect(mocks.mark).toHaveBeenCalledTimes(2);
  // Only the two deliberate CDN probes above may omit a nonce.
  expect(
    mocks.download.mock.calls.filter((call) => call.length === 1),
  ).toHaveLength(2);
  const nonces = mocks.download.mock.calls
    .filter((call) => call.length > 1)
    .map(([, options]) => options?.cacheNonce);
  expect(nonces.length).toBeGreaterThan(0);
  expect(
    nonces.every((nonce) => typeof nonce === "string" && nonce.length > 0),
  ).toBe(true);
  expect(new Set(nonces).size).toBe(nonces.length);
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
function legacyChain(base: string, count = 20) {
  let path = base;
  for (let i = 0; i < count; i++) {
    mocks.files.set(
      path,
      JSON.stringify({
        owner: `legacy-${i}`,
        expiresAt: new Date(0).toISOString(),
      }),
    );
    path = `${base}.legacy-${i}`;
  }
  return path;
}
it("reads a 20-file legacy chain with one listing and parallel downloads", async () => {
  const base = "locks/legacy.json";
  legacyChain(base);
  const download = mocks.download.getMockImplementation()!;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.download.mockImplementation(async (...args) => {
    await pending;
    return download(...args);
  });
  const head = readLease(base);
  await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(20));
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith("locks", {
    limit: 1000,
    offset: 0,
    search: "legacy.json",
  });
  finish();
  expect(await head).toMatchObject({ owner: "legacy-19" });
  expect(mocks.download).toHaveBeenCalledTimes(20);
});
it("acquires the successor after a long legacy chain", async () => {
  const base = "locks/legacy.json";
  const successor = legacyChain(base);
  await locked(base, async () => {
    expect(mocks.files.has(successor)).toBe(true);
    expect(Date.parse((await readLease(base))!.expiresAt)).toBeGreaterThan(
      Date.now(),
    );
  });
  expect(mocks.files.size).toBe(21);
  expect(JSON.parse(mocks.files.get(successor)!)).toMatchObject({
    expiresAt: new Date(0).toISOString(),
  });
});
it("ignores unrelated locks with similar prefixes", async () => {
  const base = "locks/id.json";
  legacyChain(base, 1);
  for (const path of ["locks/id.jsonx", "locks/id-other.json"]) {
    mocks.files.set(
      path,
      JSON.stringify({
        owner: "unrelated",
        expiresAt: new Date(Date.now() + LEASE_MS).toISOString(),
      }),
    );
  }
  // Search only narrows results; exact filtering must work even for broad results.
  const list = mocks.list.getMockImplementation()!;
  mocks.list.mockImplementation((prefix, options) =>
    list(prefix, { ...options, search: undefined }),
  );
  expect(await readLease(base)).toMatchObject({ owner: "legacy-0" });
  expect(mocks.download.mock.calls.map(([path]) => path)).toEqual([base]);
});
it.each([false, true])(
  "treats a listed-but-deleted file as absent (base: %s)",
  async (deleteBase) => {
    const base = "locks/deleted.json";
    legacyChain(base, 2);
    const list = mocks.list.getMockImplementation()!;
    mocks.list.mockImplementation(async (...args) => {
      const result = await list(...args);
      mocks.files.delete(deleteBase ? base : `${base}.legacy-0`);
      return result;
    });
    expect(await readLease(base)).toEqual(
      deleteBase
        ? null
        : {
            owner: "legacy-0",
            expiresAt: new Date(0).toISOString(),
          },
    );
  },
);
it("paginates lock listings before reading the chain", async () => {
  const base = "locks/paginated.json";
  legacyChain(base, 1001);
  expect(await readLease(base)).toMatchObject({ owner: "legacy-1000" });
  expect(mocks.list.mock.calls).toEqual([
    ["locks", { limit: 1000, offset: 0, search: "paginated.json" }],
    ["locks", { limit: 1000, offset: 1000, search: "paginated.json" }],
  ]);
  expect(mocks.download).toHaveBeenCalledTimes(1001);
});
it("arbitrates concurrent acquirers with atomic create", async () => {
  const path = "locks/concurrent.json";
  const successor = legacyChain(path);
  let releaseUploads!: () => void;
  const uploads = new Promise<void>((resolve) => {
    releaseUploads = resolve;
  });
  mocks.beforeUpload.mockImplementation(() => uploads);
  const callback = vi.fn(async () => {});
  const results = Promise.allSettled([
    locked(path, callback),
    locked(path, callback),
  ]);
  await vi.waitFor(() => expect(mocks.beforeUpload).toHaveBeenCalledTimes(2));
  releaseUploads();
  const settled = await results;
  expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(settled.filter((r) => r.status === "rejected")).toEqual([
    expect.objectContaining({
      reason: expect.objectContaining({ message: "Already exists" }),
    }),
  ]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(
    mocks.beforeUpload.mock.calls.slice(0, 2).map(([path]) => path),
  ).toEqual([successor, successor]);
});
it("retains an uncertain lease even when the callback catches the timeout", async () => {
  const path = "locks/uncertain.json";
  mocks.beforeUpload.mockImplementation((uploadPath) => {
    if (uploadPath === "runs/stalled.json") return new Promise(() => {});
  });
  vi.useFakeTimers();
  try {
    const operation = locked(path, async () => {
      await expect(writeJson("runs/stalled.json", {})).rejects.toThrow(
        "Eval I/O deadline exceeded",
      );
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await operation;
    expect(mocks.files.has(path)).toBe(true);
    expect(Date.parse((await readLease(path))!.expiresAt)).toBeGreaterThan(
      Date.now(),
    );
  } finally {
    vi.useRealTimers();
  }
});
it.each(["completed", "failed", "running", "cancelled"] as const)(
  "dialog only checks potentially in-progress run locks: %s",
  async (status) => {
    const run = await startEvalRun(options);
    const path = `runs/${run.id}.json`;
    const stored = JSON.parse(mocks.files.get(path)!);
    stored.meta.status = status;
    // Stale running metadata must still check for an in-flight worker.
    stored.meta.updatedAt = new Date(Date.now() - 16 * 60_000).toISOString();
    mocks.files.set(path, JSON.stringify(stored));
    const lockPath = `locks/${run.id}.json`;
    mocks.files.set(
      lockPath,
      JSON.stringify({
        owner: "worker",
        expiresAt: new Date(Date.now() + LEASE_MS).toISOString(),
      }),
    );
    mocks.download.mockClear();
    const inProgress = status === "running" || status === "cancelled";
    expect(await evalRunDialogData()).toMatchObject({ running: inProgress });
    expect(
      mocks.download.mock.calls.some(([path]) => path.startsWith("locks/")),
    ).toBe(inProgress);
    if (inProgress)
      await expect(startEvalRun(options)).rejects.toThrow("already running");
    else
      await expect(startEvalRun(options)).resolves.toMatchObject({
        status: "running",
      });
  },
);
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
