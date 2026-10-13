CREATE TABLE `csv_billing_account_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`billing_account_id` text NOT NULL,
	`action` text NOT NULL,
	`request_digest` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_billing_event_idempotency` ON `csv_billing_account_events` (`billing_account_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_csv_billing_event_user` ON `csv_billing_account_events` (`user_id`,`created_at`);