-- Synthetic historical schema for applySourceSandboxSchema only.
-- The main lineage assumes an existing/backup-restored 0000-0019 database.
-- This fixture models that precondition; NOT deployable migrations or current prices.
-- Original Sites Source 1b65413cda03e8dfad686601416687c598a99cc8.
-- Only idempotent CREATE syntax differs from the pinned originals.

--> statement-breakpoint
-- Original 0016_sky_monthly_sandbox.sql; sha256 fe52954e0d69340905210be5f1bfa7da23d3e9937c592275b3aaf5c67ec62b78
-- Explicitly sandbox-only records. No live payment or balance authority.
CREATE TABLE IF NOT EXISTS sky_monthly_sandbox_invoices (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, period TEXT NOT NULL,
 currency TEXT NOT NULL DEFAULT 'JPY' CHECK(currency='JPY'),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','paid')),
 total_minor INTEGER NOT NULL DEFAULT 0 CHECK(total_minor >= 0 AND total_minor <= 1000),
 cap_minor INTEGER NOT NULL DEFAULT 1000 CHECK(cap_minor=1000),
 provider_receipt TEXT, created_at INTEGER NOT NULL,
 UNIQUE(owner_id,period)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sky_monthly_sandbox_quotes (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
 input_json TEXT NOT NULL, input_hash TEXT NOT NULL, rate_version TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 10 AND 200),
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sky_monthly_sandbox_usage (
 quote_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, invoice_id TEXT NOT NULL,
 job_id TEXT NOT NULL UNIQUE, amount_minor INTEGER NOT NULL, created_at INTEGER NOT NULL,
 FOREIGN KEY(invoice_id) REFERENCES sky_monthly_sandbox_invoices(id)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_monthly_sandbox_usage_cap
BEFORE INSERT ON sky_monthly_sandbox_usage
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM sky_monthly_sandbox_invoices i
  JOIN sky_monthly_sandbox_quotes q ON q.invoice_id=i.id
  WHERE i.id=NEW.invoice_id AND i.owner_id=NEW.owner_id AND i.status='draft'
    AND q.id=NEW.quote_id AND q.owner_id=NEW.owner_id AND q.amount_minor=NEW.amount_minor
    AND NEW.job_id=q.id AND q.expires_at > NEW.created_at
    AND i.total_minor+NEW.amount_minor <= i.cap_minor
 ) THEN RAISE(ABORT,'MONTHLY_CAP_CLOSED_OR_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_monthly_sandbox_usage_total
AFTER INSERT ON sky_monthly_sandbox_usage
BEGIN
 UPDATE sky_monthly_sandbox_invoices SET total_minor=total_minor+NEW.amount_minor WHERE id=NEW.invoice_id;
END;

--> statement-breakpoint
-- Original 0017_sky_cloud_monthly_test.sql; sha256 09563f40add9e5173fd7fa64358bec39cc67bbac59828abdfd2d1b755a38cd39
-- Stripe test-mode invoices only. Never a production collection authority.
CREATE TABLE IF NOT EXISTS sky_cloud_monthly_invoices (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, period TEXT NOT NULL, currency TEXT NOT NULL,
 stripe_account_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','submitting','open','paid','attention')),
 total_minor INTEGER NOT NULL DEFAULT 0 CHECK(total_minor>=0 AND total_minor<=1000000),
 stripe_customer_id TEXT, stripe_invoice_id TEXT UNIQUE, stripe_item_id TEXT,
 hosted_invoice_url TEXT, submission_started_at INTEGER, created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL, UNIQUE(owner_id,period,currency,stripe_account_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sky_cloud_monthly_items (
 source_kind TEXT NOT NULL CHECK(source_kind IN ('a2a','remote_llm')), source_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES sky_cloud_monthly_invoices(id), owner_id TEXT NOT NULL,
 provider_id TEXT NOT NULL, provider_reference TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
 currency TEXT NOT NULL, pricing_version TEXT NOT NULL, usage_json TEXT NOT NULL,
 source_digest TEXT NOT NULL, occurred_at INTEGER NOT NULL,
 PRIMARY KEY(source_kind,source_id), UNIQUE(provider_id,provider_reference)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sky_cloud_monthly_events (
 event_id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, type TEXT NOT NULL, processed_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_cloud_monthly_item_guard BEFORE INSERT ON sky_cloud_monthly_items
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_cloud_monthly_invoices i
 WHERE i.id=NEW.invoice_id AND i.owner_id=NEW.owner_id AND i.currency=NEW.currency AND i.status='draft'
 AND i.total_minor+NEW.amount_minor<=1000000) THEN RAISE(ABORT,'MONTHLY_CLOSED_OR_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_cloud_monthly_item_total AFTER INSERT ON sky_cloud_monthly_items
BEGIN
 UPDATE sky_cloud_monthly_invoices SET total_minor=total_minor+NEW.amount_minor WHERE id=NEW.invoice_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_cloud_monthly_item_no_update BEFORE UPDATE ON sky_cloud_monthly_items
BEGIN SELECT RAISE(ABORT,'MONTHLY_USAGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_cloud_monthly_item_no_delete BEFORE DELETE ON sky_cloud_monthly_items
BEGIN SELECT RAISE(ABORT,'MONTHLY_USAGE_IMMUTABLE'); END;

--> statement-breakpoint
-- Original 0018_sky_recurring_sandbox.sql; sha256 7560003271cc4e43e6a0e447c90a9e28b564d0f0a47933559e45686e1ec44b36
-- Opt-in Stripe sandbox contracts; not a production entitlement.
CREATE TABLE IF NOT EXISTS sky_recurring_contracts (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE, stripe_account_id TEXT NOT NULL,
 customer_id TEXT NOT NULL, payment_method_id TEXT NOT NULL, payment_revision INTEGER NOT NULL DEFAULT 0,
 consent_version TEXT NOT NULL, credit_minor INTEGER NOT NULL CHECK(credit_minor=14000),
 period_start INTEGER NOT NULL, period_end INTEGER NOT NULL CHECK(period_end>period_start),
 status TEXT NOT NULL CHECK(status IN ('active','collecting','past_due','cancelled','disputed')),
 access_until INTEGER NOT NULL, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sky_recurring_charges (
 id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sky_recurring_contracts(id),
 period_start INTEGER NOT NULL, period_end INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('creating','open','paid','attention')),
 invoice_id TEXT UNIQUE, item_id TEXT, started_at INTEGER NOT NULL,
 attempt_revision INTEGER NOT NULL DEFAULT -1, attempt_key_revision INTEGER NOT NULL DEFAULT -1, attempt_started_at INTEGER, paid_at INTEGER,
 UNIQUE(contract_id,period_start)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_recurring_llm_reserve BEFORE UPDATE OF state ON remote_ai_text_executions WHEN (NEW.state='reserved' AND OLD.state='quoted') AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.updated_at AND c.period_start<=NEW.updated_at AND c.period_end>NEW.updated_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
SELECT CASE WHEN NEW.currency!='USD' OR NEW.created_at<(SELECT period_start FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) OR (COALESCE((SELECT SUM(CASE WHEN e.state='completed' THEN e.settled_minor ELSE e.maximum_charge_minor END) FROM remote_ai_text_executions e JOIN sky_recurring_contracts c ON c.owner_id=e.owner_user_id WHERE e.owner_user_id=NEW.owner_user_id AND (e.state IN ('reserved','sending','unreconciled') OR (e.state='completed' AND e.created_at>=c.period_start AND e.created_at<c.period_end))),0)+COALESCE((SELECT SUM(CASE WHEN r.state='settled' THEN r.settled_minor ELSE r.reserved_minor END) FROM agent_delegation_budget_reservations r JOIN sky_recurring_contracts c ON c.owner_id=r.owner_user_id WHERE r.owner_user_id=NEW.owner_user_id AND (r.state='held' OR (r.state='settled' AND r.created_at>=c.period_start AND r.created_at<c.period_end))),0))+NEW.maximum_charge_minor>10000 THEN RAISE(ABORT,'SKY_RECURRING_QUOTA') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_recurring_llm_dispatch BEFORE UPDATE OF state ON remote_ai_text_executions WHEN (NEW.state='sending' AND OLD.state='reserved') AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.updated_at AND c.period_start<=NEW.updated_at AND c.period_end>NEW.updated_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_recurring_llm_send BEFORE INSERT ON remote_ai_text_send_claims WHEN (1) AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.claimed_at AND c.period_start<=NEW.claimed_at AND c.period_end>NEW.claimed_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_recurring_a2a_reserve BEFORE INSERT ON agent_delegation_budget_reservations WHEN (NEW.state='held') AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.created_at AND c.period_start<=NEW.created_at AND c.period_end>NEW.created_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
SELECT CASE WHEN NEW.currency!='USD' OR NEW.created_at<(SELECT period_start FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) OR (COALESCE((SELECT SUM(CASE WHEN e.state='completed' THEN e.settled_minor ELSE e.maximum_charge_minor END) FROM remote_ai_text_executions e JOIN sky_recurring_contracts c ON c.owner_id=e.owner_user_id WHERE e.owner_user_id=NEW.owner_user_id AND (e.state IN ('reserved','sending','unreconciled') OR (e.state='completed' AND e.created_at>=c.period_start AND e.created_at<c.period_end))),0)+COALESCE((SELECT SUM(CASE WHEN r.state='settled' THEN r.settled_minor ELSE r.reserved_minor END) FROM agent_delegation_budget_reservations r JOIN sky_recurring_contracts c ON c.owner_id=r.owner_user_id WHERE r.owner_user_id=NEW.owner_user_id AND (r.state='held' OR (r.state='settled' AND r.created_at>=c.period_start AND r.created_at<c.period_end))),0))+NEW.reserved_minor>10000 THEN RAISE(ABORT,'SKY_RECURRING_QUOTA') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_recurring_a2a_send BEFORE UPDATE OF state ON agent_delegations WHEN (NEW.state IN ('dispatching','dispatch_submitting') AND NEW.state!=OLD.state) AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.updated_at AND c.period_start<=NEW.updated_at AND c.period_end>NEW.updated_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
END;
--> statement-breakpoint

--> statement-breakpoint
-- Original 0019_sky_hosted_monthly.sql; sha256 3519e01d49d93e05ff21808b858efa1a0dfd0adce7220bffacc2145a5cbdf626
CREATE TABLE IF NOT EXISTS `sky_hosted_monthly_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`invoice_id` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_hosted_monthly_tests` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`contract_id` text NOT NULL,
	`old_contract_json` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`phase` text DEFAULT 'migrating' NOT NULL,
	`fixture_minor` integer DEFAULT 0 NOT NULL,
	`customer_id` text,
	`fail_method_id` text,
	`good_method_id` text,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sky_hosted_fixture" CHECK("sky_hosted_monthly_tests"."fixture_minor" IN (0,10000)),
	CONSTRAINT "sky_hosted_phase" CHECK("sky_hosted_monthly_tests"."phase" IN ('migrating','active','capped','unpaid','restored'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sky_hosted_monthly_tests_id_unique` ON `sky_hosted_monthly_tests` (`id`);

