import {
  getDb,
  repositories,
  repositoryMembers,
  agentRepositoryAccess,
  agentSessions,
  pullRequests,
  githubConnections,
  newEntityId,
  paginate,
  matchesAllTerms,
  searchTerms,
  and,
  eq,
  asc,
  count,
  inArray,
  isNotNull,
  type AccessLevel,
  type ListRequest,
  type ListResult,
  type SQL,
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

// The repositories the principal can read, a page at a time, by name. `q`
// keeps those whose name holds every word of it.
export async function listRepositories(
  principal: Principal,
  request: ListRequest<"name" | "createdAt" | "updatedAt"> & { q?: string },
): Promise<ListResult<AccessibleRepository>> {
  const page = await paginate(readableBy(principal), request, {
    defaultSort: "name",
    filters: { q: (q) => matchesAllTerms(repositories.name, searchTerms(q)) },
  });
  return {
    ...page,
    items: page.items.map((row) => accessible(principal, row)),
  };
}

// Up to `limit` readable repositories whose name holds every word of `q`.
export async function searchRepositories(
  principal: Principal,
  q: string,
  limit: number,
): Promise<AccessibleRepository[]> {
  const select = readableBy(principal);
  const rows = await select
    .where(
      and(
        select._.config.where,
        matchesAllTerms(repositories.name, searchTerms(q)),
      ),
    )
    .orderBy(asc(repositories.name))
    .limit(limit);
  return rows.map((row) => accessible(principal, row));
}

// Every repository with the principal's member level and, for an agent, its
// grant, keeping only those the principal reaches at all.
function readableBy(principal: Principal) {
  return getDb()
    .select({
      id: repositories.id,
      name: repositories.name,
      description: repositories.description,
      defaultBranch: repositories.defaultBranch,
      artifactsName: repositories.artifactsName,
      createdAt: repositories.createdAt,
      updatedAt: repositories.updatedAt,
      memberLevel: repositoryMembers.level,
      grantLevel: agentRepositoryAccess.level,
    })
    .from(repositories)
    .leftJoin(
      repositoryMembers,
      and(
        eq(repositoryMembers.repositoryId, repositories.id),
        eq(repositoryMembers.userId, principal.userId),
      ),
    )
    .leftJoin(
      agentRepositoryAccess,
      and(
        eq(agentRepositoryAccess.repositoryId, repositories.id),
        eq(
          agentRepositoryAccess.agentId,
          principal.kind === "agent" ? principal.agentId : "",
        ),
      ),
    )
    .where(reachable(principal))
    .$dynamic();
}

// Mirrors effectiveLevel: an admin reaches everything, an agent only what it
// was granted and, below an admin owner, what its owner is a member of.
function reachable(principal: Principal): SQL | undefined {
  const member = isNotNull(repositoryMembers.level);
  const owner = principal.role === "admin" ? undefined : member;
  return principal.kind === "agent"
    ? and(isNotNull(agentRepositoryAccess.level), owner)
    : owner;
}

function accessible(
  principal: Principal,
  row: Omit<RepositoryRow, "createdBy"> & {
    memberLevel: AccessLevel | null;
    grantLevel: AccessLevel | null;
  },
): AccessibleRepository {
  const { memberLevel, grantLevel, ...repository } = row;
  return {
    ...toRepository(repository),
    level: effectiveLevel(principal, memberLevel, grantLevel)!,
  };
}

// What the repository list shows of each repository beyond its own fields.
export interface RepositoryStats {
  openPullRequests: number;
  activeSessions: number;
  members: number;
  github: { owner: string; repo: string } | null;
}

// A page of the repositories the principal can read, each with its stats.
export async function listRepositoriesWithStats(
  principal: Principal,
  request: Parameters<typeof listRepositories>[1],
): Promise<ListResult<AccessibleRepository & { stats: RepositoryStats }>> {
  const page = await listRepositories(principal, request);
  return { ...page, items: await withStats(page.items) };
}

async function withStats(
  list: AccessibleRepository[],
): Promise<(AccessibleRepository & { stats: RepositoryStats })[]> {
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

function toRepository(row: Omit<RepositoryRow, "createdBy">): Repository {
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
