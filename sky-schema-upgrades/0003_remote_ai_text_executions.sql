CREATE TABLE `remote_ai_text_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`model_id` text NOT NULL,
	`card_id` text NOT NULL,
	`rate_card_digest` text NOT NULL,
	`quote_digest` text NOT NULL,
	`approval_digest` text NOT NULL,
	`quote_json` text NOT NULL,
	`rate_card_json` text NOT NULL,
	`currency` text NOT NULL,
	`maximum_charge_minor` integer NOT NULL,
	`approved_cap_minor` integer NOT NULL,
	`parent_budget_limit_minor` integer NOT NULL,
	`save_result` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'quoted' NOT NULL,
	`settled_minor` integer,
	`usage_json` text,
	`observation_json` text,
	`price_json` text,
	`provider_response_id` text,
	`result_text` text,
	`duration_ms` integer,
	`error_code` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "remote_ai_text_budget_check" CHECK("remote_ai_text_executions"."maximum_charge_minor" >= 0 AND "remote_ai_text_executions"."maximum_charge_minor" <= "remote_ai_text_executions"."approved_cap_minor" AND "remote_ai_text_executions"."approved_cap_minor" <= "remote_ai_text_executions"."parent_budget_limit_minor"),
	CONSTRAINT "remote_ai_text_state_check" CHECK("remote_ai_text_executions"."state" IN ('quoted','reserved','sending','completed','unreconciled','cancelled','expired')),
	CONSTRAINT "remote_ai_text_save_check" CHECK("remote_ai_text_executions"."save_result" IN (0,1) AND ("remote_ai_text_executions"."save_result" = 1 OR "remote_ai_text_executions"."result_text" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_owner_request` ON `remote_ai_text_executions` (`owner_user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_quote` ON `remote_ai_text_executions` (`quote_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_response` ON `remote_ai_text_executions` (`provider_response_id`);--> statement-breakpoint
CREATE INDEX `idx_remote_ai_text_owner_parent` ON `remote_ai_text_executions` (`owner_user_id`,`parent_job_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_quote_guard BEFORE INSERT ON remote_ai_text_executions
BEGIN
  SELECT CASE WHEN NEW.state != 'quoted' OR NEW.revision != 0
    OR NEW.settled_minor IS NOT NULL OR NEW.provider_response_id IS NOT NULL
    OR NEW.usage_json IS NOT NULL OR NEW.price_json IS NOT NULL OR NEW.result_text IS NOT NULL
    OR NEW.observation_json IS NOT NULL OR NEW.duration_ms IS NOT NULL OR NEW.error_code IS NOT NULL
    OR NEW.expires_at <= NEW.created_at OR NEW.updated_at != NEW.created_at
    OR NEW.parent_budget_limit_minor > 9007199254740991
    OR NOT json_valid(NEW.quote_json) OR NOT json_valid(NEW.rate_card_json)
    OR json_extract(NEW.quote_json, '$.ownerId') IS NOT NEW.owner_user_id
    OR json_extract(NEW.quote_json, '$.requestId') IS NOT NEW.request_id
    OR json_extract(NEW.quote_json, '$.quoteDigest') IS NOT NEW.quote_digest
    OR json_extract(NEW.quote_json, '$.approvedCapMinor') IS NOT NEW.approved_cap_minor
    OR json_extract(NEW.quote_json, '$.ceiling.maximumChargeMinor') IS NOT NEW.maximum_charge_minor
    OR json_extract(NEW.quote_json, '$.ceiling.rateCardDigest') IS NOT NEW.rate_card_digest
    OR json_extract(NEW.quote_json, '$.ceiling.currency') IS NOT NEW.currency
    OR json_extract(NEW.quote_json, '$.ceiling.modelId') IS NOT NEW.model_id
    OR json_extract(NEW.quote_json, '$.expiresAt') IS NOT NEW.expires_at
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest
      AND c.card_json = NEW.rate_card_json AND c.status = 'active'
      AND c.effective_at <= NEW.created_at AND c.expires_at >= NEW.expires_at)
  THEN RAISE(ABORT, 'REMOTE_AI_TEXT_QUOTE_BINDING') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_terms_frozen BEFORE UPDATE ON remote_ai_text_executions
WHEN NEW.id IS NOT OLD.id OR NEW.owner_user_id IS NOT OLD.owner_user_id
  OR NEW.request_id IS NOT OLD.request_id OR NEW.parent_job_id IS NOT OLD.parent_job_id
  OR NEW.model_id IS NOT OLD.model_id OR NEW.card_id IS NOT OLD.card_id
  OR NEW.rate_card_digest IS NOT OLD.rate_card_digest OR NEW.quote_digest IS NOT OLD.quote_digest
  OR NEW.approval_digest IS NOT OLD.approval_digest OR NEW.quote_json IS NOT OLD.quote_json
  OR NEW.rate_card_json IS NOT OLD.rate_card_json OR NEW.currency IS NOT OLD.currency
  OR NEW.maximum_charge_minor IS NOT OLD.maximum_charge_minor
  OR NEW.approved_cap_minor IS NOT OLD.approved_cap_minor
  OR NEW.parent_budget_limit_minor IS NOT OLD.parent_budget_limit_minor
  OR NEW.save_result IS NOT OLD.save_result OR NEW.created_at IS NOT OLD.created_at
  OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_TERMS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_state_guard BEFORE UPDATE ON remote_ai_text_executions
BEGIN
  SELECT CASE WHEN NEW.revision != OLD.revision + 1 OR NEW.updated_at < OLD.updated_at
    OR NOT (
      (OLD.state = 'quoted' AND NEW.state IN ('reserved','cancelled','expired')) OR
      (OLD.state = 'reserved' AND NEW.state IN ('sending','cancelled','expired')) OR
      (OLD.state = 'sending' AND NEW.state IN ('completed','unreconciled')) OR
      (OLD.state = 'unreconciled' AND NEW.state = 'completed') OR
      (OLD.state = 'completed' AND NEW.state = 'completed'
        AND OLD.result_text IS NOT NULL AND NEW.result_text IS NULL
        AND NEW.settled_minor IS OLD.settled_minor AND NEW.usage_json IS OLD.usage_json
        AND NEW.price_json IS OLD.price_json AND NEW.provider_response_id IS OLD.provider_response_id
        AND NEW.observation_json IS OLD.observation_json
        AND NEW.duration_ms IS OLD.duration_ms AND NEW.error_code IS OLD.error_code)
    ) THEN RAISE(ABORT, 'REMOTE_AI_TEXT_STATE_TRANSITION') END;
  SELECT CASE WHEN NEW.state NOT IN ('completed')
    AND (NEW.settled_minor IS NOT NULL OR NEW.provider_response_id IS NOT NULL
      OR NEW.usage_json IS NOT NULL OR NEW.price_json IS NOT NULL OR NEW.result_text IS NOT NULL)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_UNCONFIRMED_COST') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_reserve_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'quoted' AND NEW.state = 'reserved'
BEGIN
  SELECT CASE WHEN NEW.updated_at >= NEW.expires_at
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest AND c.status = 'active'
      AND c.effective_at <= NEW.updated_at AND c.expires_at > NEW.updated_at)
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.budget_limit_minor = NEW.parent_budget_limit_minor
        AND p.reserved_minor >= 0 AND p.settled_minor >= 0
        AND p.reserved_minor + p.settled_minor + NEW.maximum_charge_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_BUDGET_OR_QUOTE_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_reserve AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'quoted' AND NEW.state = 'reserved'
BEGIN
  UPDATE agent_delegation_budget_pools
    SET reserved_minor = reserved_minor + NEW.maximum_charge_minor,
        revision = revision + 1, updated_at = NEW.updated_at
    WHERE owner_user_id = NEW.owner_user_id AND parent_job_id = NEW.parent_job_id;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_dispatch_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state = 'sending'
BEGIN
  SELECT CASE WHEN NEW.updated_at >= NEW.expires_at
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest AND c.status = 'active'
      AND c.expires_at > NEW.updated_at)
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.reserved_minor >= NEW.maximum_charge_minor
        AND p.reserved_minor + p.settled_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_DISPATCH_PREFLIGHT') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_release AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state IN ('cancelled','expired')
BEGIN
  UPDATE agent_delegation_budget_pools
    SET reserved_minor = reserved_minor - OLD.maximum_charge_minor,
        revision = revision + 1, updated_at = NEW.updated_at
    WHERE owner_user_id = OLD.owner_user_id AND parent_job_id = OLD.parent_job_id;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_release_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state IN ('cancelled','expired')
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
    WHERE p.owner_user_id = OLD.owner_user_id AND p.parent_job_id = OLD.parent_job_id
      AND p.currency = OLD.currency AND p.reserved_minor >= OLD.maximum_charge_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_RELEASE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_usage_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state IN ('sending','unreconciled') AND NEW.state = 'completed'
BEGIN
  SELECT CASE WHEN NEW.settled_minor IS NULL OR NEW.settled_minor < 0
    OR NEW.settled_minor > OLD.maximum_charge_minor OR NEW.duration_ms IS NULL OR NEW.duration_ms < 0
    OR NEW.provider_response_id IS NULL OR NEW.usage_json IS NULL OR NEW.price_json IS NULL
    OR NOT json_valid(NEW.usage_json) OR NOT json_valid(NEW.price_json)
    OR json_extract(NEW.price_json, '$.status') IS NOT 'priced'
    OR json_extract(NEW.price_json, '$.chargeMinor') IS NOT NEW.settled_minor
    OR json_extract(NEW.price_json, '$.providerResponseId') IS NOT NEW.provider_response_id
    OR json_extract(NEW.price_json, '$.currency') IS NOT NEW.currency
    OR json_extract(NEW.price_json, '$.rateCardDigest') IS NOT NEW.rate_card_digest
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.reserved_minor >= OLD.maximum_charge_minor
        AND p.reserved_minor - OLD.maximum_charge_minor + p.settled_minor + NEW.settled_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_USAGE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_settle AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state IN ('sending','unreconciled') AND NEW.state = 'completed'
BEGIN
  UPDATE agent_delegation_budget_pools
    SET reserved_minor = reserved_minor - OLD.maximum_charge_minor,
        settled_minor = settled_minor + NEW.settled_minor,
        revision = revision + 1, updated_at = NEW.updated_at
    WHERE owner_user_id = OLD.owner_user_id AND parent_job_id = OLD.parent_job_id;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_no_delete BEFORE DELETE ON remote_ai_text_executions
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_AUDIT_RECORD_IMMUTABLE'); END;
