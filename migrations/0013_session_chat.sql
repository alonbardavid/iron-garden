-- The chat between a session's agent and the person it works for, on the
-- session's page. A person's message reaches the agent as a `chat` notice.
CREATE TABLE session_chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  notification_id TEXT REFERENCES session_notifications(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX session_chat_messages_session_idx ON session_chat_messages (session_id, created_at);
