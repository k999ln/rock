CREATE TABLE `a2a_usage_receipts` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_reference` text NOT NULL,
	`receipt_json` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL CHECK (`amount_minor` >= 0),
	`issued_at` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_usage_provider_reference` ON `a2a_usage_receipts` (`provider_id`,`provider_reference`);--> statement-breakpoint
CREATE INDEX `idx_a2a_usage_owner_parent` ON `a2a_usage_receipts` (`owner_user_id`,`parent_job_id`,`received_at`);
--> statement-breakpoint
CREATE TRIGGER `a2a_usage_receipt_immutable_update`
BEFORE UPDATE ON `a2a_usage_receipts`
BEGIN
  SELECT RAISE(ABORT, 'A2A_USAGE_RECEIPT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_usage_receipt_immutable_delete`
BEFORE DELETE ON `a2a_usage_receipts`
BEGIN
  SELECT RAISE(ABORT, 'A2A_USAGE_RECEIPT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_settlement_before_update`
BEFORE UPDATE OF `state` ON `agent_delegation_budget_reservations`
WHEN OLD.`state` = 'held' AND NEW.`state` = 'settled'
BEGIN
  SELECT CASE WHEN NEW.`settled_minor` IS NULL
    OR NEW.`settled_minor` < 0
    OR NEW.`settled_minor` > OLD.`reserved_minor`
    OR NOT EXISTS (
      SELECT 1 FROM `agent_delegation_budget_pools` p
      WHERE p.`owner_user_id` = OLD.`owner_user_id`
        AND p.`parent_job_id` = OLD.`parent_job_id`
        AND p.`currency` = OLD.`currency`
        AND p.`reserved_minor` >= OLD.`reserved_minor`
        AND p.`reserved_minor` - OLD.`reserved_minor` + p.`settled_minor` + NEW.`settled_minor` <= p.`budget_limit_minor`
    )
  THEN RAISE(ABORT, 'A2A_USAGE_SETTLEMENT_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `a2a_usage_receipts` r
    WHERE r.`delegation_id` = OLD.`delegation_id`
      AND r.`owner_user_id` = OLD.`owner_user_id`
      AND r.`parent_job_id` = OLD.`parent_job_id`
      AND r.`currency` = OLD.`currency`
      AND r.`amount_minor` = NEW.`settled_minor`
  ) THEN RAISE(ABORT, 'A2A_USAGE_RECEIPT_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_settlement_after_update`
AFTER UPDATE OF `state` ON `agent_delegation_budget_reservations`
WHEN OLD.`state` = 'held' AND NEW.`state` = 'settled'
BEGIN
  UPDATE `agent_delegation_budget_pools`
  SET `reserved_minor` = `reserved_minor` - OLD.`reserved_minor`,
      `settled_minor` = `settled_minor` + NEW.`settled_minor`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `owner_user_id` = OLD.`owner_user_id`
    AND `parent_job_id` = OLD.`parent_job_id`
    AND `currency` = OLD.`currency`;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_terminal_frozen`
BEFORE UPDATE ON `agent_delegation_budget_reservations`
WHEN OLD.`state` IN ('released', 'settled')
  AND (NEW.`state` != OLD.`state`
    OR NEW.`settled_minor` IS NOT OLD.`settled_minor`
    OR NEW.`reserved_minor` != OLD.`reserved_minor`
    OR NEW.`currency` != OLD.`currency`
    OR NEW.`owner_user_id` != OLD.`owner_user_id`
    OR NEW.`parent_job_id` != OLD.`parent_job_id`
    OR NEW.`created_at` != OLD.`created_at`)
BEGIN
  SELECT RAISE(ABORT, 'A2A_BUDGET_RESERVATION_TERMINAL_FROZEN');
END;
