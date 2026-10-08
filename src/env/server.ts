import "server-only";

import { serverEnvSchema } from "./schemas";

/** Parsed on first use so builds without server secrets (CI) still succeed. */
export function serverEnv() {
  return serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  });
}
