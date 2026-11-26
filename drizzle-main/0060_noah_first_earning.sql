-- Noah's invited first-earnings pilot. No bank details or payment instructions.
CREATE TABLE IF NOT EXISTS noah_first_earnings (
  owner_scope TEXT PRIMARY KEY NOT NULL CHECK (length(owner_scope) = 73),
  stage TEXT NOT NULL CHECK (stage IN ('preparing','contracted','delivered','payout_pending','bank_reported','bank_confirmed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at INTEGER NOT NULL,
  reviewed_by TEXT NOT NULL,
  order_digest TEXT UNIQUE CHECK (order_digest IS NULL OR length(order_digest) = 64),
  payout_digest TEXT UNIQUE CHECK (payout_digest IS NULL OR length(payout_digest) = 64),
  amount_yen INTEGER CHECK (amount_yen IS NULL OR amount_yen BETWEEN 1 AND 1000000000),
  bank_date TEXT CHECK (bank_date IS NULL OR length(bank_date) = 10),
  CHECK (stage NOT IN ('contracted','delivered','payout_pending','bank_reported','bank_confirmed') OR order_digest IS NOT NULL),
  CHECK ((stage IN ('bank_reported','bank_confirmed')) = (amount_yen IS NOT NULL AND bank_date IS NOT NULL)),
  CHECK ((stage = 'bank_confirmed') = (payout_digest IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_first_earning_runs (
  owner_scope TEXT NOT NULL REFERENCES noah_first_earnings(owner_scope),
  job_id TEXT NOT NULL,
  runtime TEXT NOT NULL CHECK (runtime IN ('free', 'managed')),
  reserved_ms INTEGER NOT NULL CHECK (reserved_ms BETWEEN 1 AND 240000),
  expires_at INTEGER NOT NULL,
  charged_ms INTEGER CHECK (charged_ms >= 0 AND charged_ms <= reserved_ms),
  PRIMARY KEY (owner_scope, job_id)
);
