import { ORPCError, os } from "@orpc/server";
import type { RequestHeadersPluginContext } from "@orpc/server/plugins";
import { resolvePrincipal, type Principal } from "@lib/identity";
import { moduleLogger, withContext } from "@lib/logging";

const log = moduleLogger("backend/routes/principal");

export const requirePrincipal = os
  .$context<RequestHeadersPluginContext>()
  .middleware(async ({ context, next }) => {
    const principal = await resolvePrincipal(
      context.reqHeaders ?? new Headers(),
    );
    if (!principal) {
      log.info("rejected an unauthenticated request");
      throw new ORPCError("UNAUTHORIZED", { message: "Not authenticated" });
    }
    // Must return the scope: LogTape context cannot be added to in place.
    return withContext(
      {
        userId: principal.userId,
        ...(principal.kind === "agent" ? { agentId: principal.agentId } : {}),
      },
      () => next({ context: { principal } }),
    );
  });

export const requirePasswordCurrent = os
  .$context<{ principal: Principal }>()
  .middleware(({ context, next }) => {
    if (
      context.principal.kind === "user" &&
      context.principal.mustChangePassword
    ) {
      throw new ORPCError("FORBIDDEN", {
        message: "Change your password first",
        data: { reason: "password_change_required" },
      });
    }
    return next();
  });

export const requireAdmin = os
  .$context<{ principal: Principal }>()
  .middleware(({ context, next }) => {
    if (
      context.principal.kind !== "user" ||
      context.principal.role !== "admin"
    ) {
      throw new ORPCError("FORBIDDEN", { message: "Only admins can do this" });
    }
    return next();
  });
