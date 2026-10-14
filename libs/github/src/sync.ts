import { getDb, githubConnections, repositories, eq } from "@lib/db-models";
import { getBindings } from "@lib/capabilities";
import { getGitHost, mirrorBranches } from "@lib/git-host";
import { moduleLogger } from "@lib/logging";
import { reviseFromGithub } from "@lib/review";
import { GithubError, githubApi, gitRemote } from "./api";
import { refreshRuns } from "./runs";
import { tokenPlaintext } from "./tokens";

const log = moduleLogger("github/sync");

// Long enough for a large first clone to stream through.
const PUSH_TOKEN_TTL_SECONDS = 30 * 60;

export type ConnectionRow = typeof githubConnections.$inferSelect;

// Brings the repository's branches up to date with GitHub and, on a full run,
// its recent workflow runs. With `only`, just those branches move (one GitHub
// no longer has is deleted). The outcome is recorded on the connection rather
// than thrown, so a webhook and a person asking see the same state. Pull
// requests opened from GitHub on a branch that moved get a new revision.
export async function syncConnection(
  connection: ConnectionRow,
  only?: string[],
): Promise<void> {
  await recordSyncState(connection.id, { syncStatus: "syncing" });
  let artifactsName: string;
  try {
    const token = await connectionToken(connection);
    artifactsName = await mirrorFromGithub(connection, token, only);
    if (!only) {
      await refreshRuns(connection, githubApi(token));
    }
    await recordSyncState(connection.id, {
      syncStatus: "idle",
      lastSyncedAt: new Date(),
      lastSyncError: null,
    });
    log.info("github sync finished", {
      connectionId: connection.id,
      branches: only?.length ?? "all",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warning("github sync failed", { connectionId: connection.id, err });
    await recordSyncState(connection.id, {
      syncStatus: "failed",
      lastSyncError: message.slice(0, 1000),
    });
    return;
  }
  await reviseOpenedFromGithub(connection, artifactsName, only);
}

async function reviseOpenedFromGithub(
  connection: ConnectionRow,
  artifactsName: string,
  only: string[] | undefined,
): Promise<void> {
  try {
    await reviseFromGithub(
      { id: connection.repositoryId, artifactsName },
      only,
    );
  } catch (err) {
    log.warning("revising pull requests from github failed", {
      connectionId: connection.id,
      err,
    });
  }
}

export async function connectionToken(
  connection: ConnectionRow,
): Promise<string> {
  if (!connection.tokenId) {
    throw new GithubError(
      "UNAUTHORIZED",
      "The GitHub token this repository used was deleted. Connect it again with a token.",
    );
  }
  return tokenPlaintext(connection.tokenId);
}

async function mirrorFromGithub(
  connection: ConnectionRow,
  token: string,
  only: string[] | undefined,
): Promise<string> {
  if (!getBindings().git) {
    throw new Error("Git hosting is not configured on this instance");
  }
  const [repository] = await getDb()
    .select({ artifactsName: repositories.artifactsName })
    .from(repositories)
    .where(eq(repositories.id, connection.repositoryId));
  if (!repository) {
    throw new Error("The repository no longer exists");
  }
  const updates = await mirrorBranches(
    gitRemote(token, connection.owner, connection.repo),
    await getGitHost().gitRemote(
      repository.artifactsName,
      "write",
      PUSH_TOKEN_TTL_SECONDS,
    ),
    { only },
  );
  log.info("github branches mirrored", {
    connectionId: connection.id,
    updates: updates.length,
  });
  return repository.artifactsName;
}

async function recordSyncState(
  connectionId: string,
  state: Pick<
    Partial<ConnectionRow>,
    "syncStatus" | "lastSyncedAt" | "lastSyncError"
  >,
): Promise<void> {
  await getDb()
    .update(githubConnections)
    .set({ ...state, updatedAt: new Date() })
    .where(eq(githubConnections.id, connectionId));
}
