CREATE TABLE rockstar_service_setups (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_rockstar_service_setup_session ON rockstar_service_setups(json_extract(payload,'$.billing.sessionId'));
