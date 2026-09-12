CREATE TABLE IF NOT EXISTS business_goals (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('active','paused','completed','cancelled')),
  objective_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '{}',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS business_goals_brand_status_idx
  ON business_goals(brand_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_actions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES business_goals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready','blocked','approval_required','completed','dismissed')),
  priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 100),
  risk TEXT NOT NULL CHECK(risk IN ('internal','external_write','message','publish','money')),
  reason TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_actions_goal_status_idx
  ON workflow_actions(goal_id, status, priority DESC, created_at);

CREATE TABLE IF NOT EXISTS customer_journeys (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('new','exploring','considering','ready_to_buy','customer','vip','at_risk')),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  segment TEXT NOT NULL,
  memory_json TEXT NOT NULL DEFAULT '{}',
  next_action_json TEXT NOT NULL DEFAULT '{}',
  last_message_id TEXT REFERENCES dm_messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand_id, customer_id)
);
CREATE INDEX IF NOT EXISTS customer_journeys_brand_stage_idx
  ON customer_journeys(brand_id, stage, score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS production_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('planned','in_production','quality_check','ready_to_ship','shipped','delivered','blocked','cancelled')),
  planned_units INTEGER NOT NULL CHECK(planned_units > 0),
  completed_units INTEGER NOT NULL DEFAULT 0 CHECK(completed_units >= 0),
  daily_capacity INTEGER NOT NULL CHECK(daily_capacity > 0),
  due_at TEXT NOT NULL,
  bom_json TEXT NOT NULL DEFAULT '{}',
  cost_json TEXT NOT NULL DEFAULT '{}',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS production_jobs_status_due_idx
  ON production_jobs(status, due_at);
