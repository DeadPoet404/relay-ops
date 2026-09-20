import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "./schema";

export function createDatabase(url: string) {
  z.string()
    .url()
    .refine((value) => /^postgres(ql)?:/.test(value), "Use a PostgreSQL URL")
    .parse(url);
  const pool = new Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  // Never log raw driver errors: they may contain database details or SQL values.
  pool.on("error", () => console.error("Relay database pool connection error"));
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof createDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
