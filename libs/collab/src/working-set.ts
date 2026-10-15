import {
  getDb,
  agentSessions,
  pullRequests,
  sessionBranches,
  sessionFiles,
  newEntityId,
  and,
  eq,
  inArray,
  isNotNull,
  lt,
  type SessionFileSource,
} from "@lib/db-models";
import { authorize, ForgeError } from "@lib/forge";
import { getGitHost } from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { detectCollisions, resolveCollisions } from "./collisions";
import { takeNotifications, type SessionNotification } from "./notifications";
import { normalizeSessionPaths } from "./session-paths";
import { activeSession, type Session } from "./sessions";

const log = moduleLogger("collab/working-set");

// A declared file lapses this long after the last report naming it.
export const DECLARED_TTL_MS = 30 * 60_000;

// A committed file on a branch with no pull request lapses this long after
// its session ends.
const UNMERGED_GRACE_MS = 7 * 24 * 60 * 60_000;

// The most rows one D1 batch writes.
const BATCH = 50;

interface SessionRef {
  id: string;
  repositoryId: string;
}

export interface ActivityReport {
  editing: string[];
  done: string[];
}

// The files a session's agent says it is changing now, and the ones it
// stopped changing. Answers with what the session has not been told yet,
// including any collision this report caused.
export async function reportActivity(
  principal: Principal,
  sessionId: string,
  report: ActivityReport,
): Promise<{ notifications: SessionNotification[]; refused: string[] }> {
  const session = await activeSession(principal, sessionId);
  const editing = normalizeSessionPaths(report.editing);
  const done = normalizeSessionPaths(report.done);
  const taken = await declareFiles(session, editing.paths);
  await dropFiles(session.id, "declared", "", done.paths);
  await detectCollisions(session, taken);
  await resolveCollisions(session.id);
  log.info("session activity reported", {
    sessionId: session.id,
    editing: editing.paths.length,
    done: done.paths.length,
    taken: taken.length,
    refused: editing.refused.length + done.refused.length,
  });
  return {
    notifications: await takeNotifications(session.id),
    refused: [...editing.refused, ...done.refused],
  };
}

// The files a pushed branch changes against where it left the session's base,
// in place of what the branch changed before. A file the branch changed and
// then reverted stops counting.
export async function recordCommittedFiles(
  session: SessionRef,
  branch: { name: string; headCommit: string; mergeBase: string | null },
  paths: string[],
): Promise<void> {
  const heldBefore = await heldPaths(session.id);
  await upsertBranch(session.id, branch);
  await getDb()
    .delete(sessionFiles)
    .where(
      and(
        eq(sessionFiles.sessionId, session.id),
        eq(sessionFiles.source, "committed"),
        eq(sessionFiles.branch, branch.name),
      ),
    );
  await insertFiles(session, "committed", branch.name, paths, null);
  const taken = paths.filter((path) => !heldBefore.has(path));
  await detectCollisions(session, taken);
  await resolveCollisions(session.id);
  log.info("session branch recorded", {
    sessionId: session.id,
    branch: branch.name,
    files: paths.length,
    taken: taken.length,
  });
}

// Reads a pushed branch from the session repository and records it.
export async function recordBranchHead(
  session: Pick<
    Session,
    "id" | "repositoryId" | "artifactsName" | "baseCommit"
  >,
  branch: string,
): Promise<void> {
  const git = getGitHost();
  const head = await git.resolve(session.artifactsName, branch);
  if (!head) {
    log.info("pushed branch gone", { sessionId: session.id, branch });
    return;
  }
  const base = session.baseCommit
    ? await git.mergeBase(
        session.artifactsName,
        session.baseCommit,
        head.commit,
      )
    : null;
  const changed = await git.changedFiles(session.artifactsName, base, head);
  await recordCommittedFiles(
    session,
    { name: branch, headCommit: head.commit, mergeBase: base?.commit ?? null },
    changed.map((file) => file.path),
  );
}

// A branch's pull request merged or closed, or the branch went: its files
// stop counting.
export async function releasePullRequestBranch(
  pullRequestId: string,
): Promise<void> {
  const [pr] = await getDb()
    .select({ sessionId: pullRequests.sessionId, branch: pullRequests.branch })
    .from(pullRequests)
    .where(eq(pullRequests.id, pullRequestId));
  if (!pr?.sessionId) {
    return;
  }
  await releaseBranch(pr.sessionId, pr.branch);
  log.info("pull request branch released", {
    pullRequestId,
    sessionId: pr.sessionId,
  });
}

// A push deleted the branch from the session repository.
export async function releasePushedBranch(
  sessionId: string,
  branch: string,
): Promise<void> {
  await releaseBranch(sessionId, branch);
  log.info("deleted branch released", { sessionId, branch });
}

// A session ended: what it said it was editing goes at once; what its
// branches changed stays while their pull requests are open, and a while
// longer for a branch with none.
export async function releaseOnEnd(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(sessionFiles)
    .where(
      and(
        eq(sessionFiles.sessionId, sessionId),
        eq(sessionFiles.source, "declared"),
      ),
    );
  const lapsing = await branchesWithoutPullRequest(sessionId);
  const expiresAt = new Date(Date.now() + UNMERGED_GRACE_MS);
  for (let i = 0; i < lapsing.length; i += BATCH) {
    await db
      .update(sessionFiles)
      .set({ expiresAt })
      .where(
        and(
          eq(sessionFiles.sessionId, sessionId),
          eq(sessionFiles.source, "committed"),
          inArray(sessionFiles.branch, lapsing.slice(i, i + BATCH)),
        ),
      );
  }
  await resolveCollisions(sessionId);
  log.info("session working set released", {
    sessionId,
    lapsingBranches: lapsing.length,
  });
}

// Someone with Write clears an ended session's branches that never got a
// pull request.
export async function dismissUnmergedWork(
  principal: Principal,
  repositoryName: string,
  sessionId: string,
): Promise<void> {
  const repository = await authorize(principal, repositoryName, "write");
  await requireEnded(repository.id, sessionId);
  const dismissed = await branchesWithoutPullRequest(sessionId);
  for (const branch of dismissed) {
    await releaseBranch(sessionId, branch);
  }
  log.info("session unmerged work dismissed", {
    sessionId,
    userId: principal.userId,
    branches: dismissed.length,
  });
}

// Upserts declared files with a fresh expiry; the paths the session did not
// hold before.
async function declareFiles(
  session: SessionRef,
  paths: string[],
): Promise<string[]> {
  await dropExpired(session.id);
  const heldBefore = await heldPaths(session.id);
  await insertFiles(
    session,
    "declared",
    "",
    paths,
    new Date(Date.now() + DECLARED_TTL_MS),
  );
  return paths.filter((path) => !heldBefore.has(path));
}

async function insertFiles(
  session: SessionRef,
  source: SessionFileSource,
  branch: string,
  paths: string[],
  expiresAt: Date | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  for (let i = 0; i < paths.length; i += BATCH) {
    const statements = paths.slice(i, i + BATCH).map((path) =>
      db
        .insert(sessionFiles)
        .values({
          id: newEntityId("SESSION_FILE"),
          sessionId: session.id,
          repositoryId: session.repositoryId,
          path,
          source,
          branch,
          touchedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            sessionFiles.sessionId,
            sessionFiles.source,
            sessionFiles.branch,
            sessionFiles.path,
          ],
          set: { touchedAt: now, expiresAt },
        }),
    );
    await db.batch(statements as [(typeof statements)[0]]);
  }
}

async function dropFiles(
  sessionId: string,
  source: SessionFileSource,
  branch: string,
  paths: string[],
): Promise<void> {
  for (let i = 0; i < paths.length; i += BATCH) {
    await getDb()
      .delete(sessionFiles)
      .where(
        and(
          eq(sessionFiles.sessionId, sessionId),
          eq(sessionFiles.source, source),
          eq(sessionFiles.branch, branch),
          inArray(sessionFiles.path, paths.slice(i, i + BATCH)),
        ),
      );
  }
}

async function dropExpired(sessionId: string): Promise<void> {
  await getDb()
    .delete(sessionFiles)
    .where(
      and(
        eq(sessionFiles.sessionId, sessionId),
        isNotNull(sessionFiles.expiresAt),
        lt(sessionFiles.expiresAt, new Date()),
      ),
    );
}

async function releaseBranch(sessionId: string, branch: string) {
  const db = getDb();
  await db
    .delete(sessionFiles)
    .where(
      and(
        eq(sessionFiles.sessionId, sessionId),
        eq(sessionFiles.source, "committed"),
        eq(sessionFiles.branch, branch),
      ),
    );
  await db
    .delete(sessionBranches)
    .where(
      and(
        eq(sessionBranches.sessionId, sessionId),
        eq(sessionBranches.branch, branch),
      ),
    );
  await resolveCollisions(sessionId);
}

async function upsertBranch(
  sessionId: string,
  branch: { name: string; headCommit: string; mergeBase: string | null },
): Promise<void> {
  await getDb()
    .insert(sessionBranches)
    .values({
      id: newEntityId("SESSION_BRANCH"),
      sessionId,
      branch: branch.name,
      headCommit: branch.headCommit,
      mergeBase: branch.mergeBase,
    })
    .onConflictDoUpdate({
      target: [sessionBranches.sessionId, sessionBranches.branch],
      set: {
        headCommit: branch.headCommit,
        mergeBase: branch.mergeBase,
        updatedAt: new Date(),
      },
    });
}

// Every path the session holds now, whatever its source.
async function heldPaths(sessionId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ path: sessionFiles.path, expiresAt: sessionFiles.expiresAt })
    .from(sessionFiles)
    .where(eq(sessionFiles.sessionId, sessionId));
  const now = Date.now();
  return new Set(
    rows
      .filter((row) => !row.expiresAt || row.expiresAt.getTime() > now)
      .map((row) => row.path),
  );
}

async function requireEnded(repositoryId: string, sessionId: string) {
  const [session] = await getDb()
    .select({ status: agentSessions.status })
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.id, sessionId),
        eq(agentSessions.repositoryId, repositoryId),
      ),
    );
  if (!session) {
    throw new ForgeError("NOT_FOUND", "Session not found");
  }
  if (session.status !== "ended") {
    throw new ForgeError(
      "BAD_REQUEST",
      "Only an ended session's work can be dismissed",
    );
  }
}

// The session's pushed branches with no pull request processing or open.
async function branchesWithoutPullRequest(
  sessionId: string,
): Promise<string[]> {
  const db = getDb();
  const [pushed, reviewed] = await Promise.all([
    db
      .select({ branch: sessionBranches.branch })
      .from(sessionBranches)
      .where(eq(sessionBranches.sessionId, sessionId)),
    db
      .select({ branch: pullRequests.branch })
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.sessionId, sessionId),
          inArray(pullRequests.status, ["processing", "open"]),
        ),
      ),
  ]);
  const open = new Set(reviewed.map((row) => row.branch));
  return pushed.map((row) => row.branch).filter((branch) => !open.has(branch));
}
