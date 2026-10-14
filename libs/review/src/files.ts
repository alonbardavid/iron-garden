import {
  agentSessions,
  and,
  eq,
  getDb,
  pullRequestFiles,
  pullRequests,
  repositories,
  type FileChange,
} from "@lib/db-models";
import { authorize, ForgeError, requireGit } from "@lib/forge";
import { getGitHost, type FileVersion, type PathFile } from "@lib/git-host";
import type { Principal } from "@lib/identity";
import {
  repositoryJoin,
  requireStorage,
  sessionJoin,
  storageName,
} from "./storage";

export interface PullRequestFileContents<File = FileVersion> {
  path: string;
  before: File | null;
  after: File | null;
}

// A changed file before and after a pull request, as a reviewer is shown it;
// a side is null when the file is added or deleted.
export async function getPullRequestFile(
  principal: Principal,
  repositoryName: string,
  number: number,
  path: string,
): Promise<PullRequestFileContents<PathFile>> {
  const repository = await authorize(principal, repositoryName, "read");
  const [row] = await getDb()
    .select({
      baseCommit: pullRequests.baseCommit,
      headCommit: pullRequests.headCommit,
      change: pullRequestFiles.change,
      artifactsName: storageName,
    })
    .from(pullRequests)
    .innerJoin(
      pullRequestFiles,
      and(
        eq(pullRequestFiles.pullRequestId, pullRequests.id),
        eq(pullRequestFiles.path, path),
      ),
    )
    .leftJoin(agentSessions, sessionJoin)
    .innerJoin(repositories, repositoryJoin)
    .where(
      and(
        eq(pullRequests.repositoryId, repository.id),
        eq(pullRequests.number, number),
      ),
    );
  if (!row) {
    throw new ForgeError(
      "NOT_FOUND",
      `${path} is not a changed file of pull request #${number}`,
    );
  }
  requireGit();
  const { before, after } = sidesOf(row, row.change, path);
  const files = await getGitHost().readShownFiles(
    requireStorage(row.artifactsName),
    [before, after].filter((read) => read !== null),
  );
  const [first = null, second = null] = files;
  return before
    ? { path, before: first, after: after ? second : null }
    : { path, before: null, after: first };
}

// The reads of a changed file's two sides, null for a side it lacks.
function sidesOf(
  commits: { baseCommit: string; headCommit: string },
  change: FileChange,
  path: string,
) {
  return {
    before:
      change === "added" || !commits.baseCommit
        ? null
        : { ref: commits.baseCommit, path },
    after: change === "deleted" ? null : { ref: commits.headCommit, path },
  };
}

// Changed files at both ends of a pull request, read from the session
// repository its branch was pushed to.
export async function readContents(
  artifactsName: string,
  commits: { baseCommit: string; headCommit: string },
  files: { path: string; change: FileChange }[],
): Promise<PullRequestFileContents[]> {
  requireGit();
  const sides = files.map(({ path, change }) => sidesOf(commits, change, path));
  const reads = sides.flatMap(({ before, after }) =>
    [before, after].filter((read) => read !== null),
  );
  const versions = await getGitHost().readFiles(artifactsName, reads);
  let next = 0;
  return files.map(({ path }, i) => ({
    path,
    before: sides[i]!.before ? (versions[next++] ?? null) : null,
    after: sides[i]!.after ? (versions[next++] ?? null) : null,
  }));
}

export interface PullRequestReference {
  path: string;
  // Null when the target branch has no such file.
  version: FileVersion | null;
}

// A file as the pull request's target branch has it, for comparing changed
// lines with the existing code the agent named as their reference.
export async function getPullRequestReference(
  principal: Principal,
  repositoryName: string,
  number: number,
  path: string,
): Promise<PullRequestReference> {
  const repository = await authorize(principal, repositoryName, "read");
  const [row] = await getDb()
    .select({
      baseCommit: pullRequests.baseCommit,
      artifactsName: storageName,
    })
    .from(pullRequests)
    .leftJoin(agentSessions, sessionJoin)
    .innerJoin(repositories, repositoryJoin)
    .where(
      and(
        eq(pullRequests.repositoryId, repository.id),
        eq(pullRequests.number, number),
      ),
    );
  if (!row) {
    throw new ForgeError("NOT_FOUND", `Pull request #${number} not found`);
  }
  requireGit();
  const [version] = await getGitHost().readFiles(
    requireStorage(row.artifactsName),
    [{ ref: row.baseCommit, path }],
  );
  return { path, version: version ?? null };
}
