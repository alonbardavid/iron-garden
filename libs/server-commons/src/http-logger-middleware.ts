import { honoLogger } from "@logtape/hono";

// Logs each request and opens the scope every other line written while
// serving it inherits; `requireSession` / `requireAdmin` add who it is for.
export const httpLogger = honoLogger({
  context: { include: ["requestId", "method", "path"] },
});
