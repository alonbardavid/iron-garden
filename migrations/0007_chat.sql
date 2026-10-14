CREATE TABLE chat_channels (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_seen_at INTEGER,
  closed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX chat_channels_agent_idx ON chat_channels (pull_request_id, agent_id);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  context TEXT,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX chat_messages_thread_idx ON chat_messages (channel_id, user_id);
CREATE INDEX chat_messages_undelivered_idx ON chat_messages (channel_id, delivered_at);
