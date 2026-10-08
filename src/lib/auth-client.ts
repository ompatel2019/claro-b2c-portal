"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Refresh when the access token is missing or within 5 minutes of expiry. */
export async function ensureSession(db: SupabaseClient) {
  const { data, error } = await db.auth.getSession();
  if (error) throw new Error("Could not check your sign-in. Try again.");
  const expiresAt = data.session?.expires_at ?? 0;
  if (!data.session || expiresAt * 1000 - Date.now() < 5 * 60_000) {
    const refreshed = await db.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session)
      throw new Error(
        "Your sign-in expired. Sign in again — your answers are already saved.",
      );
  }
}

export async function withAuthRetry<T>(
  db: SupabaseClient,
  fn: () => Promise<T>,
) {
  await ensureSession(db);
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/jwt|auth|permission denied|not authenticated|401|JWT/i.test(message))
      throw error;
    await ensureSession(db);
    return fn();
  }
}
