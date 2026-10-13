CREATE TABLE `csv_delivery_links` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`last_accessed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_delivery_link_token` ON `csv_delivery_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_csv_delivery_link_job` ON `csv_delivery_links` (`user_id`,`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `csv_delivery_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`specification_json` text NOT NULL,
	`result_key` text NOT NULL,
	`safe_result_key` text,
	`report_json_key` text NOT NULL,
	`report_html_key` text NOT NULL,
	`output_sha256` text NOT NULL,
	`validation_json` text NOT NULL,
	`status` text NOT NULL,
	`customer_reason` text,
	`delivered_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_delivery_job_revision` ON `csv_delivery_revisions` (`job_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `idx_csv_delivery_user_job` ON `csv_delivery_revisions` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `csv_monthly_fee_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text DEFAULT 'platform-owner' NOT NULL,
	`billing_account_id` text NOT NULL,
	`contract_id` text DEFAULT 'csv-seller-fee/1' NOT NULL,
	`policy_version` text DEFAULT 'csv-seller-fee/1' NOT NULL,
	`month_jst` text NOT NULL,
	`verified_net_usd_minor` integer NOT NULL,
	`fee_due_usd_minor` integer NOT NULL,
	`status` text NOT NULL,
	`evidence_digest` text NOT NULL,
	`reason` text DEFAULT 'reconciled' NOT NULL,
	`decision_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_fee_decision_account_month` ON `csv_monthly_fee_decisions` (`billing_account_id`,`month_jst`);--> statement-breakpoint
CREATE INDEX `idx_csv_fee_month_status` ON `csv_monthly_fee_decisions` (`month_jst`,`status`);--> statement-breakpoint
CREATE TABLE `csv_operator_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_hash` text NOT NULL,
	`action` text NOT NULL,
	`job_id` text,
	`detail_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_csv_operator_events_created` ON `csv_operator_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_csv_operator_events_job` ON `csv_operator_events` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `csv_operator_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`accepting_new` integer DEFAULT true NOT NULL,
	`paused_reason` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `csv_payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`related_provider_event_id` text,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`evidence_digest` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_payment_provider_event` ON `csv_payment_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_csv_payment_job` ON `csv_payment_events` (`job_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_csv_payment_user` ON `csv_payment_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_csv_payment_seller` ON `csv_payment_events` (`seller_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `product_version` text DEFAULT 'catalog-csv-clean@0.1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `seller_id` text DEFAULT 'platform-owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `channel` text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `terms_version` text DEFAULT 'csv-business-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `available_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `lease_id` text;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `lease_expires_at` integer;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `delivery_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `revision_requested_at` integer;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `revision_reason` text;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `canceled_at` integer;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `cancellation_reason` text;--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD `files_purged_at` integer;--> statement-breakpoint
CREATE INDEX `idx_csv_jobs_queue` ON `csv_jobs` (`status`,`available_at`,`lease_expires_at`);