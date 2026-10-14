ALTER TABLE pull_requests ADD COLUMN github_number INTEGER;
ALTER TABLE pull_requests ADD COLUMN github_url TEXT;
ALTER TABLE pull_requests ADD COLUMN github_state TEXT;
ALTER TABLE pull_requests ADD COLUMN merge_method TEXT;
ALTER TABLE pull_requests ADD COLUMN merge_commit TEXT;
ALTER TABLE pull_requests ADD COLUMN merged_by TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE pull_requests ADD COLUMN closed_at INTEGER;
CREATE INDEX pull_requests_branch_idx ON pull_requests (repository_id, branch);

ALTER TABLE repository_rules ADD COLUMN workflow TEXT;
ALTER TABLE pull_request_rules ADD COLUMN workflow TEXT;
ALTER TABLE pull_request_rules ADD COLUMN dispatch_status TEXT;
ALTER TABLE pull_request_rules ADD COLUMN dispatch_error TEXT;
