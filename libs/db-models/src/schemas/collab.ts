import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { agents, repositories } from "./forge";
import { createdAt, timestamp, updatedAt } from "./columns";

export const SESSION_STATUSES = ["active", "ended"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    title: text("title"),
    goal: text("goal"),
    context: text("context"),
    status: text("status", { enum: SESSION_STATUSES })
      .default("active")
      .notNull(),
    // The session's own fork in the Cloudflare Artifacts namespace.
    artifactsName: text("artifacts_name").notNull().unique(),
    baseBranch: text("base_branch").notNull(),
    baseCommit: text("base_commit"),
    // What the agent named itself, or its user agent, when it started.
    client: text("client"),
    endedAt: timestamp("ended_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("agent_sessions_agent_id_idx").on(table.agentId),
    index("agent_sessions_repository_id_idx").on(table.repositoryId),
  ],
);
