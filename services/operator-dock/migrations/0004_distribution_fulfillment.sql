CREATE TABLE distribution_addresses (
  recipient TEXT PRIMARY KEY NOT NULL,
  address TEXT NOT NULL CHECK(json_valid(address)),
  account_ref TEXT UNIQUE,
  updated_at INTEGER NOT NULL
);
CREATE TABLE distribution_lots (
  id TEXT PRIMARY KEY NOT NULL,
  supplier TEXT NOT NULL,
  item TEXT NOT NULL,
  units INTEGER NOT NULL CHECK(units > 0),
  unit TEXT NOT NULL,
  cost_yen INTEGER CHECK(cost_yen >= 0),
  freight_yen INTEGER CHECK(freight_yen >= 0),
  received_at INTEGER NOT NULL
);
ALTER TABLE distribution_assignments ADD COLUMN lot_id TEXT REFERENCES distribution_lots(id);
ALTER TABLE distribution_assignments ADD COLUMN units INTEGER CHECK(units > 0);
ALTER TABLE distribution_assignments ADD COLUMN address_snapshot TEXT;
ALTER TABLE distribution_assignments ADD COLUMN notice_state TEXT NOT NULL DEFAULT 'legacy' CHECK(notice_state IN ('legacy','queued','waiting','ready','stopped','attention'));
ALTER TABLE distribution_assignments ADD COLUMN next_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_assignments ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_assignments ADD COLUMN result_id TEXT;
ALTER TABLE distribution_assignments ADD COLUMN ready_at INTEGER;
ALTER TABLE distribution_assignments ADD COLUMN usage_yen INTEGER CHECK(usage_yen = 0);
CREATE INDEX distribution_lot_units ON distribution_assignments(lot_id,received_at,units);
CREATE INDEX distribution_notice_due ON distribution_assignments(notice_state,next_attempt);
