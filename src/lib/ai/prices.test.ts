// @vitest-environment node
import { expect, it } from "vitest";
import { costUsd, MODELS } from "./prices";

it("prices fresh and cached input tokens separately", () => {
  expect(
    costUsd(MODELS.strong, { prompt_tokens: 1000, completion_tokens: 100 }),
  ).toBe(0.003);
  expect(
    costUsd(MODELS.strong, {
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 600 },
    }),
  ).toBe(0.00186);
});

it("accounts for cache writes and clamps fresh tokens", () => {
  expect(
    costUsd(MODELS.strong, {
      prompt_tokens: 1000,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
    }),
  ).toBe(0.00177);
  expect(
    costUsd(MODELS.strong, {
      prompt_tokens: 0,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 10 },
    }),
  ).toBe(0.000001);
});

it("rounds to six decimal places", () => {
  expect(
    costUsd(MODELS.cheap, { prompt_tokens: 1, completion_tokens: 1 }),
  ).toBe(0.000001);
  expect(
    costUsd(MODELS.cheap, { prompt_tokens: 1, completion_tokens: 0 }),
  ).toBe(0);
});

it("doubles the price for fast (priority) processing", () => {
  expect(
    costUsd(
      MODELS.strong,
      { prompt_tokens: 1000, completion_tokens: 100 },
      true,
    ),
  ).toBe(0.006);
});
