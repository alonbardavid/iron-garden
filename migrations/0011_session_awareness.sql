-- What sessions are editing, the branches they pushed, the exclusive files
-- two of them collide on, and what each has to be told.
ALTER TABLE agent_sessions ADD COLUMN contact TEXT;
ALTER TABLE agent_sessions ADD COLUMN listen_key_hash TEXT;
CREATE UNIQUE INDEX agent_sessions_listen_key_hash_unique ON agent_sessions (listen_key_hash);

CREATE TABLE session_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  touched_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE UNIQUE INDEX session_files_entry_idx ON session_files (session_id, source, branch, path);
CREATE INDEX session_files_path_idx ON session_files (repository_id, path);

CREATE TABLE session_branches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  head_commit TEXT NOT NULL,
  merge_base TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX session_branches_branch_idx ON session_branches (session_id, branch);

CREATE TABLE session_collisions (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  other_session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  rule_id TEXT REFERENCES repository_rules(id) ON DELETE SET NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX session_collisions_open_idx ON session_collisions (session_id, other_session_id, path) WHERE resolved_at IS NULL;
CREATE INDEX session_collisions_other_idx ON session_collisions (other_session_id);

CREATE TABLE session_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT,
  collision_id TEXT REFERENCES session_collisions(id) ON DELETE SET NULL,
  from_session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  reply_to_id TEXT,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX session_notifications_undelivered_idx ON session_notifications (session_id, delivered_at);
CREATE INDEX session_notifications_from_idx ON session_notifications (from_session_id);
