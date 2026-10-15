-- When an agent last appended to a transcript it uploads as it goes.
ALTER TABLE transcripts ADD COLUMN updated_at INTEGER;
