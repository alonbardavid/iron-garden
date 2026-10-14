CREATE TABLE repository_rules (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  match TEXT NOT NULL,
  action TEXT NOT NULL,
  reviewers TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX repository_rules_repository_id_idx ON repository_rules (repository_id);

CREATE TABLE pull_request_rules (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES repository_rules(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  match TEXT NOT NULL,
  action TEXT NOT NULL,
  reviewers TEXT NOT NULL,
  ranges TEXT,
  matched INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX pull_request_rules_pull_request_id_idx ON pull_request_rules (pull_request_id);
CREATE INDEX pull_request_rules_rule_id_idx ON pull_request_rules (rule_id);

ALTER TABLE pull_request_files ADD COLUMN matches TEXT;
ALTER TABLE review_marks ADD COLUMN accepted INTEGER NOT NULL DEFAULT 1;
