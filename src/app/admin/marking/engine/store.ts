import "server-only";
import { bounded } from "@/lib/ai/eval/deadline";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { admin } from "@/utils/supabase/admin";
import type { OfflineEvalRun } from "./summary";
import type { Row } from "@/lib/ai/eval/report";
import type { RunOptions } from "./run-config";
export type WebRun = OfflineEvalRun & {
  /** Legacy run files start at version zero. Every save writes a version. */
  version?: number;
  meta: {
    id: string;
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
    status: "running" | "completed" | "cancelled" | "failed";
    by: string;
    options: RunOptions;
    estimatedCost: number;
    error?: string;
    unloggedUsd?: number;
  };
  items: Row[];
};
const bucket = () => admin().storage.from("evals");
export async function readJson<T>(path: string): Promise<T | null> {
  const { data, error } = await bounded(
    bucket().download(path, { cacheNonce: randomUUID() }),
  );
  if (error) {
    if (
      String(error.statusCode) === "404" ||
      error.message === "Object not found"
    )
      return null;
    throw new Error(error.message);
  }
  return JSON.parse(await bounded(data.text())) as T;
}
// Track uncertainty even if the callback catches the timeout and returns normally.
const mutations = new AsyncLocalStorage<{ uncertain: boolean }>();
async function mutate<T>(operation: PromiseLike<T>) {
  let settled = false;
  const pending = Promise.resolve(operation).finally(() => {
    settled = true;
  });
  try {
    return await bounded(pending);
  } catch (error) {
    const context = mutations.getStore();
    if (!settled && context) context.uncertain = true;
    throw error;
  }
}
export async function saveRun(run: WebRun, upsert = true) {
  const version = (run.version ?? 0) + 1;
  const stored = await readJson<WebRun>(runPath(run.meta.id));
  if (stored && (stored.version ?? 0) >= version)
    throw new Error("Refusing to overwrite a newer run version.");
  run.version = version;
  await writeJson(runPath(run.meta.id), run, upsert);
}
export async function writeJson(path: string, value: unknown, upsert = true) {
  const { error } = await mutate(
    bucket().upload(path, JSON.stringify(value), {
      contentType: "application/json",
      upsert,
    }),
  );
  if (error) throw new Error(error.message);
}
export async function remove(path: string) {
  const { error } = await mutate(bucket().remove([path]));
  if (error) throw new Error(error.message);
}
export const LEASE_MS = 10 * 60_000;
export type Lease = { owner: string; expiresAt: string };
export const leaseActive = (lease: Lease | null) =>
  !!lease && Date.parse(lease.expiresAt) > Date.now();
/** Immutable successor paths let atomic create arbitrate expired-lease takeover. */
async function leaseHead(
  base: string,
): Promise<{ path: string; lease: Lease | null }> {
  const slash = base.lastIndexOf("/");
  const dir = base.slice(0, slash);
  const baseName = base.slice(slash + 1);
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bounded(
      bucket().list(dir, { limit: 1000, offset, search: baseName }),
    );
    if (error) throw new Error(error.message);
    for (const file of data ?? []) {
      if (file.name === baseName || file.name.startsWith(`${baseName}.`))
        paths.push(`${dir}/${file.name}`);
    }
    if (!data || data.length < 1000) break;
  }
  const leases = new Map(
    await Promise.all(
      paths.map(async (path) => [path, await readJson<Lease>(path)] as const),
    ),
  );
  let path = base;
  let lease = leases.get(path) ?? null;
  while (lease) {
    const nextPath = `${base}.${lease.owner}`;
    const next = leases.get(nextPath);
    if (!next) break;
    path = nextPath;
    lease = next;
  }
  // A successor created after listing makes the caller's atomic create fail.
  return { path, lease };
}
export async function readLease(path: string) {
  return (await leaseHead(path)).lease;
}
export async function locked<T>(
  path: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
) {
  const head = await bounded(leaseHead(path), signal);
  if (leaseActive(head.lease)) throw new Error("Already exists: active lease");
  const leasePath = head.lease ? `${path}.${head.lease.owner}` : path;
  const lease: Lease = {
    owner: randomUUID(),
    expiresAt: new Date(Date.now() + LEASE_MS).toISOString(),
  };
  await bounded(writeJson(leasePath, lease, false), signal);
  const context = { uncertain: false };
  try {
    return await mutations.run(context, fn);
  } finally {
    // This owner's record is never reused. Expiring it cannot release a successor.
    // A timed-out mutation may still land; keep later workers out until expiry.
    if (!context.uncertain)
      await writeJson(leasePath, {
        ...lease,
        expiresAt: new Date(0).toISOString(),
      });
  }
}
export async function unloggedSpend() {
  return (await loadBucketRuns()).reduce(
    (sum, run) => sum + (run.meta.unloggedUsd ?? 0),
    0,
  );
}
export async function loadBucketRuns() {
  const runs: WebRun[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bounded(
      bucket().list("runs", { limit: 100, offset }),
    );
    if (error) throw new Error(error.message);
    const page = await Promise.all(
      (data ?? [])
        .filter((file) => file.name.endsWith(".json"))
        .map((file) => readJson<WebRun>(`runs/${file.name}`)),
    );
    await Promise.all(
      page.map(async (run) => {
        if (!run) return;
        if (run.meta.status === "running") {
          const cancelled = await readJson<{ at: string }>(
            `cancel/${run.meta.id}.json`,
          );
          if (cancelled) {
            run.meta.status = "cancelled";
            run.meta.finishedAt = cancelled.at;
          }
        }
      }),
    );
    for (const run of page) if (run) runs.push(run);
    if (!data || data.length < 100) return runs;
  }
}
export const runPath = (id: string) => `runs/${id}.json`;
