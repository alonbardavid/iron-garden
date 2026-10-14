import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { repositories } from "./forge";
import { createdAt, timestamp, updatedAt } from "./columns";

// A GitHub personal access token a user added. Stored encrypted: the instance
// must send it to GitHub, so it cannot be a hash.
export const githubTokens = sqliteTable(
  "github_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(),
    // The last characters, to tell tokens apart.
    tokenHint: text("token_hint").notNull(),
    githubLogin: text("github_login").notNull(),
    // A classic token's OAuth scopes; null for a fine-grained token.
    scopes: text("scopes"),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: createdAt(),
  },
  (table) => [index("github_tokens_user_id_idx").on(table.userId)],
);

export const GITHUB_SYNC_STATUSES = ["idle", "syncing", "failed"] as const;
export type GithubSyncStatus = (typeof GITHUB_SYNC_STATUSES)[number];

// A repository mirrored from one GitHub repository, read with a token of the
// user who connected it.
export const githubConnections = sqliteTable(
  "github_connections",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .unique()
      .references(() => repositories.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    tokenId: text("token_id").references(() => githubTokens.id, {
      onDelete: "set null",
    }),
    webhookSecretCiphertext: text("webhook_secret_ciphertext").notNull(),
    // The hook's id on GitHub when the instance created it; null when it is
    // set up by hand.
    webhookId: integer("webhook_id"),
    webhookDeliveredAt: timestamp("webhook_delivered_at"),
    syncStatus: text("sync_status", { enum: GITHUB_SYNC_STATUSES })
      .default("idle")
      .notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("github_connections_token_id_idx").on(table.tokenId)],
);

// A GitHub Actions workflow run on a connected repository, as last reported.
export const githubWorkflowRuns = sqliteTable(
  "github_workflow_runs",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    runId: integer("run_id").notNull(),
    workflowName: text("workflow_name").notNull(),
    runNumber: integer("run_number").notNull(),
    runAttempt: integer("run_attempt").notNull(),
    event: text("event").notNull(),
    headBranch: text("head_branch"),
    headSha: text("head_sha").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    htmlUrl: text("html_url").notNull(),
    startedAt: timestamp("started_at").notNull(),
    githubUpdatedAt: timestamp("github_updated_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("github_workflow_runs_repository_run_idx").on(
      table.repositoryId,
      table.runId,
    ),
    index("github_workflow_runs_head_sha_idx").on(
      table.repositoryId,
      table.headSha,
    ),
  ],
);
