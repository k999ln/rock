-- Shared jobs contain only IDs into a versioned public corpus. No source, prompts or credentials.
CREATE TABLE IF NOT EXISTS noah_compute_devices (
  id TEXT PRIMARY KEY NOT NULL,
  owner_scope TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  mode TEXT NOT NULL,
  stripe_account TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  profile_revision INTEGER NOT NULL,
  enrolled_at INTEGER NOT NULL,
  revoked_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_devices_owner ON noah_compute_devices(owner_scope,enrolled_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_compute_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_scope TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  contract_attempt TEXT NOT NULL,
  workload TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  profile_revision INTEGER NOT NULL,
  period_start INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','leased','completed','cancelled','expired')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  device_id TEXT REFERENCES noah_compute_devices(id),
  lease_id TEXT,
  lease_start INTEGER,
  lease_until INTEGER,
  finished_at INTEGER,
  elapsed_ms INTEGER CHECK(elapsed_ms BETWEEN 0 AND 750),
  result_label TEXT,
  result_score INTEGER,
  receipt_id TEXT UNIQUE,
  UNIQUE(owner_scope,request_id),
  CHECK((status='completed') = (receipt_id IS NOT NULL)),
  CHECK(status <> 'completed' OR (result_score IS NOT NULL AND result_label IS NOT NULL AND finished_at IS NOT NULL AND elapsed_ms IS NOT NULL AND lease_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_jobs_budget ON noah_compute_jobs(owner_scope,period_start,status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_jobs_history ON noah_compute_jobs(owner_scope,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_jobs_queue ON noah_compute_jobs(status,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_jobs_device ON noah_compute_jobs(device_id,status,lease_until);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_compute_delegation_fences (
  owner_scope TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('run','connect')),
  min_revision INTEGER NOT NULL,
  PRIMARY KEY(owner_scope,action)
);
