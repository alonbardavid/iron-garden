import type { AccessLevel } from "@lib/db-models";

export type Action = AccessLevel;

const RANK: Record<AccessLevel, number> = { read: 1, write: 2, admin: 3 };

export interface Grantee {
  kind: "user" | "agent";
  role: "admin" | "user";
}

// A principal's level on one repository. Instance admins hold Admin
// everywhere. An agent gets the lower of its own grant and its owner's level,
// worked out on every check so it shrinks the moment the owner's does.
export function effectiveLevel(
  grantee: Grantee,
  memberLevel: AccessLevel | null,
  agentLevel: AccessLevel | null,
): AccessLevel | null {
  const ownLevel = grantee.role === "admin" ? "admin" : memberLevel;
  if (grantee.kind === "user") {
    return ownLevel;
  }
  return lower(ownLevel, agentLevel);
}

export function allows(level: AccessLevel | null, action: Action): boolean {
  return level !== null && RANK[level] >= RANK[action];
}

export function lower(
  a: AccessLevel | null,
  b: AccessLevel | null,
): AccessLevel | null {
  if (a === null || b === null) {
    return null;
  }
  return RANK[a] <= RANK[b] ? a : b;
}
