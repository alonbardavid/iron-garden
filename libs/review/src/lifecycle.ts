import { PRODUCT_DISPLAY_NAME } from "@lib/contract/constants";
import {
  agentSessions,
  and,
  eq,
  getDb,
  inArray,
  pullRequests,
  type GithubPullState,
  type MergeMethod,
} from "@lib/db-models";
import { authorize, ForgeError, requireGit, requireUser } from "@lib/forge";
import {
  getGitHost,
  landBranch,
  transferRefs,
  type GitRemote,
} from "@lib/git-host";
import { getUserProfile, type Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";

const log = moduleLogger("review/lifecycle");

// Long enough to copy a branch's objects and land it.
const MERGE_TOKEN_TTL_SECONDS = 10 * 60;

type PullRequestRow = typeof pullRequests.$inferSelect;

// An open pull request someone may merge, with the session repository its
// branch lives in.
export interface MergeablePullRequest {
  row: PullRequestRow;
  repositoryId: string;
  artifactsName: string;
  sessionArtifactsName: string;
}

export interface GithubLink {
  number: number;
  url: string;
  state: GithubPullState;
}

// The pull request, if this person may merge it: Write on the repository,
// and open (grouped and not yet merged or closed). Agents propose; people
// merge.
export async function mergeablePullRequest(
  principal: Principal,
  repositoryName: string,
  number: number,
): Promise<MergeablePullRequest> {
  requireUser(principal);
  const repository = await authorize(principal, repositoryName, "write");
  const [found] = await getDb()
    .select({ row: pullRequests, fork: agentSessions.artifactsName })
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
  return {
    row: found.row,
    repositoryId: repository.id,
    artifactsName: repository.artifactsName,
    // One opened from GitHub has its branch mirrored into the repository.
    sessionArtifactsName: assertMergeable(
      found.row,
      found.row.origin === "github" ? repository.artifactsName : found.fork,
    ),
  };
}

// Merges in this instance's own git storage, for a repository not connected
// to GitHub. The branch's commits are copied in as refs/pull/<n>/head, then
// landed by `method`. Without a content merge this needs the target branch
// not to have moved past where the branch left it.
export async function mergeLocally(
  principal: Principal,
  pr: MergeablePullRequest,
  method: MergeMethod,
): Promise<void> {
  requireGit();
  const { row } = pr;
  const git = getGitHost();
  const [fork, main] = await Promise.all([
    git.gitRemote(pr.sessionArtifactsName, "read", MERGE_TOKEN_TTL_SECONDS),
    git.gitRemote(pr.artifactsName, "write", MERGE_TOKEN_TTL_SECONDS),
  ]);
  await copyReviewedHead(fork, main, row);
  const { target, head } = await landingPoint(pr);
  const commit = await landBranch(main, {
    branch: row.targetBranch,
    expected: target,
    head,
    method,
    message: mergeMessage(row, method),
    author: await signatureOf(principal.userId),
  });
  await markMerged(row.id, { method, commit, by: principal.userId });
}

// Copies the reviewed head of the session branch into another repository,
// refusing if the branch has commits the review has not seen.
export async function copyReviewedHead(
  fork: GitRemote,
  target: GitRemote,
  row: Pick<PullRequestRow, "number" | "branch" | "headCommit">,
  targetRef = `refs/pull/${row.number}/head`,
): Promise<void> {
  await transferRefs(fork, target, (source, current) => {
    const tip = source.get(`refs/heads/${row.branch}`);
    if (tip !== row.headCommit) {
      throw new ForgeError(
        "CONFLICT",
        `${row.branch} has commits this review has not seen. The agent needs to refresh the pull request first.`,
      );
    }
    const from = current.get(targetRef) ?? null;
    return from === row.headCommit
      ? []
      : [{ ref: targetRef, from, to: row.headCommit }];
  });
}

export async function markMerged(
  pullRequestId: string,
  merge: {
    method: MergeMethod | null;
    commit: string | null;
    by: string | null;
  },
): Promise<void> {
  await getDb()
    .update(pullRequests)
    .set({
      status: "merged",
      mergeMethod: merge.method,
      mergeCommit: merge.commit,
      mergedBy: merge.by,
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pullRequests.id, pullRequestId));
  log.info("pull request merged", {
    pullRequestId,
    method: merge.method,
  });
}

export async function markClosed(pullRequestId: string): Promise<void> {
  await getDb()
    .update(pullRequests)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pullRequests.id, pullRequestId),
        inArray(pullRequests.status, ["processing", "open"]),
      ),
    );
  log.info("pull request closed", { pullRequestId });
}

export async function markReopened(pullRequestId: string): Promise<void> {
  await getDb()
    .update(pullRequests)
    .set({ status: "open", closedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(pullRequests.id, pullRequestId),
        eq(pullRequests.status, "closed"),
      ),
    );
  log.info("pull request reopened", { pullRequestId });
}

export async function linkGithub(
  pullRequestId: string,
  link: GithubLink,
): Promise<void> {
  await getDb()
    .update(pullRequests)
    .set({
      githubNumber: link.number,
      githubUrl: link.url,
      githubState: link.state,
      updatedAt: new Date(),
    })
    .where(eq(pullRequests.id, pullRequestId));
  log.info("pull request linked to github", {
    pullRequestId,
    githubNumber: link.number,
    state: link.state,
  });
}

// The pull requests on a branch, newest first: the ones a GitHub pull
// request or branch of that name stands for.
export async function pullRequestsOnBranch(
  repositoryId: string,
  branch: string,
): Promise<PullRequestRow[]> {
  return getDb()
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repositoryId, repositoryId),
        eq(pullRequests.branch, branch),
      ),
    )
    .orderBy(pullRequests.number);
}

// The pull request and the session repository its branch lives in, null
// once that session is gone, and for one opened from GitHub, whose branch
// GitHub itself holds.
export async function pullRequestWithFork(
  id: string,
): Promise<{ row: PullRequestRow; fork: string | null }> {
  const [found] = await getDb()
    .select({ row: pullRequests, fork: agentSessions.artifactsName })
    .from(pullRequests)
    .leftJoin(agentSessions, eq(agentSessions.id, pullRequests.sessionId))
    .where(eq(pullRequests.id, id));
  if (!found) {
    throw new ForgeError("NOT_FOUND", "Pull request not found");
  }
  return {
    row: found.row,
    fork: found.row.origin === "github" ? null : found.fork,
  };
}

function assertMergeable(row: PullRequestRow, fork: string | null): string {
  if (row.status !== "open") {
    throw new ForgeError(
      "BAD_REQUEST",
      row.status === "processing"
        ? "This pull request has not been grouped yet"
        : `This pull request is already ${row.status}`,
    );
  }
  if (!fork) {
    throw new ForgeError(
      "BAD_REQUEST",
      "The session this pull request came from is gone",
    );
  }
  return fork;
}

// The target's tip and the reviewed head, once the head is known to
// contain the tip.
async function landingPoint(pr: MergeablePullRequest) {
  const { row } = pr;
  const git = getGitHost();
  const [target, head, base] = await Promise.all([
    git.resolve(pr.artifactsName, row.targetBranch),
    git.resolve(pr.artifactsName, row.headCommit),
    git.mergeBase(pr.artifactsName, row.targetBranch, row.headCommit),
  ]);
  if (!head) {
    throw new ForgeError("UNAVAILABLE", "The branch's commits did not arrive");
  }
  if (target && base?.commit !== target.commit) {
    log.info("local merge refused: target moved", { pullRequestId: row.id });
    throw new ForgeError(
      "CONFLICT",
      `${row.targetBranch} has moved on since ${row.branch} left it. The agent needs to merge ${row.targetBranch} into its branch and refresh the pull request.`,
    );
  }
  return { target: target?.commit ?? null, head };
}

async function signatureOf(userId: string) {
  const person = await getUserProfile(userId);
  return {
    name: person?.name ?? PRODUCT_DISPLAY_NAME,
    email: person?.email ?? "noreply@iron-garden.local",
    at: new Date(),
  };
}

// GitHub's own wording for each method's commit.
export function mergeMessage(
  row: Pick<PullRequestRow, "number" | "branch" | "title" | "description">,
  method: MergeMethod,
): string {
  return method === "merge"
    ? `Merge pull request #${row.number} from ${row.branch}\n\n${row.title}`
    : `${row.title} (#${row.number})\n\n${row.description ?? ""}`;
}
