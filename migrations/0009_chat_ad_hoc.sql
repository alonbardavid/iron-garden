-- Ad hoc chat: a channel per pull request that the server answers on, with
-- no agent and no key. SQLite cannot drop NOT NULL in place, so
-- chat_channels is rebuilt. Dropping it cascades to chat_messages, so they
-- are kept aside and put back.
PRAGMA defer_foreign_keys = true;

CREATE TABLE chat_messages_kept AS SELECT * FROM chat_messages;

CREATE TABLE chat_channels_new (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  key_hash TEXT UNIQUE,
  last_seen_at INTEGER,
  closed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
INSERT INTO chat_channels_new
  SELECT id, pull_request_id, agent_id, session_id, key_hash, last_seen_at, closed_at, created_at
  FROM chat_channels;
DROP TABLE chat_channels;
ALTER TABLE chat_channels_new RENAME TO chat_channels;
CREATE UNIQUE INDEX chat_channels_agent_idx ON chat_channels (pull_request_id, agent_id);
CREATE UNIQUE INDEX chat_channels_ad_hoc_idx ON chat_channels (pull_request_id) WHERE agent_id IS NULL;

INSERT INTO chat_messages SELECT * FROM chat_messages_kept;
DROP TABLE chat_messages_kept;

PRAGMA defer_foreign_keys = false;
