CREATE TABLE `sky_x_feed_state` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text DEFAULT '[]' NOT NULL,
	`remote_user_id` text,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`next_refresh_at` integer DEFAULT 0 NOT NULL,
	`retry_after` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`window_day` text DEFAULT '' NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
