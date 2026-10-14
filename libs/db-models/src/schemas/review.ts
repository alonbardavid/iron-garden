import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { agents, repositories } from "./forge";
import { agentSessions } from "./collab";
import { createdAt, timestamp, updatedAt } from "./columns";
import {
  repositoryRules,
  RULE_ACTIONS,
  type RuleMatch,
  type RuleWorkflow,
} from "./rules";

export const PULL_REQUEST_STATUSES = [
  "processing",
  "open",
  "merged",
  "closed",
] as const;
export type PullRequestStatus = (typeof PULL_REQUEST_STATUSES)[number];

// Who splits a pull request into groups: its agent, or the server's model.
export const GROUPERS = ["agent", "server"] as const;
export type Grouper = (typeof GROUPERS)[number];

// Where a pull request came from: an agent's session, whose repository holds
// its branch, or a GitHub pull request or branch, mirrored into the
// repository itself.
export const PULL_REQUEST_ORIGINS = ["agent", "github"] as const;
export type PullRequestOrigin = (typeof PULL_REQUEST_ORIGINS)[number];

export const GITHUB_PULL_STATES = ["open", "closed", "merged"] as const;
export type GithubPullState = (typeof GITHUB_PULL_STATES)[number];

export const MERGE_METHODS = ["merge", "squash", "rebase"] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

// Where a run-workflow rule stands on a revision: waiting for the branch to
// be on GitHub, started there, or refused by GitHub.
export const DISPATCH_STATUSES = ["waiting", "dispatched", "failed"] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export const FILE_CHANGES = ["added", "modified", "deleted"] as const;
export type FileChange = (typeof FILE_CHANGES)[number];

export interface GroupRangeRow {
  path: string;
  start: number;
  end: number;
  // What these lines do, in a sentence.
  note?: string;
  // Where the lines came from, in the old version of that file.
  movedFrom?: { path: string; start: number; end: number };
  // Existing code they were copied from, on the target branch.
  reference?: { path: string; start: number; end: number };
}

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    sessionId: text("session_id").references(() => agentSessions.id, {
      onDelete: "set null",
    }),
    agentId: text("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    branch: text("branch").notNull(),
    targetBranch: text("target_branch").notNull(),
    baseCommit: text("base_commit").notNull(),
    headCommit: text("head_commit").notNull(),
    revision: integer("revision").default(1).notNull(),
    status: text("status", { enum: PULL_REQUEST_STATUSES })
      .default("processing")
      .notNull(),
    origin: text("origin", { enum: PULL_REQUEST_ORIGINS })
      .default("agent")
      .notNull(),
    groupedBy: text("grouped_by", { enum: GROUPERS })
      .default("agent")
      .notNull(),
    // Why the server could not group the current revision, if it could not.
    processingError: text("processing_error"),
    // The GitHub pull request for the same branch, once there is one.
    githubNumber: integer("github_number"),
    githubUrl: text("github_url"),
    githubState: text("github_state", { enum: GITHUB_PULL_STATES }),
    mergeMethod: text("merge_method", { enum: MERGE_METHODS }),
    mergeCommit: text("merge_commit"),
    mergedBy: text("merged_by").references(() => user.id, {
      onDelete: "set null",
    }),
    // When it was merged or closed.
    closedAt: timestamp("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("pull_requests_repository_number_idx").on(
      table.repositoryId,
      table.number,
    ),
    index("pull_requests_session_id_idx").on(table.sessionId),
    index("pull_requests_branch_idx").on(table.repositoryId, table.branch),
  ],
);

export const pullRequestFiles = sqliteTable(
  "pull_request_files",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    change: text("change", { enum: FILE_CHANGES }).notNull(),
    oldLines: integer("old_lines").default(0).notNull(),
    newLines: integer("new_lines").default(0).notNull(),
    // The file's changes as [key, at] pairs (see @lib/diff), filled in the
    // first time anyone opens the pull request; null until then.
    changes: text("changes", { mode: "json" }).$type<[string, number][]>(),
    // The keys of the changes each pattern rule matched, by pull request
    // rule id; filled with `changes`.
    matches: text("matches", { mode: "json" }).$type<
      Record<string, string[]>
    >(),
  },
  (table) => [
    uniqueIndex("pull_request_files_path_idx").on(
      table.pullRequestId,
      table.path,
    ),
  ],
);

export const pullRequestGroups = sqliteTable(
  "pull_request_groups",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    description: text("description"),
    // [{ path, start, end }], always read and written with the group.
    ranges: text("ranges", { mode: "json" }).$type<GroupRangeRow[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("pull_request_groups_pull_request_id_idx").on(table.pullRequestId),
  ],
);

// A rule as it stood when a revision was processed, so editing a rule never
// changes a review already under way.
export const pullRequestRules = sqliteTable(
  "pull_request_rules",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").references(() => repositoryRules.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    match: text("match", { mode: "json" }).$type<RuleMatch>().notNull(),
    action: text("action", { enum: RULE_ACTIONS }).notNull(),
    reviewers: text("reviewers", { mode: "json" }).$type<string[]>().notNull(),
    // A prompt rule's lines as the agent judged them; null until it answers.
    ranges: text("ranges", { mode: "json" }).$type<GroupRangeRow[]>(),
    // Whether the rule matched any change; null until that is known.
    matched: integer("matched", { mode: "boolean" }),
    workflow: text("workflow", { mode: "json" }).$type<RuleWorkflow>(),
    dispatchStatus: text("dispatch_status", { enum: DISPATCH_STATUSES }),
    dispatchError: text("dispatch_error"),
    createdAt: createdAt(),
  },
  (table) => [
    index("pull_request_rules_pull_request_id_idx").on(table.pullRequestId),
    index("pull_request_rules_rule_id_idx").on(table.ruleId),
  ],
);

// A change one person accepted, by its key in the file's diff. Marks outlive a
// revision as long as the change is still in the diff. A mark that is not
// accepted turns off a rule's auto-accept for that person.
export const reviewMarks = sqliteTable(
  "review_marks",
  {
    id: text("id").primaryKey(),
    pullRequestId: text("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    key: text("key").notNull(),
    accepted: integer("accepted", { mode: "boolean" }).default(true).notNull(),
    // The revision the mark was made on.
    revision: integer("revision").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("review_marks_change_idx").on(
      table.pullRequestId,
      table.userId,
      table.path,
      table.key,
    ),
  ],
);
