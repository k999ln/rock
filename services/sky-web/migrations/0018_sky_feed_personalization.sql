CREATE TABLE `sky_feed_history_events` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`tool` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`dwell_ms` integer,
	`position` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sky_feed_history_owner_time` ON `sky_feed_history_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_feed_history_owner_tool` ON `sky_feed_history_events` (`user_id`,`tool`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `sky_feed_personalization_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`consent_version` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`updated_at` integer NOT NULL
);
