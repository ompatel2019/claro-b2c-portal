import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../../drizzle/schema";
import { serverEnv } from "@/env/server";

// prepare: false — required for Supabase transaction-mode pooler (port 6543)
const client = postgres(serverEnv.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
