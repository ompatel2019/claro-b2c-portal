import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";

let client: SupabaseClient | undefined;

/** Service-role client: bypasses RLS. Server code only, after checking the caller. */
export function admin() {
  client ??= createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return client;
}
