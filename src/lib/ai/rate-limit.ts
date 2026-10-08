import "server-only";
import { admin } from "@/utils/supabase/admin";

/** Easy knobs — per student. Admins are exempt. Finish-batch marking bypasses routes. */
export const AI_RATE_LIMIT_PER_MINUTE = 20;
export const AI_RATE_LIMIT_PER_HOUR = 200;

export const AI_RATE_LIMIT_MESSAGE =
  "You're going a bit fast, try again in a minute";

export type RateLimitResult =
  { ok: true } | { ok: false; error: string; retryAfterSec: number };

async function countSince(userId: string, sinceIso: string): Promise<number> {
  const { count, error } = await admin()
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Per-student AI rate limit. Fail-open: any count/role error allows the request.
 * Finish-session batch marking goes through the engine, not these HTTP routes.
 */
export async function assertStudentAiRateLimit(opts: {
  userId: string;
  role?: string | null;
  now?: Date;
  /** Injected for Vitest — returns counts for [minute, hour]. */
  counts?: (userId: string, now: Date) => Promise<[number, number]>;
}): Promise<RateLimitResult> {
  if (!opts.userId) return { ok: true };
  const now = opts.now ?? new Date();
  try {
    let role = opts.role;
    if (role === undefined && !opts.counts) {
      const { data } = await admin()
        .from("profiles")
        .select("role")
        .eq("id", opts.userId)
        .maybeSingle();
      role = data?.role ?? null;
    }
    if (role === "admin") return { ok: true };

    const [minuteCount, hourCount] = opts.counts
      ? await opts.counts(opts.userId, now)
      : await Promise.all([
          countSince(
            opts.userId,
            new Date(now.getTime() - 60_000).toISOString(),
          ),
          countSince(
            opts.userId,
            new Date(now.getTime() - 3_600_000).toISOString(),
          ),
        ]);
    if (minuteCount >= AI_RATE_LIMIT_PER_MINUTE)
      return {
        ok: false,
        error: AI_RATE_LIMIT_MESSAGE,
        retryAfterSec: 60,
      };
    if (hourCount >= AI_RATE_LIMIT_PER_HOUR)
      return {
        ok: false,
        error: AI_RATE_LIMIT_MESSAGE,
        retryAfterSec: 3600,
      };
    return { ok: true };
  } catch (error) {
    console.error("ai rate limit count failed (fail-open)", error);
    return { ok: true };
  }
}

export function rateLimitedResponse(
  result: Extract<RateLimitResult, { ok: false }>,
) {
  return Response.json(
    { error: result.error },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  );
}
