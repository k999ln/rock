CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  design_json TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK(price_minor >= 0),
  currency TEXT NOT NULL CHECK(length(currency) = 3),
  status TEXT NOT NULL CHECK(status IN ('draft','active','paused','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products(brand_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS market_assessments (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creative_assets (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('image','video','copy','bundle')),
  status TEXT NOT NULL CHECK(status IN ('draft','approval_required','generating','ready','failed')),
  prompt TEXT NOT NULL,
  output_json TEXT NOT NULL DEFAULT '{}',
  feedback_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  social_provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','approval_required','scheduled','published','paused','failed')),
  caption TEXT NOT NULL,
  asset_ids_json TEXT NOT NULL DEFAULT '[]',
  scheduled_for TEXT,
  external_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  external_ref TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}',
  consent_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand_id, external_ref)
);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  body TEXT NOT NULL,
  classification TEXT NOT NULL,
  purchase_intent REAL NOT NULL CHECK(purchase_intent >= 0 AND purchase_intent <= 1),
  reply_draft TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, external_message_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('collecting','quoted','payment_pending','paid','in_production','quality_check','ready_to_ship','shipped','delivered','cancelled','refunded')),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor >= 0),
  currency TEXT NOT NULL CHECK(length(currency) = 3),
  customization_json TEXT NOT NULL DEFAULT '{}',
  shipping_json TEXT NOT NULL DEFAULT '{}',
  external_payment_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_brand_status_idx ON orders(brand_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS fulfillment_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  risk TEXT NOT NULL CHECK(risk IN ('external_write','message','publish','money')),
  payload_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','executing','completed','rejected','reconciliation_required')),
  actor_id TEXT,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS effect_runs (
  id TEXT PRIMARY KEY,
  approval_id TEXT NOT NULL UNIQUE REFERENCES approval_requests(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('executing','completed','reconciliation_required')),
  receipt_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  UNIQUE(provider, external_event_id)
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  metric_type TEXT NOT NULL,
  value REAL NOT NULL,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS metrics_brand_time_idx ON metrics(brand_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS feedback_snapshots (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  feedback_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(brand_id, version)
);
