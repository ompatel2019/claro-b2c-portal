import { PRICES, EVAL_BLOCK_USD, type Model } from "@/lib/ai/prices";
import type { OfflineEvalRun } from "./summary";
export type RunOptions = {
  model: Model;
  effort: "low" | "medium" | "high";
  blind: boolean;
};
export const EVAL_CALL_MS = 60_000;
export const EVAL_STEP_MS = 240_000;
export const ITEM_COUNT = 18;
export const INTERRUPTED_MS = 15 * 60_000;
export function estimateRun(runs: OfflineEvalRun[], options: RunOptions) {
  const samples = (model: string) =>
    runs
      .filter((r) => r.meta.marker.model === model)
      .flatMap((r) =>
        r.items.filter(
          (i) =>
            i.mark != null &&
            !i.error &&
            !i.flags?.excluded &&
            Number.isFinite(i.usd) &&
            i.usd! > 0,
        ),
      );
  let items = samples(options.model);
  let basis = `Past ${options.model} marking results`;
  let scale = 1;
  if (!items.length) {
    items = samples("gpt-6.1-sol");
    scale =
      (PRICES[options.model].input + PRICES[options.model].output) /
      (PRICES["gpt-6.1-sol"].input + PRICES["gpt-6.1-sol"].output);
    if (options.model.startsWith("anthropic/")) scale /= 2;
    basis =
      "Past gpt-6.1-sol marking results, scaled by PRICES input/output rates (including priority pricing)";
  }
  const average = items.length
    ? (items.reduce((sum, i) => sum + i.usd!, 0) / items.length) * scale
    : ((4000 * PRICES[options.model].input +
        2000 * PRICES[options.model].output) /
        1e6) *
      (options.model.startsWith("anthropic/") ? 1 : 2) *
      3;
  if (!items.length)
    basis =
      "PRICES fallback: 4,000 input + 2,000 output tokens per pass, three passes, priority pricing for OpenAI";
  // Keep the full production average for Single too: conservative allowance for corrections/retries.
  return {
    average,
    total: ITEM_COUNT * average,
    basis: `${basis}; ${items.length} samples. Full blind-check average retained for Single; thinking and actual token use may vary.`,
  };
}
export function budgetReason(spent: number, estimate: number) {
  if (spent >= EVAL_BLOCK_USD) return "Eval spend limit reached ($80).";
  if (spent + estimate > EVAL_BLOCK_USD)
    return "Estimated run cost exceeds the remaining $80 eval budget.";
  return null;
}
