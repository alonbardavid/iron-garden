ALTER TABLE agent_sessions ADD COLUMN client TEXT;

DROP TABLE IF EXISTS transcript_traces;
