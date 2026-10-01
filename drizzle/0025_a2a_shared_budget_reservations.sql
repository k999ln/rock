CREATE TABLE `agent_delegation_budget_pools` (
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`currency` text NOT NULL,
	`budget_limit_minor` integer NOT NULL,
	`reserved_minor` integer DEFAULT 0 NOT NULL,
	`settled_minor` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_budget_pool_owner_parent` ON `agent_delegation_budget_pools` (`owner_user_id`,`parent_job_id`);--> statement-breakpoint
CREATE TABLE `agent_delegation_budget_reservations` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`currency` text NOT NULL,
	`reserved_minor` integer NOT NULL,
	`settled_minor` integer,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_a2a_budget_reservation_parent` ON `agent_delegation_budget_reservations` (`owner_user_id`,`parent_job_id`,`state`);--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD `parent_budget_limit_minor` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_before_insert`
BEFORE INSERT ON `agent_delegation_budget_reservations`
WHEN NEW.`state` = 'held'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegation_budget_pools` p
    WHERE p.`owner_user_id` = NEW.`owner_user_id`
      AND p.`parent_job_id` = NEW.`parent_job_id`
      AND p.`currency` = NEW.`currency`
  ) THEN RAISE(ABORT, 'A2A_PARENT_BUDGET_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegation_budget_pools` p
    WHERE p.`owner_user_id` = NEW.`owner_user_id`
      AND p.`parent_job_id` = NEW.`parent_job_id`
      AND p.`currency` = NEW.`currency`
      AND p.`reserved_minor` + p.`settled_minor` + NEW.`reserved_minor` <= p.`budget_limit_minor`
  ) THEN RAISE(ABORT, 'A2A_PARENT_BUDGET_EXCEEDED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_after_insert`
AFTER INSERT ON `agent_delegation_budget_reservations`
WHEN NEW.`state` = 'held'
BEGIN
  UPDATE `agent_delegation_budget_pools`
  SET `reserved_minor` = `reserved_minor` + NEW.`reserved_minor`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `owner_user_id` = NEW.`owner_user_id`
    AND `parent_job_id` = NEW.`parent_job_id`
    AND `currency` = NEW.`currency`;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_release`
AFTER UPDATE OF `state` ON `agent_delegation_budget_reservations`
WHEN OLD.`state` = 'held' AND NEW.`state` = 'released'
BEGIN
  UPDATE `agent_delegation_budget_pools`
  SET `reserved_minor` = `reserved_minor` - OLD.`reserved_minor`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `owner_user_id` = OLD.`owner_user_id`
    AND `parent_job_id` = OLD.`parent_job_id`
    AND `currency` = OLD.`currency`
    AND `reserved_minor` >= OLD.`reserved_minor`;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_release_before_external_send`
AFTER UPDATE OF `state` ON `agent_delegations`
WHEN NEW.`state` IN ('cancelled_before_dispatch', 'expired')
  OR (NEW.`state` = 'remote_failed' AND NEW.`remote_state` = 'PREFLIGHT_FAILED_BEFORE_SEND')
BEGIN
  UPDATE `agent_delegation_budget_reservations`
  SET `state` = 'released', `updated_at` = NEW.`updated_at`
  WHERE `delegation_id` = NEW.`id`
    AND `owner_user_id` = NEW.`owner_user_id`
    AND `state` = 'held';
END;
