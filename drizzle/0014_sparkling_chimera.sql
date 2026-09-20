CREATE TABLE `sky_activation_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`code_sha256` text NOT NULL,
	`max_uses` integer NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_activation_code_hash` ON `sky_activation_codes` (`code_sha256`);--> statement-breakpoint
CREATE INDEX `idx_sky_activation_owner_created` ON `sky_activation_codes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_activation_package_status` ON `sky_activation_codes` (`package_key`,`status`);--> statement-breakpoint
CREATE TABLE `sky_tool_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`activation_code_id` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`telegram_chat_id` text NOT NULL,
	`bot_username` text,
	`status` text DEFAULT 'active' NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_grant_package_telegram` ON `sky_tool_grants` (`package_key`,`telegram_user_id`);--> statement-breakpoint
CREATE INDEX `idx_sky_grant_telegram_status` ON `sky_tool_grants` (`telegram_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sky_grant_code` ON `sky_tool_grants` (`activation_code_id`);