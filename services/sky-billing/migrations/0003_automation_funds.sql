ALTER TABLE earning_receipts ADD COLUMN fund_id TEXT;
ALTER TABLE earning_receipts ADD COLUMN automation_tool_id TEXT;

CREATE INDEX idx_earning_receipts_user_fund_period
  ON earning_receipts(user_id, fund_id, period, occurred_at DESC);

CREATE TABLE monthly_fund_earning_settlements (
  user_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  period TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency='usd'),
  gross_minor INTEGER NOT NULL CHECK(gross_minor>=0),
  operating_cost_minor INTEGER NOT NULL CHECK(operating_cost_minor>=0),
  sky_fee_minor INTEGER NOT NULL CHECK(sky_fee_minor>=0 AND sky_fee_minor<=888),
  user_payable_minor INTEGER NOT NULL CHECK(user_payable_minor>=0),
  receipt_count INTEGER NOT NULL CHECK(receipt_count>=0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, fund_id, period, currency)
);
