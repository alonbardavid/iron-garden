import {
  sqliteTable,
  text,
  integer,
  index,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { agents } from "./forge";
import { agentSessions } from "./collab";
import { createdAt, timestamp } from "./columns";
import { pullRequests } from "./review";

// One step of an agent's work as it told it: a person's prompt or what the
// agent said, with the tools it ran.
export interface TranscriptEntryRow {
  role: "user" | "agent";
  // Who wrote a prompt, when the agent knows.
  author?: string;
  text: string;
  tools?: { name: string; target: string }[];
}

// How a transcript reached a commit: uploaded naming it, or named by the
// commit's own Agent-Transcript trailer.
export const TRANSCRIPT_SOURCES = ["api", "trailer"] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export const COMMENT_KINDS = ["comment", "flag", "accept", "ask"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

// A draft goes out with its author's review, or on its own when sent now.
export const COMMENT_STATUSES = ["draft", "sent"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const REVIEW_VERDICTS = ["accept", "changes"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

// The commits a revision of a pull request adds, oldest first.
export const pullRequestCommits = sqliteTable(
  "pull_request_commits",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    sha: text("sha").notNull(),
    message: text("message").notNull(),
    authorName: text("author_name").notNull(),
    committedAt: timestamp("committed_at").notNull(),
    // The commit's Agent-Transcript trailer, as written.
    transcriptRef: text("transcript_ref"),
  },
  (table) => [
    index("pull_request_commits_pull_request_id_idx").on(table.pullRequestId),
  ],
);

// A session's transcript, for the commit it led to once that is known.
export const transcripts = sqliteTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha"),
    source: text("source", { enum: TRANSCRIPT_SOURCES }).notNull(),
    entries: text("entries", { mode: "json" })
      .$type<TranscriptEntryRow[]>()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("transcripts_session_commit_idx").on(
      table.sessionId,
      table.commitSha,
    ),
  ],
);

// A person's verdict on a pull request, with how far they had read it.
export const pullRequestReviews = sqliteTable(
  "pull_request_reviews",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    verdict: text("verdict", { enum: REVIEW_VERDICTS }).notNull(),
    body: text("body"),
    revision: integer("revision").notNull(),
    accepted: integer("accepted").notNull(),
    total: integer("total").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("pull_request_reviews_pull_request_id_idx").on(table.pullRequestId),
  ],
);

// A comment on lines of a pull request, or a reply to one (parentId set, no
// kind or lines). An agent's comment carries its agent and its owner.
export const pullRequestComments = sqliteTable(
  "pull_request_comments",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => pullRequestComments.id,
      { onDelete: "cascade" },
    ),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    agentId: text("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: COMMENT_KINDS }),
    path: text("path"),
    start: integer("start_line"),
    end: integer("end_line"),
    body: text("body").notNull(),
    revision: integer("revision").notNull(),
    headCommit: text("head_commit").notNull(),
    status: text("status", { enum: COMMENT_STATUSES }).notNull(),
    reviewId: text("review_id").references(() => pullRequestReviews.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    resolvedCommit: text("resolved_commit"),
    sentAt: timestamp("sent_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("pull_request_comments_pull_request_id_idx").on(table.pullRequestId),
    index("pull_request_comments_parent_id_idx").on(table.parentId),
  ],
);
