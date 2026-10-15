import {
  getDb,
  agentSessions,
  agents,
  chatChannels,
  pullRequests,
  sessionBranches,
  sessionCollisions,
  sessionFiles,
  sessionNotifications,
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  max,
  or,
  type PullRequestStatus,
  type SessionContact,
  type SessionStatus,
} from "@lib/db-models";
import { sessionMessagingOn } from "@lib/ai";
import { SESSION_LIVE_MS } from "@lib/contract";
import {
  allows,
  authorize,
  ForgeError,
  type AccessibleRepository,
} from "@lib/forge";
import { getUserProfiles, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { exclusiveRules } from "./collisions";
import { exclusiveRuleMatcher } from "./exclusive";
import { messagesOf } from "./messages";
import type { SessionNotification } from "./notifications";
import {
  transcriptSummariesOf,
  type SessionTranscriptSummary,
} from "./session-transcripts";

const log = moduleLogger("collab/repository-sessions");

export interface SessionPullRequest {
  number: number;
  title: string;
  status: PullRequestStatus;
  branch: string;
}

// A session as anyone who can read its repository sees it: no token, no
// links, nothing only its owner may use.
export interface SessionSummary {
  id: string;
  title: string | null;
  goal: string | null;
  client: string | null;
  status: SessionStatus;
  live: boolean;
  lastSeenAt: number | null;
  agent: { name: string; ownerName: string | null };
  baseBranch: string;
  pullRequests: SessionPullRequest[];
  // A pull request processing or open, or a pushed branch with none.
  unmerged: boolean;
  fileCount: number;
  collisionCount: number;
  createdAt: number;
  endedAt: number | null;
}

export interface SessionCollision {
  id: string;
  path: string;
  rule: string | null;
  caused: boolean;
  other: { id: string; title: string | null; agent: string };
  createdAt: number;
}

export interface SessionOverview extends SessionSummary {
  context: string | null;
  baseCommit: string | null;
  workingSet: {
    editing: string[];
    committed: { branch: string; paths: string[] }[];
    exclusive: string[];
  };
  unmergedBranches: string[];
  collisions: SessionCollision[];
  contact: SessionContact[] | null;
  messages: SessionNotification[] | null;
  transcripts: SessionTranscriptSummary[];
  canChat: boolean;
  canDismiss: boolean;
}

const UNMERGED: ReadonlySet<PullRequestStatus> = new Set([
  "processing",
  "open",
]);

// Every session on the repository, newest first, whichever agent runs it.
export async function listRepositorySessions(
  principal: Principal,
  repositoryName: string,
): Promise<SessionSummary[]> {
  const repository = await authorize(principal, repositoryName, "read");
  const sessions = await readSessions(repository);
  return sessions.map(({ summary }) => summary);
}

// One session, with what only its page shows. Its messages go only to the
// people who own its agent.
export async function getRepositorySession(
  principal: Principal,
  repositoryName: string,
  id: string,
): Promise<SessionOverview> {
  const repository = await authorize(principal, repositoryName, "read");
  const [found] = await readSessions(repository, id);
  if (!found) {
    throw new ForgeError("NOT_FOUND", "Session not found");
  }
  const { row, summary, ownerUserId, related } = found;
  const owns = ownsSession(principal, row.agentId, ownerUserId);
  const [workingSet, collisions, messaging, messages, transcripts] =
    await Promise.all([
      workingSetOf(repository.id, id),
      collisionsOf(id),
      sessionMessagingOn(),
      owns ? messagesOf(id) : Promise.resolve(null),
      transcriptSummariesOf(id),
    ]);
  const unmergedBranches = related.unmergedBranches.get(id) ?? [];
  return {
    ...summary,
    context: row.context,
    baseCommit: row.baseCommit,
    workingSet,
    unmergedBranches,
    collisions,
    contact: messaging ? (row.contact ?? []) : null,
    messages,
    transcripts,
    canChat: owns && principal.kind === "user",
    canDismiss:
      row.status === "ended" &&
      unmergedBranches.length > 0 &&
      allows(repository.level, "write"),
  };
}

type SessionRow = typeof agentSessions.$inferSelect;

interface Related {
  pullRequests: Map<string, SessionPullRequest[]>;
  chatSeenAt: Map<string, number>;
  ownerNames: Map<string, string>;
  fileCounts: Map<string, number>;
  collisionCounts: Map<string, number>;
  unmergedBranches: Map<string, string[]>;
}

async function readSessions(repository: AccessibleRepository, id?: string) {
  const rows = await getDb()
    .select({
      session: agentSessions,
      agentName: agents.name,
      ownerUserId: agents.ownerUserId,
    })
    .from(agentSessions)
    .innerJoin(agents, eq(agents.id, agentSessions.agentId))
    .where(
      and(
        eq(agentSessions.repositoryId, repository.id),
        id ? eq(agentSessions.id, id) : undefined,
      ),
    )
    .orderBy(desc(agentSessions.createdAt));
  log.info("repository sessions read", {
    repositoryId: repository.id,
    sessionId: id,
    count: rows.length,
  });
  const related = await readRelated(
    repository.id,
    rows.map((row) => row.ownerUserId),
  );
  return rows.map(({ session, agentName, ownerUserId }) => ({
    row: session,
    ownerUserId,
    related,
    summary: summarize(session, agentName, ownerUserId, related),
  }));
}

// What the page shows beside each of the repository's sessions, read once
// for all of them by repository: a list of session ids would outgrow D1's
// limit on bound parameters.
async function readRelated(
  repositoryId: string,
  ownerUserIds: string[],
): Promise<Related> {
  const [prs, chatSeenAt, owners, fileCounts, collisionCounts, branches] =
    await Promise.all([
      pullRequestsBySession(repositoryId),
      chatSeenBySession(repositoryId),
      getUserProfiles([...new Set(ownerUserIds)]),
      fileCountsBySession(repositoryId),
      collisionCountsBySession(repositoryId),
      branchesBySession(repositoryId),
    ]);
  return {
    pullRequests: prs,
    chatSeenAt,
    ownerNames: new Map(
      [...owners.values()].map((owner) => [owner.id, owner.name]),
    ),
    fileCounts,
    collisionCounts,
    unmergedBranches: unmergedBranchesOf(branches, prs),
  };
}

function summarize(
  row: SessionRow,
  agentName: string,
  ownerUserId: string,
  related: Related,
): SessionSummary {
  const lastSeenAt = Math.max(
    row.lastSeenAt?.getTime() ?? 0,
    related.chatSeenAt.get(row.id) ?? 0,
  );
  const prs = related.pullRequests.get(row.id) ?? [];
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    client: row.client,
    status: row.status,
    live:
      row.status === "active" &&
      lastSeenAt > 0 &&
      Date.now() - lastSeenAt < SESSION_LIVE_MS,
    lastSeenAt: lastSeenAt || null,
    agent: {
      name: agentName,
      ownerName: related.ownerNames.get(ownerUserId) ?? null,
    },
    baseBranch: row.baseBranch,
    pullRequests: prs,
    unmerged:
      prs.some((pr) => UNMERGED.has(pr.status)) ||
      (related.unmergedBranches.get(row.id)?.length ?? 0) > 0,
    fileCount: related.fileCounts.get(row.id) ?? 0,
    collisionCount: related.collisionCounts.get(row.id) ?? 0,
    createdAt: row.createdAt.getTime(),
    endedAt: row.endedAt?.getTime() ?? null,
  };
}

async function pullRequestsBySession(
  repositoryId: string,
): Promise<Map<string, SessionPullRequest[]>> {
  const rows = await getDb()
    .select({
      sessionId: pullRequests.sessionId,
      number: pullRequests.number,
      title: pullRequests.title,
      status: pullRequests.status,
      branch: pullRequests.branch,
    })
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repositoryId, repositoryId),
        isNotNull(pullRequests.sessionId),
      ),
    )
    .orderBy(desc(pullRequests.number));
  const bySession = new Map<string, SessionPullRequest[]>();
  for (const { sessionId, ...pr } of rows) {
    bySession.set(sessionId!, [...(bySession.get(sessionId!) ?? []), pr]);
  }
  return bySession;
}

// When each session's agent last listened for chat on its pull requests.
async function chatSeenBySession(
  repositoryId: string,
): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      sessionId: chatChannels.sessionId,
      lastSeenAt: max(chatChannels.lastSeenAt),
    })
    .from(chatChannels)
    .innerJoin(agentSessions, eq(agentSessions.id, chatChannels.sessionId))
    .where(
      and(
        eq(agentSessions.repositoryId, repositoryId),
        isNotNull(chatChannels.lastSeenAt),
      ),
    )
    .groupBy(chatChannels.sessionId);
  return new Map(
    rows.map((row) => [row.sessionId!, row.lastSeenAt?.getTime() ?? 0]),
  );
}

// Distinct paths each session holds, leaving lapsed entries out.
async function fileCountsBySession(
  repositoryId: string,
): Promise<Map<string, number>> {
  const paths = new Map<string, Set<string>>();
  for (const row of await liveFiles(repositoryId)) {
    const held = paths.get(row.sessionId) ?? new Set<string>();
    paths.set(row.sessionId, held.add(row.path));
  }
  return new Map([...paths].map(([id, held]) => [id, held.size]));
}

// Open collisions, counted on both sessions.
async function collisionCountsBySession(
  repositoryId: string,
): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      sessionId: sessionCollisions.sessionId,
      otherSessionId: sessionCollisions.otherSessionId,
    })
    .from(sessionCollisions)
    .where(
      and(
        eq(sessionCollisions.repositoryId, repositoryId),
        isNull(sessionCollisions.resolvedAt),
      ),
    );
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const id of [row.sessionId, row.otherSessionId]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

async function branchesBySession(
  repositoryId: string,
): Promise<{ sessionId: string; branch: string }[]> {
  return getDb()
    .select({
      sessionId: sessionBranches.sessionId,
      branch: sessionBranches.branch,
    })
    .from(sessionBranches)
    .innerJoin(agentSessions, eq(agentSessions.id, sessionBranches.sessionId))
    .where(eq(agentSessions.repositoryId, repositoryId));
}

// Pushed branches with no pull request processing or open.
function unmergedBranchesOf(
  branches: { sessionId: string; branch: string }[],
  prs: Map<string, SessionPullRequest[]>,
): Map<string, string[]> {
  const unmerged = new Map<string, string[]>();
  for (const { sessionId, branch } of branches) {
    const reviewed = (prs.get(sessionId) ?? []).some(
      (pr) => pr.branch === branch && UNMERGED.has(pr.status),
    );
    if (!reviewed) {
      unmerged.set(sessionId, [...(unmerged.get(sessionId) ?? []), branch]);
    }
  }
  return unmerged;
}

async function liveFiles(repositoryId: string, sessionId?: string) {
  const rows = await getDb()
    .select({
      sessionId: sessionFiles.sessionId,
      path: sessionFiles.path,
      source: sessionFiles.source,
      branch: sessionFiles.branch,
      expiresAt: sessionFiles.expiresAt,
    })
    .from(sessionFiles)
    .where(
      and(
        eq(sessionFiles.repositoryId, repositoryId),
        sessionId ? eq(sessionFiles.sessionId, sessionId) : undefined,
      ),
    )
    .orderBy(asc(sessionFiles.path));
  const now = Date.now();
  return rows.filter((row) => !row.expiresAt || row.expiresAt.getTime() > now);
}

async function workingSetOf(
  repositoryId: string,
  sessionId: string,
): Promise<SessionOverview["workingSet"]> {
  const [rows, rules] = await Promise.all([
    liveFiles(repositoryId, sessionId),
    exclusiveRules(repositoryId),
  ]);
  const committed = new Map<string, string[]>();
  for (const row of rows.filter((r) => r.source === "committed")) {
    committed.set(row.branch, [...(committed.get(row.branch) ?? []), row.path]);
  }
  const ruleOf = exclusiveRuleMatcher(rules);
  const held = new Set(rows.map((row) => row.path));
  return {
    editing: rows.filter((r) => r.source === "declared").map((r) => r.path),
    committed: [...committed].map(([branch, paths]) => ({ branch, paths })),
    exclusive: [...held].filter((path) => ruleOf(path)),
  };
}

async function collisionsOf(sessionId: string): Promise<SessionCollision[]> {
  const rows = await getDb()
    .select()
    .from(sessionCollisions)
    .where(
      and(
        isNull(sessionCollisions.resolvedAt),
        or(
          eq(sessionCollisions.sessionId, sessionId),
          eq(sessionCollisions.otherSessionId, sessionId),
        ),
      ),
    )
    .orderBy(desc(sessionCollisions.createdAt));
  return Promise.all(rows.map((row) => describeCollision(sessionId, row)));
}

async function describeCollision(
  sessionId: string,
  row: typeof sessionCollisions.$inferSelect,
): Promise<SessionCollision> {
  const caused = row.sessionId === sessionId;
  const otherId = caused ? row.otherSessionId : row.sessionId;
  const db = getDb();
  const [[other], [notice]] = await Promise.all([
    db
      .select({ title: agentSessions.title, agent: agents.name })
      .from(agentSessions)
      .innerJoin(agents, eq(agents.id, agentSessions.agentId))
      .where(eq(agentSessions.id, otherId)),
    db
      .select({ data: sessionNotifications.data })
      .from(sessionNotifications)
      .where(eq(sessionNotifications.collisionId, row.id)),
  ]);
  return {
    id: row.id,
    path: row.path,
    rule: ruleName(notice?.data),
    caused,
    other: {
      id: otherId,
      title: other?.title ?? null,
      agent: other?.agent ?? "an agent",
    },
    createdAt: row.createdAt.getTime(),
  };
}

// The rule's name as the collision's notice recorded it.
function ruleName(data: Record<string, unknown> | null | undefined) {
  const rule = data?.rule as { name?: unknown } | undefined;
  return typeof rule?.name === "string" ? rule.name : null;
}

function ownsSession(
  principal: Principal,
  agentId: string,
  ownerUserId: string,
): boolean {
  return principal.kind === "agent"
    ? principal.agentId === agentId
    : principal.userId === ownerUserId;
}
