import {
  getDb,
  agentSessions,
  agents,
  repositories,
  newEntityId,
  eq,
  getTableColumns,
  type SessionStatus,
} from "@lib/db-models";
import {
  authorize,
  authorizeId,
  ForgeError,
  requireGit,
  type AccessibleRepository,
} from "@lib/forge";
import { getGitHost, type GitToken } from "@lib/git-host";
import { getAgent, type AgentPrincipal, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { groupsOnServer } from "@lib/ai";
import { sessionInstructions, type SessionLinks } from "./session-prompt";

const log = moduleLogger("collab/sessions");

const SESSION_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export interface Session {
  id: string;
  agentId: string;
  agentName: string;
  repositoryId: string;
  repositoryName: string;
  title: string | null;
  goal: string | null;
  context: string | null;
  status: SessionStatus;
  artifactsName: string;
  baseBranch: string;
  baseCommit: string | null;
  // What the agent named itself when it started the session, or else the
  // user agent it started it with.
  client: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionDetails {
  title?: string | null;
  goal?: string | null;
  context?: string | null;
}

export interface StartedSession {
  session: Session;
  repository: AccessibleRepository;
  git: GitToken & { remote: string };
  instructions: string;
}

type SessionRow = typeof agentSessions.$inferSelect & {
  agentName: string;
  repositoryName: string;
};

// The longest client name kept: a user agent can run long.
const MAX_CLIENT_LENGTH = 200;

// `client` is what the agent named itself, and `userAgent` the request's,
// kept when the agent named nothing; prompts tailor themselves to it.
export async function startSession(
  principal: Principal,
  repositoryName: string,
  details: SessionDetails & { client?: string | null },
  linksFor: (sessionId: string) => SessionLinks,
  userAgent: string | null = null,
): Promise<StartedSession> {
  const agent = requireAgent(principal);
  requireGit();
  const repository = await authorize(agent, repositoryName, "write");
  const git = getGitHost();
  const id = newEntityId("AGENT_SESSION");
  const base = await git.resolve(
    repository.artifactsName,
    repository.defaultBranch,
  );
  // An empty repository has nothing to fork: the session starts from an empty
  // repository of its own.
  const fork = base
    ? await git.fork(repository.artifactsName, id, `Session ${id}`)
    : await createEmpty(id, repository.defaultBranch);
  const [row] = await getDb()
    .insert(agentSessions)
    .values({
      id,
      agentId: agent.agentId,
      repositoryId: repository.id,
      title: details.title ?? null,
      goal: details.goal ?? null,
      context: details.context ?? null,
      artifactsName: id,
      baseBranch: repository.defaultBranch,
      baseCommit: base?.commit ?? null,
      client:
        (details.client?.trim() || userAgent)?.slice(0, MAX_CLIENT_LENGTH) ??
        null,
    })
    .returning();
  log.info("session started", {
    sessionId: id,
    agentId: agent.agentId,
    repositoryId: repository.id,
    client: row!.client,
  });
  const session = toSession({
    ...row!,
    agentName: agent.agentName,
    repositoryName: repository.name,
  });
  return {
    session,
    repository,
    git: { remote: fork.remote, ...fork.token },
    instructions: await sessionInstructions({
      remote: fork.remote,
      tokenExpiresAt: fork.token.expiresAt,
      baseBranch: session.baseBranch,
      baseCommit: session.baseCommit,
      links: linksFor(id),
      client: session.client,
      groupedOnServer: await groupsOnServer(),
    }),
  };
}

// The session, if this principal may act on it: its own agent, or the user
// who owns that agent.
export async function getSession(
  principal: Principal,
  id: string,
): Promise<Session> {
  const [row] = await getDb()
    .select({
      ...getTableColumns(agentSessions),
      agentName: agents.name,
      repositoryName: repositories.name,
    })
    .from(agentSessions)
    .innerJoin(agents, eq(agents.id, agentSessions.agentId))
    .innerJoin(repositories, eq(repositories.id, agentSessions.repositoryId))
    .where(eq(agentSessions.id, id));
  const allowed =
    row &&
    (principal.kind === "agent"
      ? principal.agentId === row.agentId
      : await ownsAgent(principal.userId, row.agentId));
  if (!allowed) {
    throw new ForgeError("NOT_FOUND", "Session not found");
  }
  return toSession(row);
}

export async function updateSession(
  principal: Principal,
  id: string,
  details: SessionDetails,
): Promise<Session> {
  await getSession(principal, id);
  await getDb()
    .update(agentSessions)
    .set({ ...details, updatedAt: new Date() })
    .where(eq(agentSessions.id, id));
  log.info("session updated", { sessionId: id });
  return getSession(principal, id);
}

export async function sessionToken(
  principal: Principal,
  id: string,
): Promise<GitToken & { remote: string }> {
  const session = await activeSession(principal, id);
  requireGit();
  await authorizeId(principal, session.repositoryId, "write");
  const git = getGitHost();
  const [remote, token] = await Promise.all([
    git.remote(session.artifactsName),
    git.token(session.artifactsName, "write", SESSION_TOKEN_TTL_SECONDS),
  ]);
  log.info("session token issued", { sessionId: id });
  return { remote, ...token };
}

export async function endSession(
  principal: Principal,
  id: string,
): Promise<Session> {
  await getSession(principal, id);
  await getDb()
    .update(agentSessions)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentSessions.id, id));
  log.info("session ended", { sessionId: id });
  return getSession(principal, id);
}

export async function activeSession(
  principal: Principal,
  id: string,
): Promise<Session> {
  const session = await getSession(principal, id);
  if (session.status !== "active") {
    throw new ForgeError("BAD_REQUEST", "This session has ended");
  }
  return session;
}

export function requireAgent(principal: Principal): AgentPrincipal {
  if (principal.kind !== "agent") {
    throw new ForgeError(
      "FORBIDDEN",
      "Sessions are for agents: use one of your agent's API keys",
    );
  }
  return principal;
}

async function createEmpty(name: string, defaultBranch: string) {
  const git = getGitHost();
  await git.create(name, { defaultBranch });
  const [remote, token] = await Promise.all([
    git.remote(name),
    git.token(name, "write", SESSION_TOKEN_TTL_SECONDS),
  ]);
  return { remote, token };
}

async function ownsAgent(userId: string, agentId: string): Promise<boolean> {
  return (await getAgent(agentId))?.ownerUserId === userId;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    agentId: row.agentId,
    agentName: row.agentName,
    repositoryId: row.repositoryId,
    repositoryName: row.repositoryName,
    title: row.title,
    goal: row.goal,
    context: row.context,
    status: row.status,
    artifactsName: row.artifactsName,
    baseBranch: row.baseBranch,
    baseCommit: row.baseCommit,
    client: row.client,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
