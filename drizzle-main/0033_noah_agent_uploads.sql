CREATE TABLE noah_agent_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  manifest TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  source_key TEXT,
  source_name TEXT,
  source_bytes INTEGER,
  source_sha256 TEXT,
  upload_state TEXT NOT NULL DEFAULT 'pending' CHECK(upload_state IN ('pending', 'ready')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK ((source_key IS NULL AND source_name IS NULL AND source_bytes IS NULL AND source_sha256 IS NULL)
    OR (source_key IS NOT NULL AND source_name IS NOT NULL AND source_bytes BETWEEN 4 AND 10485760 AND source_sha256 IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX noah_agent_uploads_owner_created ON noah_agent_uploads(owner_id, created_at, id);
