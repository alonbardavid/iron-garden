import { getDb, user, agents, eq } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";
import { getAuth } from "./auth";
import { parseKeyMetadata } from "./key-metadata";

const log = moduleLogger("identity/principal");

export type Role = "admin" | "user";

export interface UserPrincipal {
  kind: "user";
  userId: string;
  role: Role;
  via: "session" | "key";
  mustChangePassword: boolean;
}

// An agent acts for its owner and never with more than the owner has.
export interface AgentPrincipal {
  kind: "agent";
  userId: string;
  role: Role;
  agentId: string;
  agentName: string;
}

export type Principal = UserPrincipal | AgentPrincipal;

// An API key arrives as `x-api-key`, as a bearer token, or (for git) as the
// Basic auth password. A browser session is the fallback.
export async function resolvePrincipal(
  headers: Headers,
): Promise<Principal | null> {
  const key = apiKeyFrom(headers);
  if (key) {
    return principalForKey(key);
  }
  const session = await getAuth().api.getSession({ headers });
  if (!session || session.user.banned) {
    return null;
  }
  return {
    kind: "user",
    userId: session.user.id,
    role: toRole(session.user.role),
    via: "session",
    mustChangePassword: Boolean(session.user.mustChangePassword),
  };
}

export async function principalForKey(key: string): Promise<Principal | null> {
  const result = await getAuth().api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) {
    return null;
  }
  const metadata = parseKeyMetadata(result.key.metadata);
  const userId = result.key.referenceId;
  const [owner] = await getDb()
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId));
  if (!metadata || !owner || owner.banned) {
    log.info("refused an api key", {
      keyId: result.key.id,
      reason: !metadata ? "metadata" : "owner",
    });
    return null;
  }
  if (metadata.kind === "user") {
    return {
      kind: "user",
      userId,
      role: toRole(owner.role),
      via: "key",
      mustChangePassword: false,
    };
  }
  const [agent] = await getDb()
    .select()
    .from(agents)
    .where(eq(agents.id, metadata.agentId));
  if (!agent || agent.ownerUserId !== userId || agent.deactivatedAt) {
    log.info("refused an api key", { keyId: result.key.id, reason: "agent" });
    return null;
  }
  return {
    kind: "agent",
    userId,
    role: toRole(owner.role),
    agentId: agent.id,
    agentName: agent.name,
  };
}

export function apiKeyFrom(headers: Headers): string | null {
  const header = headers.get("x-api-key");
  if (header) {
    return header;
  }
  const authorization = headers.get("authorization") ?? "";
  const [scheme, value] = authorization.split(" ", 2);
  if (scheme?.toLowerCase() === "bearer" && value) {
    return value;
  }
  if (scheme?.toLowerCase() === "basic" && value) {
    const decoded = safeAtob(value);
    const password = decoded?.slice(decoded.indexOf(":") + 1);
    return password || null;
  }
  return null;
}

function safeAtob(value: string): string | null {
  try {
    return atob(value);
  } catch {
    return null;
  }
}

function toRole(role: string | null | undefined): Role {
  return role === "admin" ? "admin" : "user";
}
