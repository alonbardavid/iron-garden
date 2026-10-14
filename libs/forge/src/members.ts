import {
  getDb,
  repositoryMembers,
  agentRepositoryAccess,
  agents,
  repositories,
  and,
  asc,
  eq,
  type AccessLevel,
} from "@lib/db-models";
import {
  getUserProfile,
  getUserProfiles,
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

export interface AgentGrant {
  agentId: string;
  agentName: string;
  ownerUserId: string;
  granted: AccessLevel;
  effective: AccessLevel | null;
}

export async function listMembers(
  principal: Principal,
  name: string,
): Promise<{ members: Member[]; agents: AgentGrant[] }> {
  const repository = await authorize(principal, name, "read");
  const db = getDb();
  const [memberRows, grantRows] = await Promise.all([
    db
      .select()
      .from(repositoryMembers)
      .where(eq(repositoryMembers.repositoryId, repository.id)),
    db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        ownerUserId: agents.ownerUserId,
        granted: agentRepositoryAccess.level,
      })
      .from(agentRepositoryAccess)
      .innerJoin(agents, eq(agents.id, agentRepositoryAccess.agentId))
      .where(eq(agentRepositoryAccess.repositoryId, repository.id)),
  ]);
  const profiles = await getUserProfiles([
    ...memberRows.map((m) => m.userId),
    ...grantRows.map((g) => g.ownerUserId),
  ]);
  const memberLevel = new Map(memberRows.map((m) => [m.userId, m.level]));
  return {
    members: memberRows.flatMap((m) => {
      const user = profiles.get(m.userId);
      return user ? [{ user, level: m.level }] : [];
    }),
    agents: grantRows.map((g) => ({
      ...g,
      effective: effectiveLevel(
        { kind: "agent", role: profiles.get(g.ownerUserId)?.role ?? "user" },
        memberLevel.get(g.ownerUserId) ?? null,
        g.granted,
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
