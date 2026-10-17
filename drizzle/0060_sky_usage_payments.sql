CREATE TABLE `sky_usage_payments` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `source_id` text NOT NULL REFERENCES remote_ai_text_executions(id),
  `source_digest` text NOT NULL,
  `amount_minor` integer NOT NULL,
  `currency` text NOT NULL,
  `mode` text NOT NULL,
  `state` text NOT NULL DEFAULT 'pending',
  `session_id` text,
  `payment_intent_id` text,
  `refunded_minor` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK (mode IN ('test','live')),
  CHECK (currency IN ('jpy','usd') AND amount_minor BETWEEN 50 AND 99999999),
  CHECK (refunded_minor BETWEEN 0 AND amount_minor),
  CHECK (state IN ('pending','paid','expired','refunded','partially_refunded','disputed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_sky_usage_source_mode ON sky_usage_payments(source_id,mode);
CREATE UNIQUE INDEX idx_sky_usage_session ON sky_usage_payments(session_id);
CREATE UNIQUE INDEX idx_sky_usage_intent ON sky_usage_payments(payment_intent_id);
CREATE INDEX idx_sky_usage_owner ON sky_usage_payments(owner_user_id,created_at);
--> statement-breakpoint
CREATE TRIGGER sky_usage_payment_source BEFORE INSERT ON sky_usage_payments
BEGIN
  SELECT CASE WHEN NEW.state!='pending' OR NEW.session_id IS NOT NULL OR NEW.payment_intent_id IS NOT NULL
    OR NEW.refunded_minor!=0 OR NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e
      WHERE e.id=NEW.source_id AND e.owner_user_id=NEW.owner_user_id AND e.state='completed'
      AND e.settled_minor=NEW.amount_minor AND lower(e.currency)=NEW.currency
      AND e.settled_minor<=e.approved_cap_minor AND e.provider_response_id IS NOT NULL)
    THEN RAISE(ABORT,'USAGE_PAYMENT_SOURCE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_usage_payment_immutable BEFORE UPDATE ON sky_usage_payments
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.owner_user_id IS NOT OLD.owner_user_id
    OR NEW.source_id IS NOT OLD.source_id OR NEW.source_digest IS NOT OLD.source_digest
    OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency
    OR NEW.mode IS NOT OLD.mode OR NEW.created_at IS NOT OLD.created_at
    OR (OLD.session_id IS NOT NULL AND NEW.session_id IS NOT OLD.session_id)
    OR (OLD.payment_intent_id IS NOT NULL AND NEW.payment_intent_id IS NOT OLD.payment_intent_id)
    OR NEW.refunded_minor<OLD.refunded_minor
    THEN RAISE(ABORT,'USAGE_PAYMENT_IMMUTABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER sky_usage_payment_no_delete BEFORE DELETE ON sky_usage_payments
BEGIN SELECT RAISE(ABORT,'USAGE_PAYMENT_IMMUTABLE'); END;
