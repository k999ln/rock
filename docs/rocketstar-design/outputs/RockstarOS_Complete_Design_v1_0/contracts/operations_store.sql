-- Design-level reference DDL. Separate store owner: colony command-broker.
-- Not installed into the existing OS. SQLite reference only, no live device driver.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS command_intent(
 command_id TEXT PRIMARY KEY,
 work_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE,
 request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
 target_asset_id TEXT NOT NULL,
 target_boot_id TEXT NOT NULL,
 authority_epoch INTEGER NOT NULL CHECK(authority_epoch>=0),
 expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),
 expires_utc_ms INTEGER NOT NULL CHECK(expires_utc_ms>=0),
 execution_mode TEXT NOT NULL CHECK(execution_mode IN ('SIMULATION','HARDWARE_IN_LOOP','OPERATIONAL')),
 command_json TEXT NOT NULL,
 -- Complete command envelope, not payload alone. Freeze after approval in application.
 state TEXT NOT NULL CHECK(state IN ('PREPARED','APPROVED','DISPATCH_CLAIMED','ACCEPTED','EXECUTING','SUCCEEDED','REJECTED','FAILED','UNKNOWN','EXPIRED','CANCELLED')),
 updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS approval_binding(
 approval_id TEXT PRIMARY KEY,
 command_id TEXT NOT NULL REFERENCES command_intent(command_id),
 approved_digest TEXT NOT NULL CHECK(length(approved_digest)=64),
 actor_ref TEXT NOT NULL,
 authorization_receipt_ref TEXT NOT NULL,
 expires_utc_ms INTEGER NOT NULL,
 revoked INTEGER NOT NULL CHECK(revoked IN (0,1)),
 UNIQUE(command_id,actor_ref,approved_digest)
);
CREATE TABLE IF NOT EXISTS dispatch_claim(
 command_id TEXT PRIMARY KEY REFERENCES command_intent(command_id),
 request_digest TEXT NOT NULL,
 claimed_at_ms INTEGER NOT NULL,
 transport_receipt_ref TEXT,
 -- Transport receipt is not an equipment completion result.
 CHECK(length(request_digest)=64)
);
CREATE TABLE IF NOT EXISTS command_result(
 result_id TEXT PRIMARY KEY,
 command_id TEXT NOT NULL REFERENCES command_intent(command_id),
 issuer_node_id TEXT NOT NULL,
 issuer_boot_id TEXT NOT NULL,
 message_id TEXT NOT NULL,
 request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
 result_json TEXT NOT NULL,
 verified_identity_ref TEXT NOT NULL,
 received_at_ms INTEGER NOT NULL,
 UNIQUE(issuer_node_id,issuer_boot_id,message_id)
);
CREATE TABLE IF NOT EXISTS audit_event(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 command_id TEXT REFERENCES command_intent(command_id),
 kind TEXT NOT NULL,
 event_json TEXT NOT NULL,
 monotonic_ms INTEGER NOT NULL CHECK(monotonic_ms>=0),
 boot_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS command_pending ON command_intent(state,expires_utc_ms);
-- Application transactions enforce allowed transitions, approval+digest matching,
-- authorization, durable claim, fresh state, and correct final evidence.
-- DDL constraints alone do not implement those mechanisms.
