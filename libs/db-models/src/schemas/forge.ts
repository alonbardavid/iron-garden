import { sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { createdAt, timestamp, updatedAt } from "./columns";

export const ACCESS_LEVELS = ["read", "write", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().unique(),
    description: text("description"),
    deactivatedAt: timestamp("deactivated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("agents_owner_user_id_idx").on(table.ownerUserId)],
);

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  defaultBranch: text("default_branch").default("main").notNull(),
  // The repository's name in the Cloudflare Artifacts namespace. Derived from
  // the id, so a rename never touches git storage.
  artifactsName: text("artifacts_name").notNull().unique(),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const repositoryMembers = sqliteTable(
  "repository_members",
  {
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    level: text("level", { enum: ACCESS_LEVELS }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.userId] }),
    index("repository_members_user_id_idx").on(table.userId),
  ],
);

export const agentRepositoryAccess = sqliteTable(
  "agent_repository_access",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    level: text("level", { enum: ACCESS_LEVELS }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.repositoryId] }),
    index("agent_repository_access_repository_id_idx").on(table.repositoryId),
  ],
);
