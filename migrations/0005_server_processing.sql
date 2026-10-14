-- Shares 0005 with 0005_comments_transcripts.sql: both were written on
-- branches at once, and a preview had already applied this name. Wrangler
-- applies every file it has not recorded, so the order between them is moot.
-- Who groups a pull request: its agent, or the server's model (Admin > Agent
-- config). processing_error says why the server could not, until it next tries.
ALTER TABLE pull_requests ADD COLUMN grouped_by TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE pull_requests ADD COLUMN processing_error TEXT;
