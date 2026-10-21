-- Recovery guard for the canonical main D1.
--
-- A previously failed Sites deployment recorded the earlier migration number
-- after applying only part of its statements. Use a new append-only migration
-- number so the missing exactly-once send-claim ledger is guaranteed to exist.
CREATE TABLE IF NOT EXISTS `remote_ai_text_send_claims` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`claimed_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `remote_ai_text_executions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_remote_ai_text_send_claim_owner_execution` ON `remote_ai_text_send_claims` (`owner_user_id`,`execution_id`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS remote_ai_text_send_claim_binding_guard BEFORE INSERT ON remote_ai_text_send_claims BEGIN SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e WHERE e.id = NEW.execution_id AND e.owner_user_id = NEW.owner_user_id AND e.state = 'sending') THEN RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_BINDING') END); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS remote_ai_text_send_claim_no_delete BEFORE DELETE ON remote_ai_text_send_claims BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS remote_ai_text_send_claim_no_update BEFORE UPDATE ON remote_ai_text_send_claims BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS sky_recurring_llm_send BEFORE INSERT ON remote_ai_text_send_claims WHEN (1) AND EXISTS(SELECT 1 FROM sky_recurring_contracts WHERE owner_id=NEW.owner_user_id) BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sky_recurring_contracts c WHERE c.owner_id=NEW.owner_user_id AND c.status='active' AND c.access_until>NEW.claimed_at AND c.period_start<=NEW.claimed_at AND c.period_end>NEW.claimed_at) THEN RAISE(ABORT,'SKY_RECURRING_ACCESS_BLOCKED') END;
END;
