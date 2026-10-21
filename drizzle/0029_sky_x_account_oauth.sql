CREATE TABLE `sky_x_accounts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`remote_id` text,
	`username` text,
	`display_name` text,
	`tokens` text,
	`cache` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`next_refresh_at` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`window_day` text DEFAULT '' NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
--> statement-breakpoint
CREATE TABLE `sky_x_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`cookie_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`account_revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sky_x_oauth_owner_expiry` ON `sky_x_oauth_states` (`owner_id`,`expires_at`);