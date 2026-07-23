import "server-only";

import { serverEnvSchema } from "./schemas";

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
});
