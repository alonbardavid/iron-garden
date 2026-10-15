-- When a session's agent last called the API for it, for the Sessions page.
ALTER TABLE agent_sessions ADD COLUMN last_seen_at INTEGER;
