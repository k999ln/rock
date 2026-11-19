-- Noah connection/sharing v0.3: reference DDL, NOT a production migration.
-- Existing DB: sky_social_profiles, sky_communities, sky_social_posts,
-- sky_community_members, sky_community_keys, remote_ai_text_executions.
-- Owner IDs are existing opaque auth IDs, not new accounts.
-- Times: UTC Unix milliseconds. API/parser constraints and atomic recipes are
-- mandatory in docs/noah-connection-sharing-contracts.md; DDL alone is insufficient.

CREATE TABLE noah_mutation_nonces (
  nonce_hash TEXT PRIMARY KEY NOT NULL CHECK(length(nonce_hash)=64),
  owner_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('draft.create','invite.issue','invite.reissue')),
  target_id TEXT NOT NULL,
  intent_hmac TEXT NOT NULL CHECK(length(intent_hmac)=64),
  hmac_key_version TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  operation_id TEXT,
  CHECK(expires_at>issued_at AND expires_at<=issued_at+600000),
  CHECK((consumed_at IS NULL)=(operation_id IS NULL))
);
CREATE INDEX noah_nonce_gc ON noah_mutation_nonces(expires_at);
CREATE INDEX noah_nonce_owner ON noah_mutation_nonces(owner_id,consumed_at,expires_at);

CREATE TABLE noah_operation_receipts (
  owner_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_hmac TEXT NOT NULL CHECK(length(request_hmac)=64),
  hmac_key_version TEXT NOT NULL,
  http_status INTEGER NOT NULL CHECK(http_status IN (200,201,202)),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)), -- metadata only, no token/body/key
  committed_at INTEGER NOT NULL,
  retain_until INTEGER NOT NULL CHECK(retain_until>=committed_at+7776000000),
  PRIMARY KEY(owner_id,operation_id)
);
CREATE INDEX noah_receipt_gc ON noah_operation_receipts(retain_until);

-- A false assertion must fail inside the batch, not after a committed 0-row UPDATE.
-- Insert with fresh server UUID, then delete in the SAME batch. Never retain rows.
CREATE TABLE noah_tx_guards (
  id TEXT PRIMARY KEY NOT NULL,
  ok INTEGER NOT NULL CHECK(ok=1)
);

CREATE TABLE eve_composer_drafts (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
  revision INTEGER NOT NULL CHECK(revision>=1),
  state TEXT NOT NULL CHECK(state IN ('editable','submitted','deleted','expired')),
  envelope TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
  terminal_at INTEGER,
  retain_until INTEGER,
  last_operation_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,id),
  CHECK((state='editable' AND envelope IS NOT NULL AND terminal_at IS NULL AND retain_until IS NULL)
     OR (state<>'editable' AND envelope IS NULL AND terminal_at IS NOT NULL
         AND retain_until>=terminal_at+7776000000)),
  CHECK(envelope IS NULL OR length(CAST(envelope AS BLOB))<=24576)
);
CREATE INDEX eve_draft_list ON eve_composer_drafts(owner_id,state,updated_at DESC,id DESC);
CREATE INDEX eve_draft_expiry ON eve_composer_drafts(state,expires_at);

CREATE TABLE eve_draft_submissions (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  draft_revision INTEGER NOT NULL CHECK(draft_revision>=1),
  target TEXT NOT NULL CHECK(target IN ('local-text','remote-ai-text')),
  request_id TEXT NOT NULL,
  execution_id TEXT REFERENCES remote_ai_text_executions(id) ON DELETE RESTRICT,
  input_hmac TEXT NOT NULL CHECK(length(input_hmac)=64),
  hmac_key_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('claimed','accepted','rejected','unknown')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,id),
  FOREIGN KEY(owner_id,draft_id) REFERENCES eve_composer_drafts(owner_id,id) ON DELETE RESTRICT,
  UNIQUE(owner_id,draft_id,draft_revision),
  UNIQUE(owner_id,request_id),
  UNIQUE(execution_id),
  CHECK((target='remote-ai-text' AND execution_id IS NOT NULL)
     OR (target='local-text' AND execution_id IS NULL))
);

CREATE TABLE sky_community_egress_heads (
  community_id TEXT PRIMARY KEY NOT NULL REFERENCES sky_communities(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision>=1),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(community_id,revision) REFERENCES sky_community_egress_policies(community_id,revision) ON DELETE RESTRICT
);
CREATE TABLE sky_community_egress_policies (
  community_id TEXT NOT NULL REFERENCES sky_communities(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision>=1),
  mode TEXT NOT NULL CHECK(mode IN ('deny','allow_list')),
  destination_ids_json TEXT NOT NULL CHECK(json_valid(destination_ids_json)
    AND json_type(destination_ids_json)='array' AND json_array_length(destination_ids_json)<=16),
  created_by_profile_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(community_id,revision),
  CHECK((mode='deny' AND json_array_length(destination_ids_json)=0)
     OR (mode='allow_list' AND json_array_length(destination_ids_json)>0))
);
CREATE TABLE sky_post_egress_heads (
  post_id TEXT PRIMARY KEY NOT NULL, -- retained audit ID; source deletion must stay possible
  revision INTEGER NOT NULL CHECK(revision>=1),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(post_id,revision) REFERENCES sky_post_egress_permissions(post_id,revision) ON DELETE RESTRICT
);
CREATE TABLE sky_post_egress_permissions (
  post_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1),
  community_id TEXT NOT NULL,
  author_profile_id TEXT NOT NULL,
  source_pin TEXT NOT NULL CHECK(length(source_pin)=64),
  mode TEXT NOT NULL CHECK(mode IN ('deny','allow_list')),
  destination_ids_json TEXT NOT NULL CHECK(json_valid(destination_ids_json)
    AND json_type(destination_ids_json)='array' AND json_array_length(destination_ids_json)<=16),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+604800000),
  PRIMARY KEY(post_id,revision),
  CHECK((mode='deny' AND json_array_length(destination_ids_json)=0)
     OR (mode='allow_list' AND json_array_length(destination_ids_json)>0))
);

CREATE TABLE noah_egress_previews (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  sender_profile_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  community_key_hash TEXT NOT NULL,
  community_rules_revision INTEGER NOT NULL,
  post_id TEXT NOT NULL,
  source_pin TEXT NOT NULL CHECK(length(source_pin)=64),
  policy_revision INTEGER NOT NULL,
  permission_revision INTEGER NOT NULL,
  destination_id TEXT NOT NULL,
  execution_id TEXT NOT NULL UNIQUE REFERENCES remote_ai_text_executions(id) ON DELETE RESTRICT,
  approval_hmac TEXT NOT NULL CHECK(length(approval_hmac)=64),
  hmac_key_version TEXT NOT NULL,
  payload_envelope TEXT,
  state TEXT NOT NULL CHECK(state IN ('preview','approved','claimed','revoked','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+300000),
  approved_at INTEGER,
  claimed_at INTEGER,
  revoked_at INTEGER,
  terminal_at INTEGER,
  PRIMARY KEY(owner_id,id),
  CHECK(state NOT IN ('approved','claimed') OR approved_at IS NOT NULL),
  CHECK(state<>'claimed' OR claimed_at IS NOT NULL),
  CHECK(state<>'revoked' OR revoked_at IS NOT NULL),
  CHECK((state IN ('preview','approved') AND payload_envelope IS NOT NULL)
     OR (state IN ('claimed','revoked','expired') AND payload_envelope IS NULL)),
  CHECK(payload_envelope IS NULL OR length(CAST(payload_envelope AS BLOB))<=49152)
);
CREATE INDEX noah_egress_expiry ON noah_egress_previews(state,expires_at);
CREATE INDEX noah_egress_owner ON noah_egress_previews(owner_id,state,expires_at);
CREATE INDEX noah_egress_post ON noah_egress_previews(post_id,state);

CREATE TABLE sky_community_invite_controls (
  community_id TEXT PRIMARY KEY NOT NULL REFERENCES sky_communities(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 2 CHECK(version=2),
  epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch>=1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  legacy_disabled_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE sky_community_invites (
  id TEXT PRIMARY KEY NOT NULL,
  community_id TEXT NOT NULL REFERENCES sky_community_invite_controls(community_id) ON DELETE RESTRICT,
  issuer_owner_id TEXT NOT NULL,
  issuer_profile_id TEXT NOT NULL,
  epoch INTEGER NOT NULL CHECK(epoch>=1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  recipient_profile_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('active','redeemed','revoked','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>=created_at+300000 AND expires_at<=created_at+604800000),
  revoked_at INTEGER,
  redeemed_at INTEGER,
  redeemed_by_owner_id TEXT,
  redeemed_by_profile_id TEXT,
  redeem_operation_id TEXT,
  terminal_at INTEGER,
  retain_until INTEGER,
  issue_operation_id TEXT NOT NULL,
  UNIQUE(issuer_owner_id,issue_operation_id),
  UNIQUE(redeemed_by_owner_id,redeem_operation_id),
  CHECK((state='active' AND terminal_at IS NULL AND retain_until IS NULL)
     OR (state<>'active' AND terminal_at IS NOT NULL AND retain_until>=terminal_at+7776000000)),
  CHECK((state='redeemed' AND redeemed_at IS NOT NULL AND redeemed_by_owner_id IS NOT NULL
      AND redeemed_by_profile_id IS NOT NULL AND redeem_operation_id IS NOT NULL)
     OR (state<>'redeemed' AND redeemed_at IS NULL AND redeemed_by_owner_id IS NULL
      AND redeemed_by_profile_id IS NULL AND redeem_operation_id IS NULL)),
  CHECK(state<>'revoked' OR revoked_at IS NOT NULL)
);
CREATE INDEX sky_invite_issuer_list ON sky_community_invites(community_id,created_at DESC,id DESC);
CREATE INDEX sky_invite_expiry ON sky_community_invites(state,expires_at);
CREATE INDEX sky_invite_active_count ON sky_community_invites(community_id,state,expires_at);

-- Immutable policy/author versions. New decisions append a version and CAS the head.
CREATE TRIGGER noah_policy_no_update BEFORE UPDATE ON sky_community_egress_policies
BEGIN SELECT RAISE(ABORT,'NOAH_IMMUTABLE_VERSION'); END;
CREATE TRIGGER noah_permission_no_update BEFORE UPDATE ON sky_post_egress_permissions
BEGIN SELECT RAISE(ABORT,'NOAH_IMMUTABLE_VERSION'); END;
CREATE TRIGGER noah_invite_terminal BEFORE UPDATE ON sky_community_invites
WHEN OLD.state<>'active' AND NEW.state<>OLD.state
BEGIN SELECT RAISE(ABORT,'NOAH_TERMINAL_INVITE'); END;
CREATE TRIGGER noah_draft_terminal BEFORE UPDATE ON eve_composer_drafts
WHEN OLD.state<>'editable' AND NEW.state<>OLD.state
BEGIN SELECT RAISE(ABORT,'NOAH_TERMINAL_DRAFT'); END;
