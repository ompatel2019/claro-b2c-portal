"use server";
import { bounded } from "@/lib/ai/eval/deadline";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { admin } from "@/utils/supabase/admin";
import { MARKER } from "@/lib/marking/engine";
import { PRICES, EVAL_BLOCK_USD } from "@/lib/ai/prices";
import a1 from "@/lib/ai/eval/a1-eval-set.json";
import questions from "@/lib/ai/eval/a1-questions.json";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { excluded, emptyRow, markEvalItem } from "@/lib/ai/eval/item";
import { loadEvalRuns } from "../accuracy/eval";
import {
  budgetReason,
  estimateRun,
  INTERRUPTED_MS,
  EVAL_CALL_MS,
  EVAL_STEP_MS,
  type RunOptions,
} from "./run-config";
import {
  locked,
  leaseActive,
  readLease,
  unloggedSpend,
  loadBucketRuns,
  readJson,
  writeJson,
  runPath,
  saveRun,
  type WebRun,
} from "./store";
const optionsSchema = z.strictObject({
  model: z.enum(
    Object.keys(PRICES) as [keyof typeof PRICES, ...Array<keyof typeof PRICES>],
  ),
  effort: z.enum(["low", "medium", "high"]),
  blind: z.boolean(),
});
const items = a1.filter((i) => !excluded[i.questionId]);
async function spend(signal?: AbortSignal) {
  const { data, error } = await bounded(admin().rpc("ai_spend"), signal);
  if (error || data == null || !Number.isFinite(Number(data)))
    throw new Error("Cannot verify AI spend.");
  return Number(data) + (await bounded(unloggedSpend(), signal));
}
const active = (r: WebRun) =>
  r.meta.status === "running" &&
  Date.now() - Date.parse(r.meta.updatedAt) < INTERRUPTED_MS;
async function hasRunningRun(runs: WebRun[]) {
  if (runs.some(active)) return true;
  const locks = await Promise.all(
    runs
      .filter((r) => !["completed", "failed"].includes(r.meta.status))
      .map((r) => readLease(`locks/${r.meta.id}.json`)),
  );
  return locks.some(leaseActive);
}
const progress = (r: WebRun) => ({
  id: r.meta.id,
  status: r.meta.status,
  done: r.items.length,
  total: items.length,
  error: r.meta.error,
});
async function getRun(id: string, signal?: AbortSignal) {
  z.uuid().parse(id);
  const run = await bounded(readJson<WebRun>(runPath(id)), signal);
  if (!run) throw new Error("Run not found.");
  return run;
}
export async function evalRunDialogData() {
  await requireAdmin();
  const [spent, cli, runs] = await Promise.all([
    spend(),
    loadEvalRuns(),
    loadBucketRuns(),
  ]);
  const options: RunOptions = {
    model: MARKER.model,
    effort: "low",
    blind: true,
  };
  return {
    spent,
    remaining: Math.max(0, EVAL_BLOCK_USD - spent),
    defaultModel: MARKER.model,
    estimates: Object.fromEntries(
      Object.keys(PRICES).map((model) => [
        model,
        estimateRun(cli, { ...options, model: model as RunOptions["model"] }),
      ]),
    ) as Record<RunOptions["model"], ReturnType<typeof estimateRun>>,
    running: await hasRunningRun(runs),
  };
}
export async function startEvalRun(input: RunOptions) {
  const profile = await requireAdmin();
  const options = optionsSchema.parse(input);
  return locked("locks/start.json", async () => {
    const runs = await loadBucketRuns();
    if (await hasRunningRun(runs))
      throw new Error("An eval run is already running.");
    const estimate = estimateRun(await loadEvalRuns(), options);
    const reason = budgetReason(await spend(), estimate.total);
    if (reason) throw new Error(reason);
    const now = new Date().toISOString();
    const id = randomUUID();
    const run: WebRun = {
      meta: {
        id,
        stamp: now,
        label: "A1 20-answer set (18 eligible items)",
        startedAt: now,
        updatedAt: now,
        status: "running",
        by: profile.full_name || "Admin",
        marker: { model: options.model, effort: options.effort },
        options,
        estimatedCost: estimate.total,
      },
      items: [],
    };
    await saveRun(run, false);
    return progress(run);
  });
}
export async function stepEvalRun(id: string) {
  const controller = new AbortController();
  // Start before authentication, lock acquisition and spend guards. The 300s
  // request budget leaves time for the final save and lease release after 240s.
  const timer = setTimeout(
    () => controller.abort(new Error("Eval step deadline exceeded")),
    EVAL_STEP_MS,
  );
  try {
    await bounded(requireAdmin(), controller.signal);
    z.uuid().parse(id);
    return await locked(
      `locks/${id}.json`,
      async () => {
        const run = await getRun(id, controller.signal);
        if (!active(run))
          return {
            ...progress(run),
            status:
              run.meta.status === "running" ? "interrupted" : run.meta.status,
          };
        try {
          // Reserve the complete original estimate on every step, conservatively.
          const reason = budgetReason(
            await spend(controller.signal),
            run.meta.estimatedCost,
          );
          if (reason) throw new Error(reason);
          if (await bounded(readJson(`cancel/${id}.json`), controller.signal)) {
            run.meta.status = "cancelled";
          } else {
            const item = items[run.items.length];
            if (!item) throw new Error("No item remaining.");
            const q = (questions as MarkableQuestion[]).find(
              (q) => q.id === item.questionId,
            );
            if (!q) throw new Error("Missing A1 question.");
            const row = emptyRow({
              id: item.questionId,
              section: "A1",
              label: "",
              expected: item.karanExpectedMark,
              q,
            });
            let usd = 0;
            try {
              await markEvalItem(
                row,
                q,
                item.studentResponse,
                "eval",
                async () => usd,
                {
                  ...run.meta.options,
                  signal: controller.signal,
                  timeoutMs: EVAL_CALL_MS,
                  onUnloggedUsage: (cost) => {
                    run.meta.unloggedUsd = (run.meta.unloggedUsd ?? 0) + cost;
                  },
                  onUsage: (cost) => {
                    usd += cost;
                  },
                },
              );
              controller.signal.throwIfAborted();
            } catch (error) {
              row.error =
                error instanceof Error ? error.message : String(error);
              if (!controller.signal.aborted) throw error;
            } finally {
              run.items.push(row);
            }
            if (
              !controller.signal.aborted &&
              (await bounded(readJson(`cancel/${id}.json`), controller.signal))
            )
              run.meta.status = "cancelled";
            else if (run.items.length === items.length)
              run.meta.status = "completed";
          }
        } catch (error) {
          run.meta.status = "failed";
          run.meta.error =
            error instanceof Error ? error.message : String(error);
        }
        run.meta.updatedAt = new Date().toISOString();
        if (run.meta.status !== "running")
          run.meta.finishedAt = run.meta.updatedAt;
        await saveRun(run);
        return progress(run);
      },
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function cancelEvalRun(id: string) {
  await requireAdmin();
  const run = await getRun(id);
  if (run.meta.status !== "running") return progress(run);
  await writeJson(`cancel/${id}.json`, { at: new Date().toISOString() });
  // Use the same item lock to avoid overwriting saved progress. The durable marker
  // also makes cancellation visible if the worker dies before its final save.
  try {
    return await locked(`locks/${id}.json`, async () => {
      const latest = await getRun(id);
      latest.meta.status = "cancelled";
      latest.meta.finishedAt = new Date().toISOString();
      await saveRun(latest);
      return progress(latest);
    });
  } catch (error) {
    const lock = await readLease(`locks/${id}.json`);
    if (!leaseActive(lock)) throw error;
    return { ...progress(run), status: "cancelled" as const };
  }
}
