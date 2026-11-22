CREATE TABLE IF NOT EXISTS noah_runner_devices (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, credential_sha256 TEXT NOT NULL UNIQUE,
 boot_id TEXT NOT NULL, name TEXT NOT NULL, platform TEXT NOT NULL,
 created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, revoked_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_runner_owner ON noah_runner_devices(owner_id,last_seen_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_runner_commands (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, device_id TEXT NOT NULL REFERENCES noah_runner_devices(id),
 boot_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('connect','run')),
 state TEXT NOT NULL CHECK(state IN ('queued','claimed','succeeded','failed','cancelled','unknown')),
 request_sha256 TEXT NOT NULL, payload TEXT NOT NULL,
 lease_sha256 TEXT, lease_until INTEGER NOT NULL DEFAULT 0, stop_requested INTEGER NOT NULL DEFAULT 0,
 result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_runner_queue ON noah_runner_commands(device_id,state,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_runner_history ON noah_runner_commands(owner_id,updated_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_runner_one_claim ON noah_runner_commands(device_id) WHERE state='claimed';
