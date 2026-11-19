CREATE TABLE IF NOT EXISTS noah_agent_invites (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  upload_id TEXT NOT NULL REFERENCES noah_agent_uploads(id),
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
  source_sha256 TEXT,
  token_sha256 TEXT NOT NULL UNIQUE CHECK(length(token_sha256)=64),
  input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64),
  recipient_id TEXT,
  access_scope TEXT NOT NULL CHECK(access_scope IN ('view','source')),
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 100),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_invites_owner_created ON noah_agent_invites(owner_id,created_at,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_agent_invite_claims (
  invite_id TEXT NOT NULL REFERENCES noah_agent_invites(id),
  recipient_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY(invite_id,recipient_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_invite_claims_recipient ON noah_agent_invite_claims(recipient_id,invite_id);
