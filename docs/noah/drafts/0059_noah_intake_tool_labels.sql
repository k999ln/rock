-- DRAFT ONLY: task 127 offline tool labels.
-- Do not apply to production D1.  Keep until the owner approves a migration,
-- the 17,046-series sample is reviewed, and local/CI acceptance is complete.
-- Raw provider metadata is intentionally not stored here; only hashes and
-- bounded evidence paths/tokens are retained.
CREATE TABLE IF NOT EXISTS noah_intake_tool_labels (
  schema TEXT NOT NULL CHECK(schema = 'noah-label-row/1'),
  request_id TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256) = 64),
  family_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES noah_intake_candidates(id),
  tools_sha256 TEXT NOT NULL CHECK(length(tools_sha256) = 64),
  tool_definition_sha256 TEXT NOT NULL CHECK(length(tool_definition_sha256) = 64),
  tool_name TEXT NOT NULL CHECK(length(tool_name) BETWEEN 1 AND 256),
  label_version TEXT NOT NULL CHECK(label_version = 'noah-card/1'),
  verifier_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','rejected','invalidated')),
  consumes_json TEXT CHECK(consumes_json IS NULL OR json_valid(consumes_json)),
  produces TEXT,
  inputs_json TEXT NOT NULL CHECK(json_valid(inputs_json)),
  outputs_json TEXT NOT NULL CHECK(json_valid(outputs_json)),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  invalidated_at INTEGER,
  PRIMARY KEY(family_id, candidate_id, tool_name, tools_sha256, tool_definition_sha256, label_version, verifier_version)
);
CREATE INDEX IF NOT EXISTS noah_intake_tool_labels_read
  ON noah_intake_tool_labels(family_id, candidate_id, tools_sha256, manifest_sha256, label_version, verifier_version, status, tool_name);
