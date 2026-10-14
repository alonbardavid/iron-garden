import { sql } from "drizzle-orm";
import { integer } from "drizzle-orm/sqlite-core";

export function timestamp(name: string) {
  return integer(name, { mode: "timestamp_ms" });
}

export function createdAt() {
  return timestamp("created_at")
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();
}

export function updatedAt() {
  return timestamp("updated_at")
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();
}
