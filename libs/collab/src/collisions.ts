import {
  getDb,
  agentSessions,
  agents,
  pullRequests,
  repositoryRules,
  sessionCollisions,
  sessionFiles,
  newEntityId,
  and,
  eq,
  inArray,
  isNull,
  ne,
  or,
  type RuleMatch,
} from "@lib/db-models";
import { sessionMessagingOn } from "@lib/ai";
import { getUserProfile } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { SESSION_LIVE_MS } from "@lib/contract";
import {
  exclusiveCollisions,
  exclusiveRuleMatcher,
  type ExclusiveCollision,
  type ExclusiveRule,
  type PathHolder,
} from "./exclusive";
import { notifySession } from "./notifications";

const log = moduleLogger("collab/collisions");

// The most paths one look-up names, under D1's limit on bound parameters.
const PATH_CHUNK = 80;

interface Taker {
  id: string;
  repositoryId: string;
}

// Finds what a session collides with now that it holds `paths`, which it did
// not hold before. Each kind of collision is a detector; marked-exclusive
// files are the only kind so far.
type CollisionDetector = (
  taker: Taker,
  paths: string[],
) => Promise<ExclusiveCollision[]>;

const DETECTORS: CollisionDetector[] = [exclusiveFiles];

// Records each new collision once, and tells the session that caused it: the
// one that just took the paths. The session it collided with is not told.
export async function detectCollisions(
  taker: Taker,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  const found = (
    await Promise.all(DETECTORS.map((detect) => detect(taker, paths)))
  ).flat();
  for (const collision of found) {
    await recordCollision(taker, collision);
  }
}

// Resolves the session's open collisions that either side no longer holds.
export async function resolveCollisions(sessionId: string): Promise<void> {
  const open = await getDb()
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
    );
  for (const collision of open) {
    const [a, b] = await Promise.all([
      holds(collision.sessionId, collision.path),
      holds(collision.otherSessionId, collision.path),
    ]);
    if (a && b) {
      continue;
    }
    await getDb()
      .update(sessionCollisions)
      .set({ resolvedAt: new Date() })
      .where(eq(sessionCollisions.id, collision.id));
    log.info("collision resolved", {
      collisionId: collision.id,
      sessionId: collision.sessionId,
      otherSessionId: collision.otherSessionId,
    });
  }
}

async function exclusiveFiles(
  taker: Taker,
  paths: string[],
): Promise<ExclusiveCollision[]> {
  const rules = await exclusiveRules(taker.repositoryId);
  const ruleOf = exclusiveRuleMatcher(rules);
  const exclusive = paths.filter((path) => ruleOf(path));
  if (exclusive.length === 0) {
    return [];
  }
  const holders = await holdersOf(taker, exclusive);
  log.info("exclusive files checked", {
    sessionId: taker.id,
    exclusive: exclusive.length,
    heldElsewhere: holders.length,
  });
  return exclusiveCollisions(exclusive, rules, holders);
}

// The repository's enabled mark-exclusive rules.
export async function exclusiveRules(
  repositoryId: string,
): Promise<ExclusiveRule[]> {
  const rows = await getDb()
    .select({
      id: repositoryRules.id,
      name: repositoryRules.name,
      match: repositoryRules.match,
    })
    .from(repositoryRules)
    .where(
      and(
        eq(repositoryRules.repositoryId, repositoryId),
        eq(repositoryRules.action, "mark-exclusive"),
        eq(repositoryRules.enabled, true),
      ),
    );
  return rows.flatMap(({ id, name, match }) => filesRule(id, name, match));
}

function filesRule(
  id: string,
  name: string,
  match: RuleMatch,
): ExclusiveRule[] {
  return match.kind === "files"
    ? [{ id, name, syntax: match.syntax, patterns: match.patterns }]
    : [];
}

// Other sessions of the repository holding any of the paths: a declared file
// only while its session is active, a committed one until it is released.
async function holdersOf(taker: Taker, paths: string[]): Promise<PathHolder[]> {
  const holders: PathHolder[] = [];
  for (let i = 0; i < paths.length; i += PATH_CHUNK) {
    const rows = await getDb()
      .select({
        sessionId: sessionFiles.sessionId,
        path: sessionFiles.path,
        source: sessionFiles.source,
        branch: sessionFiles.branch,
        status: agentSessions.status,
        expiresAt: sessionFiles.expiresAt,
      })
      .from(sessionFiles)
      .innerJoin(agentSessions, eq(agentSessions.id, sessionFiles.sessionId))
      .where(
        and(
          eq(sessionFiles.repositoryId, taker.repositoryId),
          ne(sessionFiles.sessionId, taker.id),
          inArray(sessionFiles.path, paths.slice(i, i + PATH_CHUNK)),
        ),
      );
    holders.push(...rows.filter(isLive));
  }
  return holders;
}

function isLive(row: {
  source: "declared" | "committed";
  status: "active" | "ended";
  expiresAt: Date | null;
}): boolean {
  const unexpired = !row.expiresAt || row.expiresAt.getTime() > Date.now();
  return unexpired && (row.source === "committed" || row.status === "active");
}

async function holds(sessionId: string, path: string): Promise<boolean> {
  const rows = await getDb()
    .select({
      source: sessionFiles.source,
      expiresAt: sessionFiles.expiresAt,
      status: agentSessions.status,
    })
    .from(sessionFiles)
    .innerJoin(agentSessions, eq(agentSessions.id, sessionFiles.sessionId))
    .where(
      and(eq(sessionFiles.sessionId, sessionId), eq(sessionFiles.path, path)),
    );
  return rows.some(isLive);
}

async function recordCollision(taker: Taker, collision: ExclusiveCollision) {
  const id = newEntityId("SESSION_COLLISION");
  const [inserted] = await getDb()
    .insert(sessionCollisions)
    .values({
      id,
      repositoryId: taker.repositoryId,
      sessionId: taker.id,
      otherSessionId: collision.holder.sessionId,
      path: collision.path,
      ruleId: collision.rule.id,
    })
    .onConflictDoNothing()
    .returning({ id: sessionCollisions.id });
  if (!inserted) {
    return;
  }
  log.info("collision detected", {
    collisionId: id,
    sessionId: taker.id,
    otherSessionId: collision.holder.sessionId,
    ruleId: collision.rule.id,
  });
  const other = await describeHolder(taker.id, collision.holder);
  await notifySession(taker.id, {
    kind: "collision",
    body: collisionNotice(collision, other),
    data: {
      path: collision.path,
      rule: collision.rule,
      other,
    },
    collisionId: id,
  });
}

interface HolderDescription {
  sessionId: string;
  title: string | null;
  agent: string;
  ownerName: string | null;
  live: boolean;
  since: number;
  source: "declared" | "committed";
  branch: string | null;
  pullRequest: { number: number; status: string } | null;
  contact: unknown[] | null;
  messageUrl: string | null;
}

async function describeHolder(
  takerId: string,
  holder: PathHolder,
): Promise<HolderDescription> {
  const db = getDb();
  const [[row], [file], [pr], messaging] = await Promise.all([
    db
      .select({
        title: agentSessions.title,
        lastSeenAt: agentSessions.lastSeenAt,
        status: agentSessions.status,
        contact: agentSessions.contact,
        agent: agents.name,
        ownerUserId: agents.ownerUserId,
      })
      .from(agentSessions)
      .innerJoin(agents, eq(agents.id, agentSessions.agentId))
      .where(eq(agentSessions.id, holder.sessionId)),
    db
      .select({ touchedAt: sessionFiles.touchedAt })
      .from(sessionFiles)
      .where(
        and(
          eq(sessionFiles.sessionId, holder.sessionId),
          eq(sessionFiles.path, holder.path),
          eq(sessionFiles.source, holder.source),
          eq(sessionFiles.branch, holder.branch),
        ),
      ),
    holder.source === "committed"
      ? db
          .select({ number: pullRequests.number, status: pullRequests.status })
          .from(pullRequests)
          .where(
            and(
              eq(pullRequests.sessionId, holder.sessionId),
              eq(pullRequests.branch, holder.branch),
            ),
          )
      : Promise.resolve([]),
    sessionMessagingOn(),
  ]);
  const owner = row ? await getUserProfile(row.ownerUserId) : null;
  const live =
    row?.status === "active" &&
    !!row.lastSeenAt &&
    Date.now() - row.lastSeenAt.getTime() < SESSION_LIVE_MS;
  return {
    sessionId: holder.sessionId,
    title: row?.title ?? null,
    agent: row?.agent ?? "an agent",
    ownerName: owner?.name ?? null,
    live,
    since: file?.touchedAt.getTime() ?? Date.now(),
    source: holder.source,
    branch: holder.source === "committed" ? holder.branch : null,
    pullRequest: pr ?? null,
    contact: messaging ? (row?.contact ?? null) : null,
    messageUrl:
      messaging && row?.status === "active"
        ? `/api/sessions/${takerId}/messages`
        : null,
  };
}

// What the session that caused a collision is told, in markdown.
function collisionNotice(
  collision: ExclusiveCollision,
  other: HolderDescription,
): string {
  const who = `${other.title ? `_${other.title}_ by` : "a session of"} agent \`${other.agent}\`${other.ownerName ? ` for ${other.ownerName}` : ""}`;
  const where =
    other.source === "committed"
      ? `committed on branch \`${other.branch}\`${other.pullRequest ? ` (pull request #${other.pullRequest.number}, ${other.pullRequest.status})` : ""}`
      : "editing it now";
  const reach = [
    other.messageUrl
      ? `Ask it with \`POST ${other.messageUrl}\` and \`{"to": "${other.sessionId}", "body": "…"}\`${other.live ? "; it is live now" : "; it is not live, so an answer may take a while"}.`
      : null,
    other.contact?.length
      ? `Or reach it directly: ${JSON.stringify(other.contact)}.`
      : null,
    !other.messageUrl ? "Go through the person you work for." : null,
  ].filter(Boolean);
  return [
    `**\`${collision.path}\` is exclusive** (rule _${collision.rule.name}_), and another session already holds it: ${who}, since ${new Date(other.since).toISOString()}, ${where}. Two versions of this file cannot be merged.`,
    "Stop changing it, and tell the person you work for so they can decide which session keeps it.",
    ...reach,
  ].join("\n\n");
}
