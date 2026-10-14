CREATE TABLE pull_request_commits (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  sha TEXT NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL,
  committed_at INTEGER NOT NULL,
  transcript_ref TEXT
);
CREATE INDEX pull_request_commits_pull_request_id_idx ON pull_request_commits (pull_request_id);

CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  commit_sha TEXT,
  source TEXT NOT NULL,
  entries TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX transcripts_session_commit_idx ON transcripts (session_id, commit_sha);

CREATE TABLE transcript_traces (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  entry_from INTEGER NOT NULL,
  entry_to INTEGER NOT NULL,
  path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX transcript_traces_pull_request_id_idx ON transcript_traces (pull_request_id);
CREATE INDEX transcript_traces_transcript_id_idx ON transcript_traces (transcript_id);

CREATE TABLE pull_request_reviews (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL,
  body TEXT,
  revision INTEGER NOT NULL,
  accepted INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX pull_request_reviews_pull_request_id_idx ON pull_request_reviews (pull_request_id);

CREATE TABLE pull_request_comments (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES pull_request_comments(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  kind TEXT,
  path TEXT,
  start_line INTEGER,
  end_line INTEGER,
  body TEXT NOT NULL,
  revision INTEGER NOT NULL,
  head_commit TEXT NOT NULL,
  status TEXT NOT NULL,
  review_id TEXT REFERENCES pull_request_reviews(id) ON DELETE SET NULL,
  resolved_at INTEGER,
  resolved_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  resolved_commit TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX pull_request_comments_pull_request_id_idx ON pull_request_comments (pull_request_id);
CREATE INDEX pull_request_comments_parent_id_idx ON pull_request_comments (parent_id);
