CREATE TABLE billing_customers (
  user_id TEXT PRIMARY KEY NOT NULL,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0,1)),
  stripe_event_created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_billing_subscriptions_user_updated
  ON billing_subscriptions(user_id, updated_at DESC);

CREATE TABLE billing_invoices (
  stripe_invoice_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_paid INTEGER NOT NULL,
  currency TEXT NOT NULL,
  period_start INTEGER,
  period_end INTEGER,
  paid_at INTEGER,
  stripe_event_created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_billing_invoices_user_updated
  ON billing_invoices(user_id, updated_at DESC);

CREATE TABLE billing_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  stripe_created_at INTEGER NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE billing_checkout_locks (
  user_id TEXT PRIMARY KEY NOT NULL,
  jti TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  session_id TEXT,
  checkout_url TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
