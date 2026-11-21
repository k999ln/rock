-- task99: explicit per-result consent. Development only; no production application.
CREATE TABLE IF NOT EXISTS noah_result_contributions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  work_revision INTEGER NOT NULL CHECK(work_revision >= 0),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  policy_version TEXT NOT NULL CHECK(policy_version = 'noah-quality-v1'),
  state TEXT NOT NULL CHECK(state IN ('active','revoked')),
  snapshot TEXT CHECK(snapshot IS NULL OR (json_valid(snapshot) AND length(CAST(snapshot AS BLOB)) <= 196608)),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK((state = 'active' AND snapshot IS NOT NULL AND revoked_at IS NULL) OR
        (state = 'revoked' AND snapshot IS NULL AND revoked_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_result_one_work ON noah_result_contributions(owner_id,work_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_result_operator ON noah_result_contributions(state,created_at,id);
