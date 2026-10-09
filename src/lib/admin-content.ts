import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/env/server";
import { requireAdmin } from "@/lib/auth";
import { admin } from "@/utils/supabase/admin";
import { pages } from "@/lib/flashcard-data";
import type { Topic } from "@/lib/practice";

/** Shared content forms use the canonical topic hierarchy. */
// Cached per request: the page and its list loader both need the topic tree.
export const loadTopics = cache(async (): Promise<Topic[]> => {
  await requireAdmin();
  return pages<Topic>((from, to) =>
    admin()
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort")
      .order("id")
      .range(from, to),
  );
});

/** Short-lived, signed snapshots prevent Undo from becoming an arbitrary publish path. */
export function contentUndoToken(scope: string, user: string, data: unknown) {
  const payload = Buffer.from(
    JSON.stringify({ scope, user, data, expires: Date.now() + 60_000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", serverEnv().SUPABASE_SECRET_KEY)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function readContentUndoToken(
  scope: string,
  user: string,
  token: string,
): unknown {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Invalid Undo.");
  const expected = createHmac("sha256", serverEnv().SUPABASE_SECRET_KEY)
    .update(payload)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid Undo.");
  const saved = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    saved.scope !== scope ||
    saved.user !== user ||
    saved.expires < Date.now()
  )
    throw new Error("Undo expired.");
  return saved.data;
}
