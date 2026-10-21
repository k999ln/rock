CREATE TABLE `rockstar_device_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_code_sha256` text NOT NULL,
	`device_code_sha256` text NOT NULL,
	`client_name` text NOT NULL,
	`status` text NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_polled_at` integer,
	`approved_at` integer,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_device_auth_user_code` ON `rockstar_device_authorizations` (`user_code_sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_device_auth_device_code` ON `rockstar_device_authorizations` (`device_code_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_device_auth_expiry` ON `rockstar_device_authorizations` (`status`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `rockstar_device_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_name` text NOT NULL,
	`token_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_device_session_token` ON `rockstar_device_sessions` (`token_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_device_session_owner` ON `rockstar_device_sessions` (`user_id`,`revoked_at`,`expires_at`);
