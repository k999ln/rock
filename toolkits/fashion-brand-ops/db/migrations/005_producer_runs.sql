CREATE TABLE IF NOT EXISTS producer_runs (
  id TEXT PRIMARY KEY,
  input_hash TEXT NOT NULL,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_producer_runs_brand
  ON producer_runs(brand_id, created_at DESC);
