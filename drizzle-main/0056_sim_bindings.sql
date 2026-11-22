CREATE TABLE IF NOT EXISTS sim_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  sim_digest TEXT NOT NULL,
  device_digest TEXT NOT NULL,
  bound_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CONSTRAINT sim_bindings_sim_digest_check CHECK (length(sim_digest) = 64),
  CONSTRAINT sim_bindings_device_digest_check CHECK (length(device_digest) = 64),
  CONSTRAINT sim_bindings_revoke_time_check CHECK (revoked_at IS NULL OR revoked_at >= bound_at)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sim_bindings_active_sim ON sim_bindings(sim_digest) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sim_bindings_sim_revoked ON sim_bindings(sim_digest, revoked_at);
