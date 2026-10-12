-- Store signed cumulative provider-meter snapshots without treating them as
-- final charges. A final receipt must reconcile the latest snapshot.
CREATE TABLE `a2a_live_usage_snapshots` (
  `delegation_id` text NOT NULL,
  `sequence` integer NOT NULL CHECK (`sequence` > 0),
  `owner_user_id` text NOT NULL,
  `parent_job_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `provider_event_id` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `currency` text NOT NULL,
  `cumulative_amount_minor` integer NOT NULL CHECK (`cumulative_amount_minor` >= 0),
  `pricing_version` text NOT NULL,
  `issued_at` integer NOT NULL,
  `received_at` integer NOT NULL,
  PRIMARY KEY (`delegation_id`, `sequence`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_live_usage_event` ON `a2a_live_usage_snapshots` (`provider_id`,`provider_event_id`);
--> statement-breakpoint
CREATE INDEX `idx_a2a_live_usage_owner_parent` ON `a2a_live_usage_snapshots` (`owner_user_id`,`parent_job_id`,`delegation_id`,`sequence`);
--> statement-breakpoint
CREATE TRIGGER `a2a_live_usage_snapshot_before_insert`
BEFORE INSERT ON `a2a_live_usage_snapshots`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegations` d
    JOIN `agent_delegation_budget_reservations` r
      ON r.`owner_user_id` = d.`owner_user_id` AND r.`delegation_id` = d.`id`
    WHERE d.`id` = NEW.`delegation_id` AND d.`owner_user_id` = NEW.`owner_user_id`
      AND d.`parent_job_id` = NEW.`parent_job_id` AND d.`remote_task_id` IS NOT NULL
      AND d.`state` IN ('submitted','working','awaiting_remote_input','cancel_requested','cancel_submitting','cancel_unconfirmed')
      AND r.`state` = 'held' AND r.`currency` = NEW.`currency`
      AND NEW.`cumulative_amount_minor` <= r.`reserved_minor`
  ) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_RESERVATION_INVALID') END;
  SELECT CASE WHEN NEW.`sequence` != COALESCE((
    SELECT MAX(`sequence`) + 1 FROM `a2a_live_usage_snapshots`
    WHERE `delegation_id` = NEW.`delegation_id`
  ), 1) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_SEQUENCE_INVALID') END;
  SELECT CASE WHEN NEW.`cumulative_amount_minor` < COALESCE((
    SELECT `cumulative_amount_minor` FROM `a2a_live_usage_snapshots`
    WHERE `delegation_id` = NEW.`delegation_id` ORDER BY `sequence` DESC LIMIT 1
  ), 0) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_AMOUNT_DECREASED') END;
  SELECT CASE WHEN NEW.`issued_at` <= COALESCE((
    SELECT `issued_at` FROM `a2a_live_usage_snapshots`
    WHERE `delegation_id` = NEW.`delegation_id` ORDER BY `sequence` DESC LIMIT 1
  ), 0) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_TIME_NOT_MONOTONIC') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_live_usage_snapshot_immutable_update`
BEFORE UPDATE ON `a2a_live_usage_snapshots`
BEGIN SELECT RAISE(ABORT, 'A2A_LIVE_USAGE_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `a2a_live_usage_snapshot_immutable_delete`
BEFORE DELETE ON `a2a_live_usage_snapshots`
BEGIN SELECT RAISE(ABORT, 'A2A_LIVE_USAGE_SNAPSHOT_IMMUTABLE'); END;
