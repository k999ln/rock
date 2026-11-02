CREATE TABLE sky_linux_service_documents (
 id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('workspace','listing','review')), revision INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL CHECK(json_valid(payload)), updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_sky_linux_service_owner ON sky_linux_service_documents(owner_user_id,kind,updated_at);
--> statement-breakpoint
CREATE TABLE sky_linux_service_receipts (
 id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, digest TEXT NOT NULL,
 kind TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_sky_linux_receipt_workspace ON sky_linux_service_receipts(workspace_id,created_at);
