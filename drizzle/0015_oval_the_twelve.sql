CREATE TABLE `remote_ai_rate_limits` (
	`user_id` text NOT NULL,
	`route` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_rate_limits_user_route` ON `remote_ai_rate_limits` (`user_id`,`route`);--> statement-breakpoint
CREATE INDEX `idx_remote_ai_rate_limits_window` ON `remote_ai_rate_limits` (`window_started_at`);