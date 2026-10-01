CREATE TABLE `book_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`source` text NOT NULL,
	`occurred_on` text NOT NULL,
	`reverses_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_book_user_created` ON `book_records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_book_reversal` ON `book_records` (`reverses_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_devices_user_seen` ON `devices` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_job_status` ON `job_events` (`job_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_events_user` ON `job_events` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`transport` text NOT NULL,
	`sample` integer NOT NULL,
	`status` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`output_bytes` integer,
	`duration_ms` integer,
	`error_code` text,
	`device_id` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`deadline` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_user_created` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jobs_one_active_user` ON `jobs` (`user_id`) WHERE "jobs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE TABLE `tool_controls` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_controls_user_tool` ON `tool_controls` (`user_id`,`tool`);