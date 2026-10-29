-- Fixture contract only. NOT a production migration, grant issuer, or trust root.
CREATE TABLE work_tool_package_authorities (
  authority_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision >= 1 AND revision <= 9007199254740991),
  owner_user_id TEXT NOT NULL,
  issuer_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  package_key TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) = 64),
  root_state TEXT NOT NULL CHECK (root_state = 'fixture_only'),
  root_ref TEXT NOT NULL CHECK (root_ref LIKE 'fixture-only:%'),
  state TEXT NOT NULL CHECK (state IN ('active','revoked','superseded')),
  issued_at INTEGER NOT NULL CHECK (typeof(issued_at) = 'integer' AND issued_at >= 0 AND issued_at <= 9007199254740991),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer' AND expires_at > issued_at AND expires_at <= 9007199254740991),
  revoked_at INTEGER,
  CHECK ((state = 'active' AND revoked_at IS NULL) OR (state != 'active' AND typeof(revoked_at) = 'integer')),
  FOREIGN KEY (issuer_id,claim_id) REFERENCES rockstar_service_entitlements(issuer_id,claim_id)
);
CREATE INDEX work_tool_package_authority_fixture_owner ON work_tool_package_authorities(owner_user_id,package_key);
