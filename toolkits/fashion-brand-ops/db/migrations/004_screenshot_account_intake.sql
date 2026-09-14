CREATE TABLE IF NOT EXISTS social_account_candidates (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}',
  source_digests_json TEXT NOT NULL DEFAULT '[]',
  verification_status TEXT NOT NULL CHECK(verification_status IN ('needs_owner_confirmation','oauth_matched','dismissed')),
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand_id, username)
);

CREATE INDEX IF NOT EXISTS social_account_candidates_brand_status_idx
  ON social_account_candidates(brand_id, verification_status, updated_at DESC);
