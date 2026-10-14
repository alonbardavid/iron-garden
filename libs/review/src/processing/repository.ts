import { requireGit } from "@lib/forge";
import { countLines, getGitHost } from "@lib/git-host";
import { moduleLogger } from "@lib/logging";
import { currentRevision, type GroupingJob } from "./jobs";
import type { RepositoryFile, RepositoryVersion } from "./sandbox/processor";

const log = moduleLogger("review/processing/repository");

// What one read hands the model: the start of a long file, a capped list.
const MAX_FILE_CHARS = 60_000;
const MAX_LISTED_PATHS = 2000;

// A sandbox's view of Artifacts: the repository the pull request's commits
// are in, read-only, at its base or head commit only. For a grouping job
// every read checks the revision is still the job's.

// Where a version of the pull request is: its repository and commit, null
// for the base of a first commit.
export type CommitOf = (
  version: RepositoryVersion,
) => Promise<{ artifactsName: string; commit: string | null }>;

export function listForJob(
  job: GroupingJob,
  version: RepositoryVersion,
  directory: string,
): Promise<{ paths: string[]; truncated: boolean }> {
  return listAt((v) => commitOf(job, v), version, directory, { ...job });
}

export function readForJob(
  job: GroupingJob,
  version: RepositoryVersion,
  path: string,
): Promise<RepositoryFile | null> {
  return readAt((v) => commitOf(job, v), version, path, { ...job });
}

export async function listAt(
  commitAt: CommitOf,
  version: RepositoryVersion,
  directory: string,
  logged: Record<string, unknown>,
): Promise<{ paths: string[]; truncated: boolean }> {
  const { artifactsName, commit } = await commitAt(version);
  const listing = commit
    ? await getGitHost().listFiles(artifactsName, commit)
    : null;
  const prefix = directory.replace(/^\/+|\/+$/g, "");
  const under = (listing?.paths ?? []).filter(
    (path) => !prefix || path.startsWith(`${prefix}/`),
  );
  log.info("sandbox listed files", {
    ...logged,
    version,
    directory: prefix,
    paths: under.length,
  });
  return {
    paths: under.slice(0, MAX_LISTED_PATHS),
    truncated: Boolean(listing?.truncated) || under.length > MAX_LISTED_PATHS,
  };
}

export async function readAt(
  commitAt: CommitOf,
  version: RepositoryVersion,
  path: string,
  logged: Record<string, unknown>,
): Promise<RepositoryFile | null> {
  const { artifactsName, commit } = await commitAt(version);
  const [file = null] = commit
    ? await getGitHost().readFiles(artifactsName, [{ ref: commit, path }])
    : [];
  log.info("sandbox read a file", {
    ...logged,
    version,
    path,
    found: file?.kind ?? "none",
  });
  if (!file) {
    return null;
  }
  if (file.kind !== "text") {
    return file;
  }
  const truncated = file.text.length > MAX_FILE_CHARS;
  const text = truncated ? file.text.slice(0, MAX_FILE_CHARS) : file.text;
  return { kind: "text", text, lines: countLines(text), truncated };
}

// The commit a version names; null for the base of a first commit.
async function commitOf(
  job: GroupingJob,
  version: RepositoryVersion,
): Promise<{ artifactsName: string; commit: string | null }> {
  const loaded = await currentRevision(job);
  if (!loaded) {
    throw new Error("This revision is no longer processing");
  }
  requireGit();
  const commit =
    version === "base" ? loaded.row.baseCommit : loaded.row.headCommit;
  return { artifactsName: loaded.artifactsName, commit: commit || null };
}
