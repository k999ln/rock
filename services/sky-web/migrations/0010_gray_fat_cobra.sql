CREATE TABLE `sky_developer_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`token_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_developer_token_hash` ON `sky_developer_tokens` (`token_sha256`);--> statement-breakpoint
CREATE INDEX `idx_sky_developer_token_owner` ON `sky_developer_tokens` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sky_tool_events` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`installation_id` text NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_tool_events_owner_time` ON `sky_tool_events` (`owner_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_events_package_time` ON `sky_tool_events` (`package_key`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `sky_tool_packages` (
	`package_key` text PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`version` text NOT NULL,
	`user_id` text NOT NULL,
	`manifest` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_tool_id_version` ON `sky_tool_packages` (`tool_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_owner_created` ON `sky_tool_packages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_registry_published` ON `sky_tool_packages` (`status`,`published_at`);