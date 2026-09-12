CREATE TABLE earning_receipts (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  execution_receipt_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  beneficiary_role TEXT NOT NULL CHECK(beneficiary_role IN ('toc','tob')),
  source_provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  payout_account_id TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency='usd'),
  gross_minor INTEGER NOT NULL CHECK(gross_minor>=0),
  operating_cost_minor INTEGER NOT NULL CHECK(operating_cost_minor>=0 AND operating_cost_minor<=gross_minor),
  sky_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(sky_fee_minor>=0 AND sky_fee_minor<=888),
  distributable_minor INTEGER NOT NULL DEFAULT 0 CHECK(distributable_minor>=0),
  period TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  applied_at INTEGER,
  UNIQUE(source_provider, provider_reference)
);
CREATE INDEX idx_earning_receipts_user_period
  ON earning_receipts(user_id, period, occurred_at DESC);

CREATE TABLE monthly_earning_settlements (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency='usd'),
  gross_minor INTEGER NOT NULL CHECK(gross_minor>=0),
  operating_cost_minor INTEGER NOT NULL CHECK(operating_cost_minor>=0),
  sky_fee_minor INTEGER NOT NULL CHECK(sky_fee_minor>=0 AND sky_fee_minor<=888),
  distributable_minor INTEGER NOT NULL CHECK(distributable_minor>=0),
  receipt_count INTEGER NOT NULL CHECK(receipt_count>=0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, period, currency)
);

CREATE TABLE earning_ledger_entries (
  entry_id TEXT PRIMARY KEY NOT NULL,
  receipt_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  account TEXT NOT NULL CHECK(account IN ('AUTOMATION_REVENUE','OPERATING_COST','SKY_SERVICE_FEE','BENEFICIARY_PAYABLE')),
  direction TEXT NOT NULL CHECK(direction IN ('credit','debit')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  currency TEXT NOT NULL CHECK(currency='usd'),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(receipt_id) REFERENCES earning_receipts(receipt_id)
);
CREATE INDEX idx_earning_ledger_user_period
  ON earning_ledger_entries(user_id, period, created_at DESC);

CREATE TABLE payout_instructions (
  instruction_id TEXT PRIMARY KEY NOT NULL,
  receipt_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  payout_account_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
  currency TEXT NOT NULL CHECK(currency='usd'),
  status TEXT NOT NULL CHECK(status IN ('ready','processing','paid','failed','unknown','not_required')),
  idempotency_key TEXT UNIQUE NOT NULL,
  lease_id TEXT,
  lease_expires_at INTEGER,
  provider_transfer_reference TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(receipt_id) REFERENCES earning_receipts(receipt_id)
);
