import type { ErrorHandler } from "hono";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("server-commons/error-handler-middleware");

export const errorHandler: ErrorHandler = (err, c) => {
  log.error("unhandled error", { err });
  return c.json({ message: err.message, stack: err.stack }, 500);
};
