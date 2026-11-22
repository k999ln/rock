CREATE TABLE IF NOT EXISTS distribution_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  recipient TEXT NOT NULL,
  item TEXT NOT NULL,
  quantity TEXT NOT NULL,
  pickup TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  received_at INTEGER
);
CREATE INDEX IF NOT EXISTS distribution_recipient ON distribution_assignments(recipient, assigned_at);
