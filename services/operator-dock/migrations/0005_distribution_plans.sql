CREATE TABLE distribution_plans (
  id TEXT PRIMARY KEY NOT NULL,
  recipient TEXT NOT NULL,
  template_lot TEXT NOT NULL REFERENCES distribution_lots(id),
  units INTEGER NOT NULL CHECK(units>0),
  pickup TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  interval_days INTEGER NOT NULL CHECK(interval_days BETWEEN 1 AND 366),
  window_hours INTEGER NOT NULL CHECK(window_hours BETWEEN 1 AND 168),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  retry_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX distribution_plans_due ON distribution_plans(enabled,retry_at,next_at);
CREATE TABLE distribution_occurrences (
  plan_id TEXT NOT NULL REFERENCES distribution_plans(id),
  due INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('assigned','shortage','ineligible','missed','waiting')),
  attempted_at INTEGER NOT NULL,
  assignment_id TEXT REFERENCES distribution_assignments(id),
  PRIMARY KEY(plan_id,due)
);
ALTER TABLE distribution_assignments ADD COLUMN plan_id TEXT REFERENCES distribution_plans(id);
ALTER TABLE distribution_assignments ADD COLUMN window_at INTEGER;
CREATE UNIQUE INDEX distribution_once_per_window ON distribution_assignments(plan_id,window_at);
