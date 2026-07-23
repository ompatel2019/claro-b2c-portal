import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { serverEnvSchema } from "./src/env/schemas";

loadEnvConfig(process.cwd());

const { DATABASE_URL } = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
});

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
