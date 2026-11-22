-- Noah: 定期便の台帳（2026-11-22 の本人の決定「配給制にする」）。入金と費用・寄与・受け取る人・月の締め・人ごとの結果。
-- Teikibin ledger task 124: entries, contributions, people, monthly closes and per-person lines. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表は変えない。お金は送らない（振込は運営が行い、結果だけを書く）。
-- 仕様: docs/noah/spec-124-teikibin-ledger.md の 4 章。

-- 受け取る人。owner_id は Noah の本人。identity_key は確かめた身元の HMAC（生の口座番号・回線番号は持たない）。
CREATE TABLE IF NOT EXISTS noah_teikibin_people (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(code) = 9),
  identity_key TEXT CHECK (identity_key IS NULL OR length(identity_key) = 64),
  method TEXT CHECK (method IS NULL OR method IN ('bank_account', 'esim_line')),
  verified_by TEXT,
  verified_at INTEGER,
  revoked_at INTEGER,
  revoked_by TEXT,
  revoke_reason TEXT,
  plan_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (plan_opt_in IN (0, 1)),
  created_at INTEGER NOT NULL,
  CHECK ((identity_key IS NULL) = (verified_at IS NULL) AND (identity_key IS NULL) = (method IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_teikibin_people_owner ON noah_teikibin_people(owner_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_teikibin_people_code ON noah_teikibin_people(code);
--> statement-breakpoint
-- 同じ口座・同じ回線で 2 人分は受け取れない（止めた人は数えない）。
CREATE UNIQUE INDEX IF NOT EXISTS noah_teikibin_people_identity ON noah_teikibin_people(identity_key) WHERE identity_key IS NOT NULL AND revoked_at IS NULL;
--> statement-breakpoint
-- 入金と費用。実際に入った・出たお金だけ。同じ種類・同じ受領番号は、取り消していない物の中で 1 つ。
CREATE TABLE IF NOT EXISTS noah_teikibin_entries (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (length(month) = 7),
  kind TEXT NOT NULL CHECK (kind IN ('income', 'refund', 'platform_fee', 'direct_cost', 'creator_share')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000),
  source TEXT NOT NULL CHECK (source IN ('coconala', 'noah', 'cloud', 'ai', 'bank', 'other')),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 3 AND 120),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  recorded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  voided_at INTEGER,
  voided_by TEXT,
  void_reason TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_teikibin_entries_reference ON noah_teikibin_entries(kind, reference) WHERE voided_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_teikibin_entries_month ON noah_teikibin_entries(month, created_at);
--> statement-breakpoint
-- 寄与（作業料の元）。検収に通った量 × 割り当てた時の単価。確かめた人だけ。
CREATE TABLE IF NOT EXISTS noah_teikibin_contributions (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (length(month) = 7),
  person_id TEXT NOT NULL REFERENCES noah_teikibin_people(id),
  kind TEXT NOT NULL CHECK (kind IN ('compute', 'judgment', 'referral')),
  accepted_units INTEGER NOT NULL CHECK (accepted_units BETWEEN 0 AND 100000000),
  unit_rate_minor INTEGER NOT NULL CHECK (unit_rate_minor BETWEEN 0 AND 1000000),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 3 AND 120),
  recorded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  voided_at INTEGER,
  voided_by TEXT,
  void_reason TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_teikibin_contributions_reference ON noah_teikibin_contributions(reference) WHERE voided_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_teikibin_contributions_month ON noah_teikibin_contributions(month, person_id);
--> statement-breakpoint
-- 月の締め。closing の間に止まったら、settlement（入力と人ごとの結果の全部）から続ける。
CREATE TABLE IF NOT EXISTS noah_teikibin_months (
  month TEXT PRIMARY KEY CHECK (length(month) = 7),
  state TEXT NOT NULL CHECK (state IN ('closing', 'closed')),
  form TEXT NOT NULL CHECK (form IN ('cash', 'goods')),
  reserve_bps INTEGER NOT NULL CHECK (reserve_bps BETWEEN 0 AND 10000),
  dividend_bps INTEGER NOT NULL CHECK (dividend_bps BETWEEN 0 AND 10000),
  plan_price_minor INTEGER CHECK (plan_price_minor IS NULL OR plan_price_minor BETWEEN 1 AND 1000000),
  people INTEGER NOT NULL CHECK (people BETWEEN 0 AND 5000),
  lines INTEGER NOT NULL CHECK (lines BETWEEN 0 AND 10000),
  net_cash_minor INTEGER NOT NULL,
  fees_minor INTEGER NOT NULL CHECK (fees_minor >= 0),
  reserve_minor INTEGER NOT NULL CHECK (reserve_minor >= 0),
  surplus_minor INTEGER NOT NULL,
  pool_minor INTEGER NOT NULL CHECK (pool_minor >= 0),
  company_minor INTEGER NOT NULL,
  shortfall_minor INTEGER NOT NULL CHECK (shortfall_minor >= 0),
  settlement TEXT NOT NULL,
  digest TEXT NOT NULL CHECK (length(digest) = 64),
  closed_by TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  closed_at INTEGER,
  CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);
--> statement-breakpoint
-- 人ごとの結果。fee + dividend - deduction = cash + goods。振込の番号は全部の行で一意。
CREATE TABLE IF NOT EXISTS noah_teikibin_lines (
  month TEXT NOT NULL REFERENCES noah_teikibin_months(month),
  person_id TEXT NOT NULL REFERENCES noah_teikibin_people(id),
  fee_minor INTEGER NOT NULL CHECK (fee_minor >= 0),
  dividend_minor INTEGER NOT NULL CHECK (dividend_minor >= 0),
  deduction_minor INTEGER NOT NULL CHECK (deduction_minor >= 0),
  cash_minor INTEGER NOT NULL CHECK (cash_minor >= 0),
  goods_minor INTEGER NOT NULL CHECK (goods_minor >= 0),
  paid_plan INTEGER NOT NULL CHECK (paid_plan IN (0, 1)),
  payout_state TEXT NOT NULL CHECK (payout_state IN ('none', 'pending', 'held', 'paid')),
  payout_ref TEXT,
  paid_by TEXT,
  paid_at INTEGER,
  goods_state TEXT NOT NULL CHECK (goods_state IN ('none', 'pending', 'assigned')),
  goods_ref TEXT,
  assigned_by TEXT,
  assigned_at INTEGER,
  PRIMARY KEY (month, person_id),
  CHECK (fee_minor + dividend_minor - deduction_minor = cash_minor + goods_minor),
  CHECK ((payout_state = 'none') = (cash_minor = 0)),
  CHECK ((goods_state = 'none') = (goods_minor = 0)),
  CHECK ((payout_state = 'paid') = (payout_ref IS NOT NULL)),
  CHECK ((goods_state = 'assigned') = (goods_ref IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_teikibin_lines_payout_ref ON noah_teikibin_lines(payout_ref) WHERE payout_ref IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_teikibin_lines_person ON noah_teikibin_lines(person_id, month);
