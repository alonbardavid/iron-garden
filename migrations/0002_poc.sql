DROP TABLE app_admin_session;
DROP TABLE app_admin;

ALTER TABLE user ADD COLUMN username TEXT;
ALTER TABLE user ADD COLUMN display_username TEXT;
ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE user ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN ban_reason TEXT;
ALTER TABLE user ADD COLUMN ban_expires INTEGER;
ALTER TABLE user ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX user_username_idx ON user (username);

ALTER TABLE user_sessions ADD COLUMN impersonated_by TEXT;

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL DEFAULT 'default',
  name TEXT,
  start TEXT,
  prefix TEXT,
  key TEXT NOT NULL,
  reference_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  refill_interval INTEGER,
  refill_amount INTEGER,
  last_refill_at INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  rate_limit_enabled INTEGER NOT NULL DEFAULT 1,
  rate_limit_time_window INTEGER,
  rate_limit_max INTEGER,
  request_count INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER,
  last_request INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  permissions TEXT,
  metadata TEXT
);
CREATE INDEX api_keys_key_idx ON api_keys (key);
CREATE INDEX api_keys_reference_id_idx ON api_keys (reference_id);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  deactivated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX agents_owner_user_id_idx ON agents (owner_user_id);

CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  artifacts_name TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE TABLE repository_members (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  PRIMARY KEY (repository_id, user_id)
);
CREATE INDEX repository_members_user_id_idx ON repository_members (user_id);

CREATE TABLE agent_repository_access (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  PRIMARY KEY (agent_id, repository_id)
);
CREATE INDEX agent_repository_access_repository_id_idx ON agent_repository_access (repository_id);

CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT,
  goal TEXT,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  artifacts_name TEXT NOT NULL UNIQUE,
  base_branch TEXT NOT NULL,
  base_commit TEXT,
  ended_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX agent_sessions_agent_id_idx ON agent_sessions (agent_id);
CREATE INDEX agent_sessions_repository_id_idx ON agent_sessions (repository_id);

CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  author_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  head_commit TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX pull_requests_repository_number_idx ON pull_requests (repository_id, number);
CREATE INDEX pull_requests_session_id_idx ON pull_requests (session_id);

CREATE TABLE pull_request_files (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  change TEXT NOT NULL,
  old_lines INTEGER NOT NULL DEFAULT 0,
  new_lines INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX pull_request_files_path_idx ON pull_request_files (pull_request_id, path);

CREATE TABLE pull_request_groups (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT,
  ranges TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX pull_request_groups_pull_request_id_idx ON pull_request_groups (pull_request_id);

CREATE TABLE instance_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
