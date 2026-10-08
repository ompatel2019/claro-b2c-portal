import "server-only";

import { serverEnvSchema } from "./schemas";

export const serverEnv = serverEnvSchema.parse({});
