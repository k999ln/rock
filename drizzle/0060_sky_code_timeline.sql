CREATE TABLE sky_code_repositories (
  id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
  head_id TEXT, hidden INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_sky_code_owner ON sky_code_repositories(user_id);
--> statement-breakpoint
CREATE TABLE sky_code_commits (
  id TEXT PRIMARY KEY NOT NULL, repo_id TEXT NOT NULL REFERENCES sky_code_repositories(id),
  revision INTEGER NOT NULL, parent_id TEXT, payload TEXT NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_sky_code_repo_revision ON sky_code_commits(repo_id, revision);
--> statement-breakpoint
CREATE TRIGGER sky_code_commits_no_update BEFORE UPDATE ON sky_code_commits BEGIN SELECT RAISE(ABORT, 'immutable code commit'); END;
--> statement-breakpoint
CREATE TRIGGER sky_code_commits_no_delete BEFORE DELETE ON sky_code_commits BEGIN SELECT RAISE(ABORT, 'immutable code commit'); END;
