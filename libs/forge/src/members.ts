import {
  getDb,
  repositoryMembers,
  agentRepositoryAccess,
  agents,
  repositories,
  user,
  paginate,
  and,
  asc,
  eq,
  inArray,
  type AccessLevel,
  type ListResult,
} from "@lib/db-models";
import {
  getUserProfile,
  getUserProfiles,
  userMatches,
  type Agent,
  type Principal,
  type UserProfile,
} from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { allows, effectiveLevel } from "./access";
import { ForgeError, notFound } from "./errors";
import { authorize, levelOn, requireUser } from "./repositories";

const log = moduleLogger("forge/members");

export interface Member {
  user: UserProfile;
  level: AccessLevel;
}

// Where a page starts and how long it is.
export interface PageRequest {
  limit: number;
  cursor?: string;
}

export interface AgentGrant {
  agentId: string;
  agentName: string;
  ownerUserId: string;
  granted: AccessLevel;
  effective: AccessLevel | null;
}

// A repository's members a page at a time, by name.
export async function listMembers(
  principal: Principal,
  name: string,
  page: PageRequest,
): Promise<ListResult<Member>> {
  const repository = await authorize(principal, name, "read");
  const rows = await paginate(
    membersOf(repository.id),
    { ...page, sort: "name", dir: "asc", withTotal: false },
    {},
  );
  return { ...rows, items: await withProfiles(rows.items) };
}

// Up to `limit` members whose name, username or email holds every word of
// `q`, by name.
export async function searchMembers(
  principal: Principal,
  name: string,
  q: string,
  limit: number,
): Promise<Member[]> {
  const repository = await authorize(principal, name, "read");
  const select = membersOf(repository.id);
  const rows = await select
    .where(and(select._.config.where, userMatches(q)))
    .orderBy(asc(user.name), asc(user.id))
    .limit(limit);
  return withProfiles(rows);
}

// The agents granted access to a repository a page at a time, by name, with
// what each can actually do through its owner.
export async function listAgentGrants(
  principal: Principal,
  name: string,
  page: PageRequest,
): Promise<ListResult<AgentGrant>> {
  const repository = await authorize(principal, name, "read");
  const rows = await paginate(
    getDb()
      .select({
        id: agents.id,
        name: agents.name,
        ownerUserId: agents.ownerUserId,
        granted: agentRepositoryAccess.level,
      })
      .from(agentRepositoryAccess)
      .innerJoin(agents, eq(agents.id, agentRepositoryAccess.agentId))
      .where(eq(agentRepositoryAccess.repositoryId, repository.id))
      .$dynamic(),
    { ...page, sort: "name", dir: "asc", withTotal: false },
    {},
  );
  const owners = [...new Set(rows.items.map((g) => g.ownerUserId))];
  const [profiles, ownerRows] = await Promise.all([
    getUserProfiles(owners),
    owners.length === 0
      ? []
      : getDb()
          .select({
            userId: repositoryMembers.userId,
            level: repositoryMembers.level,
          })
          .from(repositoryMembers)
          .where(
            and(
              eq(repositoryMembers.repositoryId, repository.id),
              inArray(repositoryMembers.userId, owners),
            ),
          ),
  ]);
  const memberLevel = new Map(ownerRows.map((m) => [m.userId, m.level]));
  return {
    ...rows,
    items: rows.items.map(({ id, name: agentName, ownerUserId, granted }) => ({
      agentId: id,
      agentName,
      ownerUserId,
      granted,
      effective: effectiveLevel(
        { kind: "agent", role: profiles.get(ownerUserId)?.role ?? "user" },
        memberLevel.get(ownerUserId) ?? null,
        granted,
      ),
    })),
  };
}

export async function setMember(
  principal: Principal,
  name: string,
  userId: string,
  level: AccessLevel,
): Promise<void> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  if (!(await getUserProfile(userId))) {
    throw notFound("User");
  }
  if (level !== "admin") {
    await assertNotLastRepositoryAdmin(repository.id, userId);
  }
  await getDb()
    .insert(repositoryMembers)
    .values({ repositoryId: repository.id, userId, level })
    .onConflictDoUpdate({
      target: [repositoryMembers.repositoryId, repositoryMembers.userId],
      set: { level },
    });
  log.info("member level set", { repositoryId: repository.id, userId, level });
}

export async function removeMember(
  principal: Principal,
  name: string,
  userId: string,
): Promise<void> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  await assertNotLastRepositoryAdmin(repository.id, userId);
  await getDb()
    .delete(repositoryMembers)
    .where(
      and(
        eq(repositoryMembers.repositoryId, repository.id),
        eq(repositoryMembers.userId, userId),
      ),
    );
  log.info("member removed", { repositoryId: repository.id, userId });
}

// Set by the agent's owner, never above the owner's own level; `null` removes
// the grant.
export async function setAgentAccess(
  principal: Principal,
  agent: Agent,
  name: string,
  level: AccessLevel | null,
): Promise<void> {
  requireUser(principal);
  if (agent.ownerUserId !== principal.userId) {
    throw notFound("Agent");
  }
  const repository = await authorize(principal, name, "read");
  const db = getDb();
  if (level === null) {
    await db
      .delete(agentRepositoryAccess)
      .where(
        and(
          eq(agentRepositoryAccess.agentId, agent.id),
          eq(agentRepositoryAccess.repositoryId, repository.id),
        ),
      );
    log.info("agent access removed", {
      agentId: agent.id,
      repositoryId: repository.id,
    });
    return;
  }
  if (!allows(await levelOn(principal, repository.id), level)) {
    throw new ForgeError(
      "FORBIDDEN",
      `An agent cannot get more than your own ${repository.level} access`,
    );
  }
  await db
    .insert(agentRepositoryAccess)
    .values({ agentId: agent.id, repositoryId: repository.id, level })
    .onConflictDoUpdate({
      target: [
        agentRepositoryAccess.agentId,
        agentRepositoryAccess.repositoryId,
      ],
      set: { level },
    });
  log.info("agent access set", {
    agentId: agent.id,
    repositoryId: repository.id,
    level,
  });
}

export async function listAgentAccess(
  agent: Agent,
): Promise<{ repository: string; level: AccessLevel }[]> {
  return getDb()
    .select({
      repository: repositories.name,
      level: agentRepositoryAccess.level,
    })
    .from(agentRepositoryAccess)
    .innerJoin(
      repositories,
      eq(repositories.id, agentRepositoryAccess.repositoryId),
    )
    .where(eq(agentRepositoryAccess.agentId, agent.id))
    .orderBy(asc(repositories.name));
}

async function assertNotLastRepositoryAdmin(
  repositoryId: string,
  userId: string,
): Promise<void> {
  const admins = await getDb()
    .select({ userId: repositoryMembers.userId })
    .from(repositoryMembers)
    .where(
      and(
        eq(repositoryMembers.repositoryId, repositoryId),
        eq(repositoryMembers.level, "admin"),
      ),
    );
  if (admins.length === 1 && admins[0]!.userId === userId) {
    throw new ForgeError(
      "BAD_REQUEST",
      "This is the repository's last admin; make someone else an admin first",
    );
  }
}

// A repository's members with the user's name to order them by.
function membersOf(repositoryId: string) {
  return getDb()
    .select({
      id: user.id,
      name: user.name,
      level: repositoryMembers.level,
    })
    .from(repositoryMembers)
    .innerJoin(user, eq(user.id, repositoryMembers.userId))
    .where(eq(repositoryMembers.repositoryId, repositoryId))
    .$dynamic();
}

async function withProfiles(
  rows: { id: string; level: AccessLevel }[],
): Promise<Member[]> {
  const profiles = await getUserProfiles(rows.map((row) => row.id));
  return rows.flatMap((row) => {
    const profile = profiles.get(row.id);
    return profile ? [{ user: profile, level: row.level }] : [];
  });
}
