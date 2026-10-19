-- Production applies this after the already-recorded compatibility bridge.
CREATE TABLE IF NOT EXISTS sky_private_agents (
  owner_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  digest TEXT NOT NULL CHECK (length(digest) = 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  spec_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sky_private_agents_owner_updated
  ON sky_private_agents (owner_user_id, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sky_private_agent_adds (
  owner_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_revision INTEGER NOT NULL CHECK (agent_revision > 0),
  agent_digest TEXT NOT NULL CHECK (length(agent_digest) = 64),
  fit_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('added', 'removed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sky_private_agent_adds_agent
  ON sky_private_agent_adds (owner_user_id, agent_id, updated_at DESC);
