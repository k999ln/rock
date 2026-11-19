CREATE TABLE noah_discovery_sources (
  id TEXT PRIMARY KEY CHECK(id IN ('github','huggingface')),
  lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL DEFAULT 0, last_attempt_at INTEGER, last_success_at INTEGER,
  etag TEXT, cursor_key TEXT, error_code TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  observed INTEGER NOT NULL DEFAULT 0, withdrawn INTEGER NOT NULL DEFAULT 0, request_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO noah_discovery_sources(id) VALUES('github'),('huggingface');
CREATE TABLE noah_discovery_candidates (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('github','huggingface')),
  external_id TEXT NOT NULL, repository TEXT NOT NULL, digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','withdrawn')), revision INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL, changed_at INTEGER NOT NULL, checked_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX noah_discovery_candidates_provider_id ON noah_discovery_candidates(provider,external_id);
CREATE INDEX noah_discovery_candidates_refresh ON noah_discovery_candidates(provider,state,checked_at,id);
CREATE INDEX noah_discovery_candidates_latest ON noah_discovery_candidates(state,changed_at,id);
CREATE TABLE noah_discovery_versions (
  candidate_id TEXT NOT NULL REFERENCES noah_discovery_candidates(id), revision INTEGER NOT NULL,
  digest TEXT NOT NULL, metadata_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('active','withdrawn')),
  observed_at INTEGER NOT NULL, PRIMARY KEY(candidate_id,revision)
);
CREATE INDEX noah_discovery_versions_snapshot ON noah_discovery_versions(candidate_id,observed_at,revision);
