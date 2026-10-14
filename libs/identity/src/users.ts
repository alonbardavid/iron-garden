import { getDb, user, eq } from "@lib/db-models";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("identity/users");

// Every way a password gets set ends a pending invite; only an admin-set
// password is temporary.
export async function passwordSet(
  userId: string,
  temporary: boolean,
): Promise<void> {
  await getDb()
    .update(user)
    .set({
      mustChangePassword: temporary,
      invited: false,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
  log.info("password set", { userId, temporary });
}

export async function isInvited(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ invited: user.invited })
    .from(user)
    .where(eq(user.id, userId));
  return row?.invited ?? false;
}
