CREATE TABLE `csv_intake_controls` (
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`accepting_new` integer DEFAULT true NOT NULL,
	`paused_reason` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_intake_control_scope` ON `csv_intake_controls` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE TABLE `csv_job_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`category` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`evidence_digest` text NOT NULL,
	`actor_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_job_cost_idempotency` ON `csv_job_costs` (`actor_hash`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_csv_job_cost_job` ON `csv_job_costs` (`job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_csv_job_cost_user` ON `csv_job_costs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `csv_operator_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`action` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`delivered_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_operator_outbox_action` ON `csv_operator_outbox` (`actor_hash`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_csv_operator_outbox_created` ON `csv_operator_outbox` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_csv_monthly_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`month_jst` text NOT NULL,
	`verified_net_usd_minor` integer,
	`fee_due_usd_minor` integer,
	`status` text NOT NULL,
	`provider_evidence` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_csv_monthly_fees`("id", "billing_account_id", "month_jst", "verified_net_usd_minor", "fee_due_usd_minor", "status", "provider_evidence", "created_at", "updated_at") SELECT "id", "billing_account_id", "month_jst", "verified_net_usd_minor", "fee_due_usd_minor", "status", "provider_evidence", "created_at", "updated_at" FROM `csv_monthly_fees`;--> statement-breakpoint
DROP TABLE `csv_monthly_fees`;--> statement-breakpoint
ALTER TABLE `__new_csv_monthly_fees` RENAME TO `csv_monthly_fees`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_fee_account_month` ON `csv_monthly_fees` (`billing_account_id`,`month_jst`);--> statement-breakpoint
ALTER TABLE `csv_billing_accounts` ADD `cancel_at_month` text;--> statement-breakpoint
ALTER TABLE `csv_operator_events` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `csv_operator_events` ADD `request_digest` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_operator_events_idempotency` ON `csv_operator_events` (`actor_hash`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `csv_payment_events` ADD `related_event_type` text;