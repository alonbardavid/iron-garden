import {
  getGitHost,
  type ChangedFile,
  type Commit,
  type PathFile,
} from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { notFound } from "./errors";
import { authorize, requireGit } from "./repositories";

const log = moduleLogger("forge/history");

export interface BranchInfo {
  name: string;
  commit: string;
  isDefault: boolean;
}

// The repository's branches for anyone who can read it, its default branch
// first and the rest by name.
export async function listBranches(
  principal: Principal,
  name: string,
): Promise<BranchInfo[]> {
  const repository = await authorize(principal, name, "read");
  requireGit();
  const { branches } = await getGitHost().branches(repository.artifactsName);
  log.debug("branches listed", {
    repositoryId: repository.id,
    count: branches.length,
  });
  return branches
    .map((branch) => ({
      ...branch,
      isDefault: branch.name === repository.defaultBranch,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

// A page of ref's history, newest first; the default branch when ref is left
// out. hasMore says whether an older page exists.
export async function listCommits(
  principal: Principal,
  name: string,
  page: { ref?: string; offset: number; limit: number },
): Promise<{ commits: Commit[]; hasMore: boolean }> {
  const repository = await authorize(principal, name, "read");
  requireGit();
  const commits = await getGitHost().log(
    repository.artifactsName,
    page.ref ?? repository.defaultBranch,
    { limit: page.limit + 1, offset: page.offset },
  );
  log.debug("commits listed", {
    repositoryId: repository.id,
    offset: page.offset,
    count: commits.length,
  });
  return {
    commits: commits.slice(0, page.limit),
    hasMore: commits.length > page.limit,
  };
}

// A commit and the files it changes, for anyone who can read the repository.
// A merge is compared with its first parent, the commit before it in its
// branch's history; a root commit adds every file it has.
export async function readCommit(
  principal: Principal,
  name: string,
  hash: string,
): Promise<{
  commit: Commit;
  files: Omit<ChangedFile, "oldHash" | "newHash">[];
}> {
  const repository = await authorize(principal, name, "read");
  requireGit();
  const host = getGitHost();
  const commit = await commitOf(repository, hash);
  const parent = commit.parents[0];
  const [head, base] = await Promise.all([
    host.resolve(repository.artifactsName, hash),
    parent ? host.resolve(repository.artifactsName, parent) : null,
  ]);
  if (!head) {
    log.info("commit not found", { repositoryId: repository.id });
    throw notFound("Commit");
  }
  const files = await host.changedFiles(repository.artifactsName, base, head);
  log.debug("commit read", {
    repositoryId: repository.id,
    files: files.length,
  });
  return {
    commit,
    files: files.map(({ path, change, oldLines, newLines }) => ({
      path,
      change,
      oldLines,
      newLines,
    })),
  };
}

// A file a commit changes, before and after it; a side is null when the
// commit adds or deletes the file.
export async function readCommitFile(
  principal: Principal,
  name: string,
  hash: string,
  path: string,
): Promise<{ path: string; before: PathFile | null; after: PathFile | null }> {
  const repository = await authorize(principal, name, "read");
  requireGit();
  const commit = await commitOf(repository, hash);
  const parent = commit.parents[0];
  const [after = null, before = null] = await getGitHost().readShownFiles(
    repository.artifactsName,
    [{ ref: hash, path }, ...(parent ? [{ ref: parent, path }] : [])],
  );
  if (!before && !after) {
    log.info("commit file not found", { repositoryId: repository.id });
    throw notFound("File");
  }
  log.debug("commit file read", { repositoryId: repository.id });
  return { path, before, after };
}

async function commitOf(
  repository: { id: string; artifactsName: string },
  hash: string,
): Promise<Commit> {
  const [commit] = await getGitHost().log(repository.artifactsName, hash, {
    limit: 1,
    offset: 0,
  });
  if (commit?.hash !== hash) {
    log.info("commit not found", { repositoryId: repository.id });
    throw notFound("Commit");
  }
  return commit;
}
