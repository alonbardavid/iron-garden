import { env } from "cloudflare:workers";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { moduleLogger, queryLogger } from "@lib/logging";

const log = moduleLogger("db-models/db");

export type Db = DrizzleD1Database;

export function getDb(): Db {
  return drizzle(env.DB, { logger: queryLogger() });
}

export async function checkHealth(): Promise<{
  status: string;
  error?: string;
}> {
  try {
    await getDb().run(sql`SELECT 1`);
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("health check failed", { err });
    return { status: "error", error: message };
  }
}
