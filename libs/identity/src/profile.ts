import { getDb, user, eq, inArray } from "@lib/db-models";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: "admin" | "user";
  active: boolean;
  mustChangePassword: boolean;
}

const columns = {
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  role: user.role,
  banned: user.banned,
  mustChangePassword: user.mustChangePassword,
};

export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  const [row] = await getDb()
    .select(columns)
    .from(user)
    .where(eq(user.id, userId));
  return row ? toProfile(row) : null;
}

export async function getUserProfiles(
  userIds: string[],
): Promise<Map<string, UserProfile>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select(columns)
    .from(user)
    .where(inArray(user.id, [...new Set(userIds)]));
  return new Map(rows.map((row) => [row.id, toProfile(row)]));
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const rows = await getDb().select(columns).from(user).orderBy(user.name);
  return rows.map(toProfile);
}

function toProfile(row: {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  banned: boolean;
  mustChangePassword: boolean;
}): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role === "admin" ? "admin" : "user",
    active: !row.banned,
    mustChangePassword: row.mustChangePassword,
  };
}
