import { sql } from "drizzle-orm";
import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { agents } from "./forge";
import { agentSessions } from "./collab";
import { createdAt, timestamp } from "./columns";
import { pullRequests } from "./review";

export const CHAT_SENDERS = ["person", "agent"] as const;
export type ChatSender = (typeof CHAT_SENDERS)[number];

export const CHAT_PAGES = ["overview", "groups", "files", "activity"] as const;
export type ChatPage = (typeof CHAT_PAGES)[number];

// What a person was looking at when they wrote: a tab of the pull request,
// the file, lines or group on it, and any text they had selected.
export interface ChatContextRow {
  page: ChatPage;
  path?: string;
  start?: number;
  end?: number;
  group?: string;
  selectedText?: string;
}

// An agent listening for chat on a pull request. The agent holds the key in
// its private URL; only its hash is stored. One channel per agent and pull
// request: listening again replaces the key. The ad hoc channel, one per
// pull request, has neither agent nor key: the server answers on it.
export const chatChannels = sqliteTable(
  "chat_channels",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    // Null for the ad hoc channel.
    agentId: text("agent_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    // The session that opened the pull request, when it is that agent's
    // channel; the channel closes with the session.
    sessionId: text("session_id").references(() => agentSessions.id, {
      onDelete: "set null",
    }),
    // Null for the ad hoc channel.
    keyHash: text("key_hash").unique(),
    // The last poll, reply or open socket; the agent is live while recent.
    lastSeenAt: timestamp("last_seen_at"),
    closedAt: timestamp("closed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("chat_channels_agent_idx").on(
      table.pullRequestId,
      table.agentId,
    ),
    uniqueIndex("chat_channels_ad_hoc_idx")
      .on(table.pullRequestId)
      .where(sql`${table.agentId} IS NULL`),
  ],
);

// One message of the conversation between a person and a channel's agent.
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    // The person on the other side, whoever wrote it.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sender: text("sender", { enum: CHAT_SENDERS }).notNull(),
    body: text("body").notNull(),
    context: text("context", { mode: "json" }).$type<ChatContextRow>(),
    // When the agent got a person's message, by poll or socket.
    deliveredAt: timestamp("delivered_at"),
    // When the agent said it was working on a person's message.
    workingAt: timestamp("working_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("chat_messages_thread_idx").on(table.channelId, table.userId),
    index("chat_messages_undelivered_idx").on(
      table.channelId,
      table.deliveredAt,
    ),
  ],
);
