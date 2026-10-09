import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { z } from "zod";

import { serverEnv } from "@/env/server";
import { admin } from "@/utils/supabase/admin";

import { BUDGET_USD, EVAL_BLOCK_USD, costUsd, type Model } from "./prices";

import { bounded } from "./eval/deadline";

let openai: OpenAI | undefined;
let openrouter: OpenAI | undefined;

export type Message = ChatCompletionMessageParam;

/** Structured-output chat call. Every call is costed and logged to ai_usage; refuses once the budget is spent. */
export async function callJson<S extends z.ZodType>(opts: {
  task: string;
  onUsage?: (usd: number) => void;
  onUnloggedUsage?: (usd: number) => void;
  signal?: AbortSignal;
  model: Model;
  schema: S;
  messages: Message[];
  effort?: "low" | "medium" | "high";
  userId?: string | null;
  timeoutMs?: number;
  /** Priority processing: lower latency at 2x price. Used for student-facing marking. */
  fast?: boolean;
}): Promise<z.infer<S>> {
  const spendRequest = admin().rpc("ai_spend");
  const { data: spent, error } = await (opts.task === "eval"
    ? bounded(spendRequest, opts.signal)
    : spendRequest);
  if (error) throw new Error(`ai_spend failed: ${error.message}`);
  if (
    opts.task === "eval" &&
    (spent == null || !Number.isFinite(Number(spent)))
  )
    throw new Error("Cannot verify eval spend");
  const unlogged =
    opts.task === "eval"
      ? await bounded(
          (await import("@/app/admin/marking/engine/store")).unloggedSpend(),
          opts.signal,
        )
      : 0;
  opts.signal?.throwIfAborted();
  if (
    Number(spent) + unlogged >=
    (opts.task === "eval" ? EVAL_BLOCK_USD : BUDGET_USD)
  )
    throw new Error("AI budget reached");

  const isAnthropic = opts.model.startsWith("anthropic/");
  let client: OpenAI;
  if (isAnthropic) {
    if (!openrouter) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
      openrouter = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        maxRetries: 1,
        timeout: 90_000,
      });
    }
    client = openrouter;
  } else {
    openai ??= new OpenAI({
      apiKey: serverEnv().OPENAI_API_KEY,
      maxRetries: 1,
      timeout: 90_000,
    });
    client = openai;
  }
  const res = await client.chat.completions.create(
    {
      model: opts.model,
      messages: opts.messages,
      reasoning_effort: opts.effort ?? "low",
      ...(isAnthropic
        ? { provider: { require_parameters: true } }
        : opts.fast && { service_tier: "priority" as const }),
      response_format: zodResponseFormat(
        opts.schema,
        opts.task.replace(/\W/g, "_"),
      ),
    },
    opts.task === "eval"
      ? {
          timeout: opts.timeoutMs ?? 60_000,
          maxRetries: 0,
          signal: opts.signal,
        }
      : opts.timeoutMs
        ? { timeout: opts.timeoutMs }
        : undefined,
  );
  if (res.usage) {
    const usage = res.usage;
    const usd = costUsd(opts.model, res.usage, res.service_tier === "priority");
    opts.onUsage?.(usd);
    const logUsage = async () => {
      const { error: logError } = await admin()
        .from("ai_usage")
        .insert({
          user_id: opts.userId ?? null,
          task: opts.task,
          model: opts.model,
          input_tokens: usage.prompt_tokens,
          cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
          output_tokens: usage.completion_tokens,
          usd,
        });
      if (logError) {
        if (opts.task === "eval")
          throw new Error(`Eval usage logging failed: ${logError.message}`);
        console.error("ai_usage insert failed", logError.message);
      }
    };
    if (opts.task === "eval") {
      try {
        await bounded(logUsage(), opts.signal);
      } catch (error) {
        opts.onUnloggedUsage?.(usd);
        throw error;
      }
    } else await logUsage();
  }
  const choice = res.choices[0];
  const message = choice?.message;
  if (
    choice?.finish_reason === "length" ||
    choice?.finish_reason === "content_filter" ||
    message?.refusal ||
    !message?.content
  )
    throw new Error(
      `No structured output (${message?.refusal ?? choice?.finish_reason})`,
    );
  return opts.schema.parse(JSON.parse(message.content));
}
