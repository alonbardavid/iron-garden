ALTER TABLE pull_request_files ADD COLUMN changes TEXT;

CREATE TABLE review_marks (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX review_marks_change_idx ON review_marks (pull_request_id, user_id, path, key);
