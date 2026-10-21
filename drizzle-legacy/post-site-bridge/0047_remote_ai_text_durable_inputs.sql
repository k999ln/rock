CREATE TABLE `remote_ai_text_inputs` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`input_sha256` text NOT NULL,
	`key_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `remote_ai_text_executions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "remote_ai_text_input_digest_check" CHECK(length("remote_ai_text_inputs"."input_sha256") = 64),
	CONSTRAINT "remote_ai_text_input_key_version_check" CHECK("remote_ai_text_inputs"."key_version" = 'aes-256-gcm-v1')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_input_owner_execution` ON `remote_ai_text_inputs` (`owner_user_id`,`execution_id`);--> statement-breakpoint
CREATE TABLE `remote_ai_text_send_claims` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`claimed_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `remote_ai_text_executions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_send_claim_owner_execution` ON `remote_ai_text_send_claims` (`owner_user_id`,`execution_id`);
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_input_relation_guard BEFORE INSERT ON remote_ai_text_inputs
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e
    WHERE e.id = NEW.execution_id AND e.owner_user_id = NEW.owner_user_id
      AND e.state = 'reserved' AND e.expires_at + 86400000 = NEW.expires_at)
    OR length(NEW.nonce) > 64 OR length(NEW.ciphertext) > 80000
    OR NEW.created_at >= NEW.expires_at
  THEN RAISE(ABORT, 'REMOTE_AI_TEXT_INPUT_BINDING') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_input_no_update BEFORE UPDATE ON remote_ai_text_inputs
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_INPUT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_input_delete_guard BEFORE DELETE ON remote_ai_text_inputs
WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e WHERE e.id = OLD.execution_id
  AND e.owner_user_id = OLD.owner_user_id AND e.state IN ('completed','unreconciled','cancelled','expired'))
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_INPUT_DELETE_BEFORE_TERMINAL'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_send_claim_binding_guard BEFORE INSERT ON remote_ai_text_send_claims
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e
    WHERE e.id = NEW.execution_id AND e.owner_user_id = NEW.owner_user_id AND e.state = 'sending')
  THEN RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_BINDING') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_send_claim_no_update BEFORE UPDATE ON remote_ai_text_send_claims
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_send_claim_no_delete BEFORE DELETE ON remote_ai_text_send_claims
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_IMMUTABLE'); END;
--> statement-breakpoint
DROP TRIGGER remote_ai_text_dispatch_guard;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_dispatch_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state = 'sending'
BEGIN
  SELECT CASE WHEN NEW.updated_at > OLD.expires_at + 86400000
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest AND c.status = 'active'
      AND c.effective_at <= NEW.updated_at AND c.expires_at > NEW.updated_at)
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.reserved_minor >= NEW.maximum_charge_minor
        AND p.reserved_minor + p.settled_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_DISPATCH_PREFLIGHT') END;
END;
