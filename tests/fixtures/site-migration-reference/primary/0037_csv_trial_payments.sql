CREATE TABLE `csv_trial_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`mode` text NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_trial_session` ON `csv_trial_payments` (`session_id`);