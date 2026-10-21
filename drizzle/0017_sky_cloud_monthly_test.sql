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
