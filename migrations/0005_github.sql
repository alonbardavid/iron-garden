CREATE TABLE github_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  github_login TEXT NOT NULL,
  scopes TEXT,
  expires_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX github_tokens_user_id_idx ON github_tokens (user_id);

CREATE TABLE github_connections (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL UNIQUE REFERENCES repositories(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  token_id TEXT REFERENCES github_tokens(id) ON DELETE SET NULL,
  webhook_secret_ciphertext TEXT NOT NULL,
  webhook_id INTEGER,
  webhook_delivered_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  last_synced_at INTEGER,
  last_sync_error TEXT,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX github_connections_token_id_idx ON github_connections (token_id);

CREATE TABLE github_workflow_runs (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL,
  workflow_name TEXT NOT NULL,
  run_number INTEGER NOT NULL,
  run_attempt INTEGER NOT NULL,
  event TEXT NOT NULL,
  head_branch TEXT,
  head_sha TEXT NOT NULL,
  status TEXT NOT NULL,
  conclusion TEXT,
  html_url TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  github_updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX github_workflow_runs_repository_run_idx ON github_workflow_runs (repository_id, run_id);
CREATE INDEX github_workflow_runs_head_sha_idx ON github_workflow_runs (repository_id, head_sha);
