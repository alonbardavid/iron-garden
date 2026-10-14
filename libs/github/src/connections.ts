import {
  getDb,
  githubConnections,
  githubTokens,
  githubWorkflowRuns,
  newEntityId,
  user,
  eq,
} from "@lib/db-models";
import {
  authorize,
  createRepository,
  ForgeError,
  requireGit,
  requireInstanceAdmin,
  requireUser,
  type AccessibleRepository,
  type Action,
} from "@lib/forge";
import type { Principal } from "@lib/identity";
import { moduleLogger } from "@lib/logging";
import { randomSecret } from "./crypto";
import { GithubError, githubApi, type GithubApi } from "./api";
import { seal, unseal } from "./secrets";
import { connectionToken, syncConnection, type ConnectionRow } from "./sync";
import { ownedToken } from "./tokens";

const log = moduleLogger("github/connections");

const WEBHOOK_EVENTS = ["push", "pull_request", "workflow_run"];

export interface GithubRepositoryRef {
  owner: string;
  repo: string;
}

export interface GithubConnection extends GithubRepositoryRef {
  htmlUrl: string;
  webhookUrl: string;
  // Whether the instance created the hook on GitHub, or a person must.
  webhook: "automatic" | "manual";
  webhookDeliveredAt: number | null;
  syncStatus: ConnectionRow["syncStatus"];
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  token: {
    id: string;
    name: string;
    githubLogin: string;
    userId: string;
    userName: string;
  } | null;
}

// The repository's GitHub connection, null when it has none. Anyone who can
// read the repository sees it, but not its token or webhook secret.
export async function getGithubConnection(
  principal: Principal,
  name: string,
  origin: string,
): Promise<GithubConnection | null> {
  const repository = await authorize(principal, name, "read");
  const connection = await connectionOf(repository.id);
  return connection ? describe(connection, origin) : null;
}

// Connects the repository to a GitHub repository with one of the caller's own
// tokens, or moves an existing connection onto that token, then syncs every
// branch. The webhook is left for an admin to set up from settings.
export async function connectGithub(
  principal: Principal,
  name: string,
  input: GithubRepositoryRef & { tokenId: string },
  origin: string,
): Promise<GithubConnection> {
  requireUser(principal);
  requireGit();
  const repository = await authorize(principal, name, "admin");
  const token = await ownedToken(principal, input.tokenId);
  const api = githubApi(await unseal(token.tokenCiphertext));
  const existing = await connectionOf(repository.id);
  assertMirrors(existing, input);
  await api.repository(input.owner, input.repo);
  const connection = existing
    ? await replaceToken(existing, token.id)
    : await createConnection(principal, repository, input, token.id);
  await refreshWebhookEvents(connection, api);
  await syncConnection(connection);
  return describe((await connectionOf(repository.id))!, origin);
}

// A new repository holding a GitHub repository's branches, kept up to date.
// Instance admins only, like any new repository.
export async function importFromGithub(
  principal: Principal,
  input: GithubRepositoryRef & {
    name: string;
    description?: string | null;
    tokenId: string;
  },
  origin: string,
): Promise<AccessibleRepository> {
  requireInstanceAdmin(principal, "create repositories");
  const token = await ownedToken(principal, input.tokenId);
  const source = await githubApi(
    await unseal(token.tokenCiphertext),
  ).repository(input.owner, input.repo);
  const repository = await createRepository(principal, {
    name: input.name,
    description: input.description ?? source.description,
    defaultBranch: source.default_branch,
  });
  log.info("repository imported from github", {
    repositoryId: repository.id,
    private: source.private,
  });
  await connectGithub(principal, repository.name, input, origin);
  return repository;
}

// Stops mirroring. The branches already copied stay.
export async function disconnectGithub(
  principal: Principal,
  name: string,
): Promise<void> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  const connection = await connectionOf(repository.id);
  if (!connection) {
    throw notConnected();
  }
  await removeWebhook(connection);
  const db = getDb();
  await db
    .delete(githubWorkflowRuns)
    .where(eq(githubWorkflowRuns.repositoryId, repository.id));
  await db
    .delete(githubConnections)
    .where(eq(githubConnections.id, connection.id));
  log.info("github disconnected", { connectionId: connection.id });
}

// What a person pastes into GitHub when the hook is set up by hand.
export async function githubWebhookSecret(
  principal: Principal,
  name: string,
): Promise<string> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  const connection = await connectionOf(repository.id);
  if (!connection) {
    throw notConnected();
  }
  log.info("webhook secret shown", { connectionId: connection.id });
  return unseal(connection.webhookSecretCiphertext);
}

export interface WebhookAccess {
  allowed: boolean;
  // Why not, when not.
  reason: string | null;
}

// Whether the connection's token may manage the repository's webhook. A
// classic token's scopes are known; a fine-grained token's permissions are
// not, so reading the hooks stands in for them. GitHub has the last word.
export async function githubWebhookAccess(
  principal: Principal,
  name: string,
): Promise<WebhookAccess> {
  const connection = await adminConnection(principal, name);
  if (!connection.tokenId) {
    return refused("The token this repository used was deleted.");
  }
  const token = await connectedToken(connection.tokenId);
  const api = githubApi(await connectionToken(connection));
  try {
    const source = await api.repository(connection.owner, connection.repo);
    if (source.permissions && !source.permissions.admin) {
      return refused(
        `${token!.githubLogin} is not an admin of ${connection.owner}/${connection.repo}, and only admins can manage its webhooks.`,
      );
    }
    if (token!.scopes !== null) {
      return hasHookScope(token!.scopes)
        ? ALLOWED
        : refused("The classic token needs the repo or admin:repo_hook scope.");
    }
    await api.hooks(connection.owner, connection.repo);
    return ALLOWED;
  } catch (err) {
    if (!(err instanceof GithubError) || err.code === "UNAVAILABLE") {
      throw err;
    }
    return refused(
      err.code === "UNAUTHORIZED"
        ? err.message
        : "The fine-grained token needs Webhooks: read and write.",
    );
  }
}

// Creates the webhook on GitHub, with the connection's token.
export async function setUpGithubWebhook(
  principal: Principal,
  name: string,
  origin: string,
): Promise<GithubConnection> {
  const connection = await adminConnection(principal, name);
  if (connection.webhookId === null) {
    const api = githubApi(await connectionToken(connection));
    await createWebhook(connection, api, origin).catch((err: unknown) => {
      throw webhookRefusal(err);
    });
  }
  return describe((await connectionOf(connection.repositoryId))!, origin);
}

// Deletes the webhook the instance created on GitHub. The connection stays
// and can be synced by hand.
export async function removeGithubWebhook(
  principal: Principal,
  name: string,
  origin: string,
): Promise<GithubConnection> {
  const connection = await adminConnection(principal, name);
  if (connection.webhookId !== null) {
    await githubApi(await connectionToken(connection)).deleteHook(
      connection.owner,
      connection.repo,
      connection.webhookId,
    );
    await clearWebhook(connection);
  }
  return describe((await connectionOf(connection.repositoryId))!, origin);
}

// A full sync on demand, for when a webhook was missed or never set up.
export async function syncGithub(
  principal: Principal,
  name: string,
  origin: string,
): Promise<GithubConnection> {
  const { connection } = await connectedApi(principal, name, "write");
  await syncConnection(connection);
  return describe((await connectionOf(connection.repositoryId))!, origin);
}

// The connection and a GitHub client for it, once the principal may take
// the action on the repository.
export async function connectedApi(
  principal: Principal,
  name: string,
  action: Action,
): Promise<{
  repository: AccessibleRepository;
  connection: ConnectionRow;
  api: GithubApi;
}> {
  const repository = await authorize(principal, name, action);
  const connection = await connectionOf(repository.id);
  if (!connection) {
    throw notConnected();
  }
  const api = githubApi(await connectionToken(connection));
  return { repository, connection, api };
}

export async function connectionOf(
  repositoryId: string,
): Promise<ConnectionRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.repositoryId, repositoryId));
  return row;
}

export function webhookUrl(origin: string, connectionId: string): string {
  return `${origin}/api/github/webhooks/${connectionId}`;
}

async function createConnection(
  principal: Principal,
  repository: AccessibleRepository,
  input: GithubRepositoryRef,
  tokenId: string,
): Promise<ConnectionRow> {
  const [row] = await getDb()
    .insert(githubConnections)
    .values({
      id: newEntityId("GITHUB_CONNECTION"),
      repositoryId: repository.id,
      owner: input.owner,
      repo: input.repo,
      tokenId,
      webhookSecretCiphertext: await seal(randomSecret()),
      createdBy: principal.userId,
    })
    .returning();
  log.info("github connected", {
    connectionId: row!.id,
    repositoryId: repository.id,
  });
  return row!;
}

async function replaceToken(
  connection: ConnectionRow,
  tokenId: string,
): Promise<ConnectionRow> {
  const [row] = await getDb()
    .update(githubConnections)
    .set({ tokenId, updatedAt: new Date() })
    .where(eq(githubConnections.id, connection.id))
    .returning();
  log.info("github token replaced", { connectionId: connection.id });
  return row!;
}

async function adminConnection(
  principal: Principal,
  name: string,
): Promise<ConnectionRow> {
  requireUser(principal);
  const repository = await authorize(principal, name, "admin");
  const connection = await connectionOf(repository.id);
  if (!connection) {
    throw notConnected();
  }
  return connection;
}

// Keeps a hook made by an earlier version on the events it needs; the new
// token may not manage hooks, which only leaves the events as they were.
async function refreshWebhookEvents(
  connection: ConnectionRow,
  api: GithubApi,
): Promise<void> {
  if (connection.webhookId === null) {
    return;
  }
  await api
    .updateHookEvents(
      connection.owner,
      connection.repo,
      connection.webhookId,
      WEBHOOK_EVENTS,
    )
    .catch((err: unknown) => {
      log.warning("github webhook events not updated", {
        connectionId: connection.id,
        err,
      });
    });
}

async function createWebhook(
  connection: ConnectionRow,
  api: GithubApi,
  origin: string,
): Promise<void> {
  const hookId = await api.createHook(connection.owner, connection.repo, {
    url: webhookUrl(origin, connection.id),
    secret: await unseal(connection.webhookSecretCiphertext),
    events: WEBHOOK_EVENTS,
  });
  await getDb()
    .update(githubConnections)
    .set({ webhookId: hookId })
    .where(eq(githubConnections.id, connection.id));
  log.info("github webhook created", { connectionId: connection.id, hookId });
}

async function clearWebhook(connection: ConnectionRow): Promise<void> {
  await getDb()
    .update(githubConnections)
    .set({ webhookId: null })
    .where(eq(githubConnections.id, connection.id));
  log.info("github webhook removed", { connectionId: connection.id });
}

async function removeWebhook(connection: ConnectionRow): Promise<void> {
  if (connection.webhookId === null) {
    return;
  }
  try {
    await githubApi(await connectionToken(connection)).deleteHook(
      connection.owner,
      connection.repo,
      connection.webhookId,
    );
    log.info("github webhook removed", { connectionId: connection.id });
  } catch (err) {
    if (!(err instanceof GithubError)) {
      throw err;
    }
    log.warning("github webhook left in place", {
      connectionId: connection.id,
      reason: err.code,
    });
  }
}

async function describe(
  connection: ConnectionRow,
  origin: string,
): Promise<GithubConnection> {
  return {
    owner: connection.owner,
    repo: connection.repo,
    htmlUrl: `https://github.com/${connection.owner}/${connection.repo}`,
    webhookUrl: webhookUrl(origin, connection.id),
    webhook: connection.webhookId === null ? "manual" : "automatic",
    webhookDeliveredAt: connection.webhookDeliveredAt?.getTime() ?? null,
    syncStatus: connection.syncStatus,
    lastSyncedAt: connection.lastSyncedAt?.getTime() ?? null,
    lastSyncError: connection.lastSyncError,
    token: connection.tokenId ? await connectedToken(connection.tokenId) : null,
  };
}

async function connectedToken(
  tokenId: string,
): Promise<(GithubConnection["token"] & { scopes: string | null }) | null> {
  const [token] = await getDb()
    .select({
      id: githubTokens.id,
      name: githubTokens.name,
      githubLogin: githubTokens.githubLogin,
      scopes: githubTokens.scopes,
      userId: user.id,
      userName: user.name,
    })
    .from(githubTokens)
    .innerJoin(user, eq(user.id, githubTokens.userId))
    .where(eq(githubTokens.id, tokenId));
  return token ?? null;
}

// The repo scope includes webhooks; write:repo_hook creates but cannot delete.
function hasHookScope(scopes: string): boolean {
  const granted = scopes.split(",").map((scope) => scope.trim());
  return ["repo", "admin:repo_hook"].some((scope) => granted.includes(scope));
}

const ALLOWED: WebhookAccess = { allowed: true, reason: null };

function refused(reason: string): WebhookAccess {
  return { allowed: false, reason };
}

// A connection moves to another token, never to another GitHub repository.
function assertMirrors(
  existing: ConnectionRow | undefined,
  input: GithubRepositoryRef,
): void {
  if (
    existing &&
    (existing.owner.toLowerCase() !== input.owner.toLowerCase() ||
      existing.repo.toLowerCase() !== input.repo.toLowerCase())
  ) {
    throw new ForgeError(
      "CONFLICT",
      `This repository mirrors ${existing.owner}/${existing.repo}. Disconnect it first.`,
    );
  }
}

// GitHub answers 403 or 404 for a token or account that may not manage
// hooks; anything else (an address it cannot reach) keeps GitHub's words.
function webhookRefusal(err: unknown): unknown {
  if (
    err instanceof GithubError &&
    (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")
  ) {
    log.info("github webhook refused", { reason: err.code });
    return new GithubError(
      "FORBIDDEN",
      "GitHub would not let this token create a webhook. It needs Webhooks: read and write (fine-grained) or admin:repo_hook (classic), and its account needs admin on the repository.",
    );
  }
  return err;
}

function notConnected(): ForgeError {
  return new ForgeError(
    "NOT_FOUND",
    "This repository is not connected to GitHub",
  );
}
