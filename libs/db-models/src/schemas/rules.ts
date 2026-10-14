import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { repositories } from "./forge";
import { createdAt, updatedAt } from "./columns";

export const RULE_ACTIONS = [
  "auto-accept",
  "high-impact",
  "require-review",
  "run-workflow",
] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const RULE_CONSTRUCTS = ["imports", "comments"] as const;
export type RuleConstruct = (typeof RULE_CONSTRUCTS)[number];

// What a rule matches. `paths` are globs that keep a rule to part of the
// repository; empty means every file.
export type RuleMatch =
  | { kind: "files"; syntax: "glob" | "regex"; patterns: string[] }
  | { kind: "structure"; constructs: RuleConstruct[]; paths: string[] }
  | { kind: "prompt"; prompt: string; paths: string[] };

// A GitHub Actions workflow a run-workflow rule starts, as GitHub names it.
export interface RuleWorkflow {
  id: number;
  path: string;
  name: string;
}

export const repositoryRules = sqliteTable(
  "repository_rules",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    match: text("match", { mode: "json" }).$type<RuleMatch>().notNull(),
    action: text("action", { enum: RULE_ACTIONS }).notNull(),
    // User ids, for require-review.
    reviewers: text("reviewers", { mode: "json" })
      .$type<string[]>()
      .default([])
      .notNull(),
    // For run-workflow.
    workflow: text("workflow", { mode: "json" }).$type<RuleWorkflow>(),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("repository_rules_repository_id_idx").on(table.repositoryId),
  ],
);
