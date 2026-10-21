CREATE TABLE `automation_fund_memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`fund_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`joined_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_fund_memberships_fund` ON `automation_fund_memberships` (`fund_id`);--> statement-breakpoint
CREATE TABLE `automation_funds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`strategy` text NOT NULL,
	`target_tool_count` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_funds_user_updated` ON `automation_funds` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_funds_user_idempotency` ON `automation_funds` (`user_id`,`idempotency_key`);