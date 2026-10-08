import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { z } from "zod";

import { serverEnv } from "@/env/server";
import { admin } from "@/utils/supabase/admin";

import { BUDGET_USD, costUsd, type Model } from "./prices";

let openai: OpenAI | undefined;

export type Message = ChatCompletionMessageParam;

/** Structured-output chat call. Every call is costed and logged to ai_usage; refuses once the budget is spent. */
export async function callJson<S extends z.ZodType>(opts: {
  task: string;
  model: Model;
  schema: S;
  messages: Message[];
  effort?: "low" | "medium" | "high";
  userId?: string | null;
  timeoutMs?: number;
  /** Priority processing: lower latency at 2x price. Used for student-facing marking. */
  fast?: boolean;
}): Promise<z.infer<S>> {
  const { data: spent, error } = await admin().rpc("ai_spend");
  if (error) throw new Error(`ai_spend failed: ${error.message}`);
  if (Number(spent) >= BUDGET_USD) throw new Error("AI budget reached");

  openai ??= new OpenAI({
    apiKey: serverEnv().OPENAI_API_KEY,
    maxRetries: 1,
    timeout: 90_000,
  });
  const res = await openai.chat.completions.parse(
    {
      model: opts.model,
      messages: opts.messages,
      reasoning_effort: opts.effort ?? "low",
      ...(opts.fast && { service_tier: "priority" as const }),
      response_format: zodResponseFormat(
        opts.schema,
        opts.task.replace(/\W/g, "_"),
      ),
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );
  if (res.usage) {
    const { error: logError } = await admin()
      .from("ai_usage")
      .insert({
        user_id: opts.userId ?? null,
        task: opts.task,
        model: opts.model,
        input_tokens: res.usage.prompt_tokens,
        cached_tokens: res.usage.prompt_tokens_details?.cached_tokens ?? 0,
        output_tokens: res.usage.completion_tokens,
        usd: costUsd(opts.model, res.usage, res.service_tier === "priority"),
      });
    if (logError) console.error("ai_usage insert failed", logError.message);
  }
  const parsed = res.choices[0]?.message.parsed;
  if (!parsed)
    throw new Error(
      `No structured output (${res.choices[0]?.message.refusal ?? res.choices[0]?.finish_reason})`,
    );
  return parsed as z.infer<S>;
}
