CREATE TABLE `rockstar_account_passwords` (
	`user_id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`salt` text NOT NULL,
	`verifier` text NOT NULL,
	`account_revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rockstar_password_verifier" CHECK(length("rockstar_account_passwords"."verifier") = 64),
	CONSTRAINT "rockstar_password_revision" CHECK("rockstar_account_passwords"."account_revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rockstar_account_passwords_handle_unique` ON `rockstar_account_passwords` (`handle`);--> statement-breakpoint
CREATE TABLE `rockstar_account_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_revision` integer NOT NULL,
	`token_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT "rockstar_account_session_hash" CHECK(length("rockstar_account_sessions"."token_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rockstar_account_sessions_token_sha256_unique` ON `rockstar_account_sessions` (`token_sha256`);--> statement-breakpoint
CREATE INDEX `idx_rockstar_account_session_owner` ON `rockstar_account_sessions` (`user_id`);