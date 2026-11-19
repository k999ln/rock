CREATE TABLE noah_agent_drafts (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK(json_valid(content) AND length(content)<=500000),
  revision INTEGER NOT NULL CHECK(revision>=1), command_id TEXT NOT NULL, input_sha256 TEXT NOT NULL,
  source_key TEXT, source_name TEXT, source_bytes INTEGER, source_sha256 TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
  CHECK ((source_key IS NULL AND source_name IS NULL AND source_bytes IS NULL AND source_sha256 IS NULL)
    OR (source_key IS NOT NULL AND source_name IS NOT NULL AND source_bytes BETWEEN 4 AND 10485760 AND source_sha256 IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX noah_agent_drafts_owner_updated ON noah_agent_drafts(owner_id, updated_at, id);
