CREATE TABLE `fund_plans` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`transport` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_runs_user_created` ON `tool_runs` (`user_id`,`created_at`);