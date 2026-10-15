import {
  getDb,
  agentSessions,
  agents,
  repositories,
  newEntityId,
  and,
  eq,
  getTableColumns,
  isNull,
  lt,
  or,
  type SessionContact,
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
import { groupsOnServer, sessionMessagingOn } from "@lib/ai";
import { inbox } from "./inbox";
import { rekeyListener } from "./listener";
import { returnUndelivered } from "./messages";
import { sessionInstructions, type SessionLinks } from "./session-prompt";
import { releaseOnEnd } from "./working-set";

const log = moduleLogger("collab/sessions");

const SESSION_TOKEN_TTL_SECONDS = 8 * 60 * 60;

const SEEN_WRITE_MS = 60_000;

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
  contact: SessionContact[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionDetails {
  title?: string | null;
  goal?: string | null;
  context?: string | null;
  contact?: SessionContact[] | null;
}

export interface StartedSession {
  session: Session;
  repository: AccessibleRepository;
  git: GitToken & { remote: string };
  instructions: string;
  // The key in the URLs the session's listener connects on.
  listenKey: string;
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
      contact: details.contact ?? null,
      artifactsName: id,
      baseBranch: repository.defaultBranch,
      baseCommit: base?.commit ?? null,
      client:
        (details.client?.trim() || userAgent)?.slice(0, MAX_CLIENT_LENGTH) ??
        null,
      lastSeenAt: new Date(),
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
  const listenKey = await rekeyListener(id);
  return {
    session,
    repository,
    listenKey,
    git: { remote: linksFor(id).remote, ...fork.token },
    instructions: await sessionInstructions({
      remote: linksFor(id).remote,
      tokenExpiresAt: fork.token.expiresAt,
      baseBranch: session.baseBranch,
      baseCommit: session.baseCommit,
      links: linksFor(id),
      client: session.client,
      groupedOnServer: await groupsOnServer(),
      messaging: await sessionMessagingOn(),
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
  if (principal.kind === "agent") {
    await markSeen(row);
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

// A fresh git token for the session repository, with its remote.
export async function sessionToken(
  principal: Principal,
  id: string,
  linksFor: (sessionId: string) => Pick<SessionLinks, "remote">,
): Promise<GitToken & { remote: string }> {
  const session = await activeSession(principal, id);
  requireGit();
  await authorizeId(principal, session.repositoryId, "write");
  const token = await getGitHost().token(
    session.artifactsName,
    "write",
    SESSION_TOKEN_TTL_SECONDS,
  );
  log.info("session token issued", { sessionId: id });
  return { remote: linksFor(id).remote, ...token };
}

export async function endSession(
  principal: Principal,
  id: string,
): Promise<Session> {
  await getSession(principal, id);
  await getDb()
    .update(agentSessions)
    .set({
      status: "ended",
      endedAt: new Date(),
      updatedAt: new Date(),
      listenKeyHash: null,
    })
    .where(eq(agentSessions.id, id));
  log.info("session ended", { sessionId: id });
  await releaseOnEnd(id);
  await returnUndelivered(id);
  await inbox.close(id, "The session ended").catch((err: unknown) => {
    log.warn("session listener unreachable", { sessionId: id, err });
  });
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

// The session's agent is still there: it listened, or pushed. Written at
// most once a minute.
export async function touchSession(sessionId: string): Promise<void> {
  await getDb()
    .update(agentSessions)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(agentSessions.id, sessionId),
        or(
          isNull(agentSessions.lastSeenAt),
          lt(agentSessions.lastSeenAt, new Date(Date.now() - SEEN_WRITE_MS)),
        ),
      ),
    );
}

// Every call the session's own agent makes for it keeps it live. Written at
// most once a minute, since every session call passes here.
async function markSeen(row: SessionRow): Promise<void> {
  const now = new Date();
  if (
    row.lastSeenAt &&
    now.getTime() - row.lastSeenAt.getTime() < SEEN_WRITE_MS
  ) {
    return;
  }
  await getDb()
    .update(agentSessions)
    .set({ lastSeenAt: now })
    .where(eq(agentSessions.id, row.id));
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
    contact: row.contact ?? [],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
