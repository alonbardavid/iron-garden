import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { updatedAt } from "./columns";

// Instance-wide settings an admin changes at runtime. A missing row means the
// built-in default applies.
export const instanceSettings = sqliteTable("instance_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").references(() => user.id, {
    onDelete: "set null",
  }),
  updatedAt: updatedAt(),
});
