import {
  getDb,
  repositories,
  repositoryMembers,
  agentRepositoryAccess,
  agentSessions,
  pullRequests,
  githubConnections,
  newEntityId,
  and,
  eq,
  asc,
  count,
  inArray,
  type AccessLevel,
} from "@lib/db-models";
import { getBindings } from "@lib/capabilities";
import { getGitHost, GitHostError } from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { allows, effectiveLevel, type Action } from "./access";
import { ForgeError, notFound } from "./errors";

const log = moduleLogger("forge/repositories");

export interface Repository {
  id: string;
  name: string;
  description: string | null;
  defaultBranch: string;
  artifactsName: string;
  createdAt: number;
  updatedAt: number;
}

export interface AccessibleRepository extends Repository {
  level: AccessLevel;
}

type RepositoryRow = typeof repositories.$inferSelect;

// The one authorization check: the repository, if the principal may take the
// action on it. A principal who cannot even read it is told it does not exist.
export async function authorize(
  principal: Principal,
  name: string,
  action: Action,
): Promise<AccessibleRepository> {
  const [row] = await getDb()
    .select()
    .from(repositories)
    .where(eq(repositories.name, name));
  return check(principal, row, action);
}

export async function authorizeId(
  principal: Principal,
  repositoryId: string,
  action: Action,
): Promise<AccessibleRepository> {
  const [row] = await getDb()
    .select()
    .from(repositories)
    .where(eq(repositories.id, repositoryId));
  return check(principal, row, action);
}

async function check(
  principal: Principal,
  row: RepositoryRow | undefined,
  action: Action,
): Promise<AccessibleRepository> {
  const level = row ? await levelOn(principal, row.id) : null;
  if (!row || !allows(level, "read")) {
    throw notFound();
  }
  if (!allows(level, action)) {
    throw new ForgeError(
      "FORBIDDEN",
      `You need ${action} access to ${row.name} for this`,
    );
  }
  return { ...toRepository(row), level: level! };
}

export async function levelOn(
  principal: Principal,
  repositoryId: string,
): Promise<AccessLevel | null> {
  const db = getDb();
  const [member, grant] = await Promise.all([
    db
      .select({ level: repositoryMembers.level })
      .from(repositoryMembers)
      .where(
        and(
          eq(repositoryMembers.repositoryId, repositoryId),
          eq(repositoryMembers.userId, principal.userId),
        ),
      ),
    principal.kind === "agent"
      ? db
          .select({ level: agentRepositoryAccess.level })
          .from(agentRepositoryAccess)
          .where(
            and(
              eq(agentRepositoryAccess.repositoryId, repositoryId),
              eq(agentRepositoryAccess.agentId, principal.agentId),
            ),
          )
      : Promise.resolve([]),
  ]);
  return effectiveLevel(
    principal,
    member[0]?.level ?? null,
    grant[0]?.level ?? null,
  );
}

export async function listRepositories(
  principal: Principal,
): Promise<AccessibleRepository[]> {
  const rows = await getDb()
    .select()
    .from(repositories)
    .orderBy(asc(repositories.name));
  const levels = await Promise.all(
    rows.map((row) => levelOn(principal, row.id)),
  );
  return rows.flatMap((row, i) => {
    const level = levels[i];
    return level ? [{ ...toRepository(row), level }] : [];
  });
}

// What the repository list shows of each repository beyond its own fields.
export interface RepositoryStats {
  openPullRequests: number;
  activeSessions: number;
  members: number;
  github: { owner: string; repo: string } | null;
}

// The repositories the principal can read, each with its stats.
export async function listRepositoriesWithStats(
  principal: Principal,
): Promise<(AccessibleRepository & { stats: RepositoryStats })[]> {
  const list = await listRepositories(principal);
  const ids = list.map((repo) => repo.id);
  if (ids.length === 0) {
    return [];
  }
  const db = getDb();
  const [pulls, sessions, members, github] = await Promise.all([
    db
      .select({ id: pullRequests.repositoryId, n: count() })
      .from(pullRequests)
      .where(
        and(
          inArray(pullRequests.repositoryId, ids),
          inArray(pullRequests.status, ["open", "processing"]),
        ),
      )
      .groupBy(pullRequests.repositoryId),
    db
      .select({ id: agentSessions.repositoryId, n: count() })
      .from(agentSessions)
      .where(
        and(
          inArray(agentSessions.repositoryId, ids),
          eq(agentSessions.status, "active"),
        ),
      )
      .groupBy(agentSessions.repositoryId),
    db
      .select({ id: repositoryMembers.repositoryId, n: count() })
      .from(repositoryMembers)
      .where(inArray(repositoryMembers.repositoryId, ids))
      .groupBy(repositoryMembers.repositoryId),
    db
      .select({
        id: githubConnections.repositoryId,
        owner: githubConnections.owner,
        repo: githubConnections.repo,
      })
      .from(githubConnections)
      .where(inArray(githubConnections.repositoryId, ids)),
  ]);
  const counts = (rows: { id: string; n: number }[]) =>
    new Map(rows.map((row) => [row.id, row.n]));
  const [pullsOf, sessionsOf, membersOf] = [pulls, sessions, members].map(
    counts,
  );
  const githubOf = new Map(github.map(({ id, ...ref }) => [id, ref]));
  return list.map((repo) => ({
    ...repo,
    stats: {
      openPullRequests: pullsOf!.get(repo.id) ?? 0,
      activeSessions: sessionsOf!.get(repo.id) ?? 0,
      members: membersOf!.get(repo.id) ?? 0,
      github: githubOf.get(repo.id) ?? null,
    },
  }));
}

// The repository and the commit its default branch points at, null while it
// has no commits or git hosting is off.
export async function getRepository(
  principal: Principal,
  name: string,
): Promise<AccessibleRepository & { head: string | null }> {
  const repository = await authorize(principal, name, "read");
  const head = getBindings().git
    ? await getGitHost().resolve(
        repository.artifactsName,
        repository.defaultBranch,
      )
    : null;
  return { ...repository, head: head?.commit ?? null };
}

export async function createRepository(
  principal: Principal,
  input: { name: string; description?: string | null; defaultBranch?: string },
): Promise<AccessibleRepository> {
  requireInstanceAdmin(principal, "create repositories");
  requireGit();
  const db = getDb();
  const [clash] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.name, input.name));
  if (clash) {
    throw new ForgeError("CONFLICT", `A repository named ${input.name} exists`);
  }
  const id = newEntityId("REPOSITORY");
  const defaultBranch = input.defaultBranch || "main";
  await getGitHost().create(id, {
    defaultBranch,
    description: input.description ?? undefined,
  });
  const [row] = await db
    .insert(repositories)
    .values({
      id,
      name: input.name,
      description: input.description ?? null,
      defaultBranch,
      artifactsName: id,
      createdBy: principal.userId,
    })
    .returning();
  await db
    .insert(repositoryMembers)
    .values({ repositoryId: id, userId: principal.userId, level: "admin" });
  log.info("repository created", { repositoryId: id });
  return { ...toRepository(row!), level: "admin" };
}

export async function updateRepository(
  principal: Principal,
  name: string,
  patch: { name?: string; description?: string | null; defaultBranch?: string },
): Promise<AccessibleRepository> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  const db = getDb();
  if (patch.name && patch.name !== repository.name) {
    const [clash] = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(eq(repositories.name, patch.name));
    if (clash) {
      throw new ForgeError(
        "CONFLICT",
        `A repository named ${patch.name} exists`,
      );
    }
  }
  const [row] = await db
    .update(repositories)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(repositories.id, repository.id))
    .returning();
  log.info("repository updated", { repositoryId: repository.id });
  return { ...toRepository(row!), level: repository.level };
}

// Removes the repository, its session forks and everything recorded about it.
export async function deleteRepository(
  principal: Principal,
  name: string,
): Promise<void> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  const db = getDb();
  const sessions = await db
    .select({ artifactsName: agentSessions.artifactsName })
    .from(agentSessions)
    .where(eq(agentSessions.repositoryId, repository.id));
  if (getBindings().git) {
    const git = getGitHost();
    for (const gitName of [
      repository.artifactsName,
      ...sessions.map((s) => s.artifactsName),
    ]) {
      await git.delete(gitName).catch((err: unknown) => {
        if (!(err instanceof GitHostError && err.code === "NOT_FOUND")) {
          throw err;
        }
      });
    }
  }
  await db.delete(repositories).where(eq(repositories.id, repository.id));
  log.info("repository deleted", { repositoryId: repository.id });
}

export function requireUser(principal: Principal): void {
  if (principal.kind !== "user") {
    throw new ForgeError("FORBIDDEN", "Agents cannot do this");
  }
}

export function requireInstanceAdmin(principal: Principal, what: string): void {
  if (principal.kind !== "user" || principal.role !== "admin") {
    throw new ForgeError("FORBIDDEN", `Only admins can ${what}`);
  }
}

export function requireGit(): void {
  if (!getBindings().git) {
    throw new ForgeError(
      "UNAVAILABLE",
      "Git hosting is not configured on this instance (no Artifacts binding)",
    );
  }
}

function toRepository(row: RepositoryRow): Repository {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultBranch: row.defaultBranch,
    artifactsName: row.artifactsName,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
