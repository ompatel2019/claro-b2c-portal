// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({ admin: () => ({ from: vi.fn() }) }));

import {
  AI_RATE_LIMIT_MESSAGE,
  AI_RATE_LIMIT_PER_HOUR,
  AI_RATE_LIMIT_PER_MINUTE,
  assertStudentAiRateLimit,
} from "./rate-limit";

describe("assertStudentAiRateLimit", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const now = new Date("2026-10-09T04:00:00Z");

  it("allows the request at the per-minute limit (20th of 20)", async () => {
    const result = await assertStudentAiRateLimit({
      userId,
      now,
      counts: async () => [AI_RATE_LIMIT_PER_MINUTE - 1, 50],
    });
    expect(result).toEqual({ ok: true });
  });

  it("blocks the 21st request in a minute", async () => {
    const result = await assertStudentAiRateLimit({
      userId,
      now,
      counts: async () => [AI_RATE_LIMIT_PER_MINUTE, 50],
    });
    expect(result).toEqual({
      ok: false,
      error: AI_RATE_LIMIT_MESSAGE,
      retryAfterSec: 60,
    });
  });

  it("blocks when the hourly cap is reached", async () => {
    const result = await assertStudentAiRateLimit({
      userId,
      now,
      counts: async () => [0, AI_RATE_LIMIT_PER_HOUR],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSec).toBe(3600);
  });

  it("exempts admins", async () => {
    const counts = vi.fn(async () => [999, 999] as [number, number]);
    const result = await assertStudentAiRateLimit({
      userId,
      role: "admin",
      now,
      counts,
    });
    expect(result).toEqual({ ok: true });
    expect(counts).not.toHaveBeenCalled();
  });

  it("fails open when the count helper throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await assertStudentAiRateLimit({
      userId,
      now,
      counts: async () => {
        throw new Error("db down");
      },
    });
    expect(result).toEqual({ ok: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
