CREATE TABLE IF NOT EXISTS noah_compute_subscriptions (
  attempt TEXT PRIMARY KEY NOT NULL,
  owner_scope TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  stripe_account TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  price_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  merchant TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  monthly_jobs INTEGER NOT NULL CHECK (monthly_jobs > 0),
  stripe_customer_id TEXT UNIQUE,
  session_id TEXT UNIQUE,
  subscription_id TEXT UNIQUE,
  charge_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','ending','inactive')),
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0,1)),
  renewal_stopped INTEGER NOT NULL DEFAULT 0 CHECK (renewal_stopped IN (0,1)),
  checked_at INTEGER NOT NULL DEFAULT 0,
  period_start INTEGER,
  period_end INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  CHECK (status NOT IN ('active','ending') OR
    (closed = 0 AND subscription_id IS NOT NULL AND charge_id IS NOT NULL
    AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_end > period_start))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_compute_open_contract ON noah_compute_subscriptions(owner_scope,mode,stripe_account) WHERE closed = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_charge ON noah_compute_subscriptions(charge_id) WHERE charge_id IS NOT NULL;
