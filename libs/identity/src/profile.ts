import {
  getDb,
  user,
  and,
  asc,
  eq,
  inArray,
  matchesAllTerms,
  searchTerms,
  sql,
  type SQL,
} from "@lib/db-models";

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

// Up to `limit` active users matching `q` (see userMatches), by name.
export async function searchUserProfiles(
  q: string,
  limit: number,
): Promise<UserProfile[]> {
  const rows = await getDb()
    .select(columns)
    .from(user)
    .where(and(eq(user.banned, false), userMatches(q)))
    .orderBy(asc(user.name), asc(user.id))
    .limit(limit);
  return rows.map(toProfile);
}

// Whether a user's name, username or email between them hold every word of
// `q`; no condition when it is empty.
export function userMatches(q: string): SQL | undefined {
  return matchesAllTerms(
    sql`${user.name} || ' ' || coalesce(${user.username}, '') || ' ' || ${user.email}`,
    searchTerms(q),
  );
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
