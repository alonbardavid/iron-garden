import { sql } from "drizzle-orm";
import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { agents, repositories } from "./forge";
import { createdAt, timestamp, updatedAt } from "./columns";
import { repositoryRules } from "./rules";

export const SESSION_STATUSES = ["active", "ended"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const CONTACT_KINDS = ["https", "a2a", "mcp", "email", "other"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export interface SessionContact {
  kind: ContactKind;
  value: string;
  note?: string;
}

// A file a session is editing: one it said it is changing, or one a branch it
// pushed changes.
export const SESSION_FILE_SOURCES = ["declared", "committed"] as const;
export type SessionFileSource = (typeof SESSION_FILE_SOURCES)[number];

export const NOTIFICATION_KINDS = [
  "collision",
  "message",
  "undelivered",
  "chat",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// Who wrote a message in a session's chat: the person its agent works for, or
// the agent.
export const SESSION_CHAT_SENDERS = ["person", "agent"] as const;
export type SessionChatSender = (typeof SESSION_CHAT_SENDERS)[number];

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
    // The last call the session's agent made for it; it is live while recent.
    lastSeenAt: timestamp("last_seen_at"),
    // How other sessions may reach it outside the platform, as it published.
    contact: text("contact", { mode: "json" }).$type<SessionContact[]>(),
    // SHA-256 of the key in the URLs its listener connects on.
    listenKeyHash: text("listen_key_hash").unique(),
    endedAt: timestamp("ended_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("agent_sessions_agent_id_idx").on(table.agentId),
    index("agent_sessions_repository_id_idx").on(table.repositoryId),
  ],
);

// A session's working set. `branch` is "" for a declared file, so the unique
// index holds for both sources.
export const sessionFiles = sqliteTable(
  "session_files",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    source: text("source", { enum: SESSION_FILE_SOURCES }).notNull(),
    branch: text("branch").default("").notNull(),
    touchedAt: timestamp("touched_at").notNull(),
    // A declared file lapses unless reported again; a committed one lapses
    // a while after its session ends with no pull request for its branch.
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("session_files_entry_idx").on(
      table.sessionId,
      table.source,
      table.branch,
      table.path,
    ),
    index("session_files_path_idx").on(table.repositoryId, table.path),
  ],
);

// The branches a session pushed, as last seen.
export const sessionBranches = sqliteTable(
  "session_branches",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    branch: text("branch").notNull(),
    headCommit: text("head_commit").notNull(),
    mergeBase: text("merge_base"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("session_branches_branch_idx").on(
      table.sessionId,
      table.branch,
    ),
  ],
);

// Two sessions holding the same exclusive file. `sessionId` is the one whose
// edit caused it, and was told; one open collision per pair and path.
export const sessionCollisions = sqliteTable(
  "session_collisions",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    otherSessionId: text("other_session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    ruleId: text("rule_id").references(() => repositoryRules.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("session_collisions_open_idx")
      .on(table.sessionId, table.otherSessionId, table.path)
      .where(sql`resolved_at IS NULL`),
    index("session_collisions_other_idx").on(table.otherSessionId),
  ],
);

// What the platform or another session has to tell a session, kept until the
// session fetched it.
export const sessionNotifications = sqliteTable(
  "session_notifications",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    body: text("body").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    collisionId: text("collision_id").references(() => sessionCollisions.id, {
      onDelete: "set null",
    }),
    // A message's sender, and the message it answers.
    fromSessionId: text("from_session_id").references(() => agentSessions.id, {
      onDelete: "set null",
    }),
    replyToId: text("reply_to_id"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("session_notifications_undelivered_idx").on(
      table.sessionId,
      table.deliveredAt,
    ),
    index("session_notifications_from_idx").on(table.fromSessionId),
  ],
);

// The chat between a session's agent and the person it works for. A person's
// message reaches the agent as the notification it names.
export const sessionChatMessages = sqliteTable(
  "session_chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    sender: text("sender", { enum: SESSION_CHAT_SENDERS }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    notificationId: text("notification_id").references(
      () => sessionNotifications.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    index("session_chat_messages_session_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);
