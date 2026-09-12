CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  connection_status TEXT NOT NULL CHECK(connection_status IN ('candidate','connected','expired','revoked','error')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand_id, provider, external_account_id),
  UNIQUE(brand_id, provider, username)
);
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_one_active_idx
  ON social_accounts(brand_id, provider) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS content_plans (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  strategy_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE campaigns ADD COLUMN social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN content_plan_id TEXT REFERENCES content_plans(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN title TEXT;
ALTER TABLE campaigns ADD COLUMN format TEXT;
