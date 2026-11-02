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
