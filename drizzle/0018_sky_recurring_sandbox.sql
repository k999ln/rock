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
