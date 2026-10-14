import { APIError } from "better-auth/api";
import { getDb, user, and, eq, count } from "@lib/db-models";

export async function activeAdminCount(): Promise<number> {
  const [row] = await getDb()
    .select({ admins: count() })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.banned, false)));
  return row?.admins ?? 0;
}

// An instance always keeps one admin who can sign in.
export async function assertNotLastAdmin(userId: string): Promise<void> {
  const [target] = await getDb()
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId));
  if (target?.role !== "admin" || target.banned) {
    return;
  }
  if ((await activeAdminCount()) <= 1) {
    throw new APIError("BAD_REQUEST", {
      code: "LAST_ADMIN",
      message: "This is the last admin; make someone else an admin first",
    });
  }
}
