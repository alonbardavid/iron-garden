import {
  and,
  eq,
  getDb,
  inArray,
  newEntityId,
  pullRequests,
} from "@lib/db-models";
import { groupsOnServer } from "@lib/ai";
import {
  authorize,
  ForgeError,
  requireGit,
  requireUser,
  type AccessibleRepository,
} from "@lib/forge";
import { getGitHost } from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import type { GithubLink } from "./lifecycle";
import type { PullRequestRow } from "./lookup";
import {
  commitInserts,
  fileInserts,
  loadDetail,
  nextNumber,
  readDiff,
  startGrouping,
  storeRevision,
  type DiffSource,
  type PullRequestDetail,
} from "./pull-requests";
import { snapshotRules } from "./rules/rules";

const log = moduleLogger("review/from-github");

// A revision of a pull request from GitHub has no agent to group it, so
// while the server does not group either it opens without groups.
const SERVER_OFF =
  "Processing on the server is off, so this revision opened without groups";

export interface GithubBranchSource {
  branch: string;
  targetBranch: string;
  title: string;
  description: string | null;
  // The GitHub pull request it stands for, when it was opened from one.
  github: GithubLink | null;
}

// Opens a pull request for a branch the repository mirrors from GitHub. No
// agent wrote it, so it is only offered while the server groups pull
// requests, and the server groups it.
export async function openFromGithubBranch(
  principal: Principal,
  repositoryName: string,
  source: GithubBranchSource,
): Promise<PullRequestDetail> {
  requireUser(principal);
  const repository = await authorize(principal, repositoryName, "write");
  requireGit();
  await requireServerGrouping();
  await refuseDuplicate(repository.id, source);
  const diff = await readDiff(
    await branchSource(repository, source.targetBranch),
    source.branch,
  );
  const id = newEntityId("PULL_REQUEST");
  const number = await nextNumber(repository.id);
  const rules = await snapshotRules(repository.id, id);
  await getDb().batch([
    getDb()
      .insert(pullRequests)
      .values({
        id,
        repositoryId: repository.id,
        number,
        origin: "github",
        authorUserId: principal.userId,
        title: source.title,
        description: source.description,
        branch: source.branch,
        targetBranch: source.targetBranch,
        baseCommit: diff.baseCommit,
        headCommit: diff.headCommit,
        groupedBy: "server",
        githubNumber: source.github?.number ?? null,
        githubUrl: source.github?.url ?? null,
        githubState: source.github?.state ?? null,
      }),
    ...fileInserts(id, diff.files),
    ...commitInserts(id, diff.commits),
    ...rules,
  ]);
  log.info("pull request opened from github", {
    pullRequestId: id,
    repositoryId: repository.id,
    githubNumber: source.github?.number ?? null,
    files: diff.files.length,
  });
  await startGrouping({ pullRequestId: id, revision: 1 }, "server");
  return loadDetail(principal, repository, id);
}

// No agent wrote a pull request from GitHub, so one opens only while the
// server groups pull requests.
export async function requireServerGrouping(): Promise<void> {
  if (!(await groupsOnServer())) {
    log.info("open from github refused: server processing is off");
    throw new ForgeError(
      "BAD_REQUEST",
      "Pull requests open from GitHub only while this server groups them",
    );
  }
}

// After branches synced from GitHub: each open pull request from GitHub on
// one of them whose branch moved gets a new revision. Returns their ids.
export async function reviseFromGithub(
  repository: Pick<AccessibleRepository, "id" | "artifactsName">,
  branches?: string[],
): Promise<string[]> {
  const rows = (
    await getDb()
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.repositoryId, repository.id),
          eq(pullRequests.origin, "github"),
          inArray(pullRequests.status, ["processing", "open"]),
        ),
      )
  ).filter((row) => !branches || branches.includes(row.branch));
  const revised: string[] = [];
  for (const row of rows) {
    if (await revise(repository, row)) {
      revised.push(row.id);
    }
  }
  log.info("github pull requests checked for new revisions", {
    repositoryId: repository.id,
    checked: rows.length,
    revised: revised.length,
  });
  return revised;
}

async function revise(
  repository: Pick<AccessibleRepository, "artifactsName">,
  row: PullRequestRow,
): Promise<boolean> {
  const head = await getGitHost().resolve(repository.artifactsName, row.branch);
  if (!head || head.commit === row.headCommit) {
    return false;
  }
  try {
    const diff = await readDiff(
      await branchSource(repository, row.targetBranch),
      row.branch,
    );
    const onServer = await groupsOnServer();
    await storeRevision(row, diff, {
      groupedBy: "server",
      processingError: onServer ? null : SERVER_OFF,
    });
    return true;
  } catch (err) {
    if (!(err instanceof ForgeError)) {
      throw err;
    }
    // Nothing left to review, or no history shared with the target: the
    // last revision stays until the branch is fixed on GitHub.
    log.info("github branch not revised", {
      pullRequestId: row.id,
      reason: err.message,
    });
    return false;
  }
}

// The target branch's tip in the repository is where a GitHub branch is
// compared from.
async function branchSource(
  repository: Pick<AccessibleRepository, "artifactsName">,
  targetBranch: string,
): Promise<DiffSource> {
  const target = await getGitHost().resolve(
    repository.artifactsName,
    targetBranch,
  );
  if (!target) {
    throw new ForgeError(
      "BAD_REQUEST",
      `There is no branch ${targetBranch} to merge into`,
    );
  }
  return {
    artifactsName: repository.artifactsName,
    baseBranch: targetBranch,
    baseCommit: target.commit,
    sessionId: null,
  };
}

async function refuseDuplicate(
  repositoryId: string,
  source: GithubBranchSource,
): Promise<void> {
  const open = await getDb()
    .select({
      number: pullRequests.number,
      targetBranch: pullRequests.targetBranch,
      githubNumber: pullRequests.githubNumber,
    })
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repositoryId, repositoryId),
        eq(pullRequests.branch, source.branch),
        inArray(pullRequests.status, ["processing", "open"]),
      ),
    );
  const same = open.find(
    (row) =>
      row.targetBranch === source.targetBranch ||
      (source.github && row.githubNumber === source.github.number),
  );
  if (same) {
    log.info("open from github refused: already open", {
      repositoryId,
      number: same.number,
    });
    throw new ForgeError(
      "CONFLICT",
      `Pull request #${same.number} is already open for ${source.branch}`,
    );
  }
}
