import { ORPCError, os } from "@orpc/server";
import { EmailUnavailable } from "@lib/email-service";
import { ForgeError } from "@lib/forge";
import { GitHostError } from "@lib/git-host";
import { GithubError } from "@lib/github";
import { AgentNameTaken, SetupError } from "@lib/identity";

const FORGE_CODES = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
  UNAVAILABLE: "SERVICE_UNAVAILABLE",
  GONE: "GONE",
} as const;

const GIT_CODES = {
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "CONFLICT",
  TOO_LARGE: "BAD_REQUEST",
  UNAVAILABLE: "SERVICE_UNAVAILABLE",
  FAILED: "BAD_GATEWAY",
} as const;

// GitHub refusing the token is not the caller failing to sign in, so it is
// never a 401 (the SPA would sign them out).
const GITHUB_CODES = {
  UNAUTHORIZED: "PRECONDITION_FAILED",
  FORBIDDEN: "PRECONDITION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
  UNAVAILABLE: "BAD_GATEWAY",
} as const;

// Domain refusals become HTTP answers with their message intact; anything
// else stays a 500.
export const domainErrors = os.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    throw toORPCError(err);
  }
});

function toORPCError(err: unknown): unknown {
  if (err instanceof ForgeError) {
    return new ORPCError(FORGE_CODES[err.code], {
      message: err.message,
      // oRPC has no common code for 410.
      status: err.code === "GONE" ? 410 : undefined,
    });
  }
  if (err instanceof GitHostError) {
    return new ORPCError(GIT_CODES[err.code], { message: err.message });
  }
  if (err instanceof GithubError) {
    return new ORPCError(GITHUB_CODES[err.code], { message: err.message });
  }
  if (err instanceof EmailUnavailable) {
    return new ORPCError("SERVICE_UNAVAILABLE", { message: err.message });
  }
  if (err instanceof AgentNameTaken) {
    return new ORPCError("CONFLICT", { message: err.message });
  }
  if (err instanceof SetupError) {
    return new ORPCError(
      err.reason === "bad_token" ? "FORBIDDEN" : "CONFLICT",
      {
        message: err.message,
        data: { reason: err.reason },
      },
    );
  }
  return err;
}
