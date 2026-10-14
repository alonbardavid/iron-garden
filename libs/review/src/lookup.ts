import { and, eq, getDb, pullRequests, agentSessions } from "@lib/db-models";
import { getSession, type Session } from "@lib/collab";
import {
  authorize,
  authorizeId,
  ForgeError,
  type AccessibleRepository,
} from "@lib/forge";
import type { Principal } from "@lib/identity";

export type PullRequestRow = typeof pullRequests.$inferSelect;

export interface FoundPullRequest {
  row: PullRequestRow;
  repository: AccessibleRepository;
  // The session repository the branch lives in; null once it is gone.
  artifactsName: string | null;
}

// A pull request by its number, for a principal who can read the
// repository.
export async function pullRequestByNumber(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<FoundPullRequest> {
  const repository = await authorize(principal, repositoryName, "read");
  const [found] = await getDb()
    .select({ row: pullRequests, artifactsName: agentSessions.artifactsName })
    .from(pullRequests)
    .leftJoin(agentSessions, eq(agentSessions.id, pullRequests.sessionId))
    .where(
      and(
        eq(pullRequests.repositoryId, repository.id),
        eq(pullRequests.number, number),
      ),
    );
  if (!found) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  return { ...found, repository };
}

// The pull request, if this principal opened it: its agent, or the agent's
// owner, who still needs Write on the repository.
export async function authorOf(
  principal: Principal,
  pullRequestId: string,
): Promise<{
  row: PullRequestRow;
  repository: AccessibleRepository;
  session: Session;
}> {
  const [row] = await getDb()
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.id, pullRequestId));
  if (!row?.sessionId) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  const session = await getSession(principal, row.sessionId).catch(() => {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  });
  const repository = await authorizeId(principal, row.repositoryId, "write");
  return { row, repository, session };
}
