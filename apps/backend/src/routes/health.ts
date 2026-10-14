import type { Context } from "hono";
import { checkHealth } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("backend/routes/health");

export async function health(c: Context) {
  const database = await checkHealth();
  const healthy = database.status === "ok";
  if (!healthy) {
    log.warning("degraded", { database });
  }
  return c.json(
    { status: healthy ? "ok" : "degraded", checks: { database } },
    healthy ? 200 : 503,
  );
}
