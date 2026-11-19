ALTER TABLE noah_agent_drafts ADD COLUMN registered_upload_id TEXT;
--> statement-breakpoint
ALTER TABLE noah_agent_drafts ADD COLUMN registered_draft_revision INTEGER;
--> statement-breakpoint
ALTER TABLE noah_agent_drafts ADD COLUMN restored_from_revision INTEGER;
--> statement-breakpoint
ALTER TABLE noah_agent_drafts ADD COLUMN purged_at INTEGER;
--> statement-breakpoint
CREATE TABLE noah_draft_objects (
  object_key TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, draft_id TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 4 AND 10485760), sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('writing','ready','deleting','deleted')),
  write_expires_at INTEGER NOT NULL, orphaned_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX noah_draft_objects_owner_state ON noah_draft_objects(owner_id,state,orphaned_at);
--> statement-breakpoint
CREATE TABLE noah_draft_storage_scans (
  owner_id TEXT PRIMARY KEY NOT NULL, cursor TEXT, last_scan_at INTEGER, revision INTEGER NOT NULL DEFAULT 0
);
