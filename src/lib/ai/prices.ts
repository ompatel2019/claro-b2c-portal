// USD per 1M tokens, OpenAI standard tier (developers.openai.com/api/docs/pricing, checked 9 Oct 2026).
// Fast (priority) processing costs 2x standard.
export const PRICES = {
  "gpt-6-astra": { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, cacheWrite: 2.5, output: 10 },
  "gpt-6-luna": {
    input: 0.1,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    output: 0.5,
  },
} as const;

export type Model = keyof typeof PRICES;

/** Strong model for marking and handwriting; cheap model for bulk and simple work. */
export const MODELS = {
  strong: "gpt-6.1-sol",
  cheap: "gpt-6-luna",
} as const satisfies Record<string, Model>;

export const BUDGET_USD = 90;
export const EVAL_BLOCK_USD = 80;

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  } | null;
};

export function costUsd(model: Model, usage: Usage, fast = false): number {
  const p = PRICES[model];
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const written = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
  const fresh = Math.max(0, usage.prompt_tokens - cached - written);
  const usd =
    (fresh * p.input +
      cached * p.cachedInput +
      written * p.cacheWrite +
      usage.completion_tokens * p.output) /
    1e6;
  return Math.round(usd * (fast ? 2 : 1) * 1e6) / 1e6;
}
