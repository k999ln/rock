CREATE TABLE `csv_billing_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `csv_job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`event` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_csv_events_job` ON `csv_job_events` (`job_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_csv_events_user` ON `csv_job_events` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `csv_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`payment_status` text NOT NULL,
	`payment_method` text,
	`payment_reference` text,
	`input_name` text NOT NULL,
	`input_key` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`input_sha256` text NOT NULL,
	`input_encoding` text NOT NULL,
	`specification_json` text NOT NULL,
	`quote_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`result_key` text,
	`safe_result_key` text,
	`report_json_key` text,
	`report_html_key` text,
	`output_sha256` text,
	`validation_json` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`accepted_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_csv_jobs_user_updated` ON `csv_jobs` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_csv_jobs_status_updated` ON `csv_jobs` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_jobs_input_key` ON `csv_jobs` (`input_key`);--> statement-breakpoint
CREATE TABLE `csv_monthly_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`month_jst` text NOT NULL,
	`verified_net_usd_minor` integer NOT NULL,
	`fee_due_usd_minor` integer NOT NULL,
	`status` text NOT NULL,
	`provider_evidence` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_fee_account_month` ON `csv_monthly_fees` (`billing_account_id`,`month_jst`);