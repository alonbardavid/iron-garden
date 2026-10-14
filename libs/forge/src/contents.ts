import { getGitHost, type PathContents } from "@lib/git-host";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { notFound } from "./errors";
import { authorize, requireGit } from "./repositories";

const log = moduleLogger("forge/contents");

// What path names in the repository at ref, for anyone who can read it. The
// default branch when ref is left out; the root when path is empty.
export async function readRepositoryPath(
  principal: Principal,
  name: string,
  path: string,
  ref?: string,
): Promise<PathContents> {
  const repository = await authorize(principal, name, "read");
  requireGit();
  const contents = await getGitHost().readPath(
    repository.artifactsName,
    ref ?? repository.defaultBranch,
    path,
  );
  if (!contents) {
    log.info("repository path not found", { repositoryId: repository.id });
    throw notFound("Path");
  }
  log.debug("repository path read", {
    repositoryId: repository.id,
    kind: contents.kind,
  });
  return contents;
}

// Every file path in the repository at ref, for finding a file; the default
// branch when ref is left out.
export async function listRepositoryFiles(
  principal: Principal,
  name: string,
  ref?: string,
): Promise<{ paths: string[]; truncated: boolean }> {
  const repository = await authorize(principal, name, "read");
  requireGit();
  const listed = await getGitHost().listFiles(
    repository.artifactsName,
    ref ?? repository.defaultBranch,
  );
  if (!listed) {
    log.info("repository ref not found", { repositoryId: repository.id });
    throw notFound("Branch or commit");
  }
  log.debug("repository files listed", {
    repositoryId: repository.id,
    count: listed.paths.length,
    truncated: listed.truncated,
  });
  return listed;
}
