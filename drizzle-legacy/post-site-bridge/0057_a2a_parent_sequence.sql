ALTER TABLE `agent_delegations` ADD `predecessor_delegation_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_predecessor` ON `agent_delegations` (`predecessor_delegation_id`) WHERE "agent_delegations"."predecessor_delegation_id" IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `a2a_parent_predecessor_guard`
BEFORE INSERT ON `agent_delegations`
WHEN NEW.`predecessor_delegation_id` IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegations` p
    WHERE p.`id` = NEW.`predecessor_delegation_id`
      AND p.`owner_user_id` = NEW.`owner_user_id`
      AND p.`parent_job_id` = NEW.`parent_job_id`
      AND p.`state` = 'remote_completed'
      AND p.`artifacts_captured` = 1
      AND p.`predecessor_delegation_id` IS NULL
  ) THEN RAISE(ABORT, 'A2A_PARENT_PREDECESSOR_NOT_REVIEWABLE') END;
END;
