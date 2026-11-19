
CREATE TABLE IF NOT EXISTS `rockstar_account_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`mode` text NOT NULL,
	`binding_sha256` text NOT NULL,
	`origin` text NOT NULL,
	`recovery_sha256` text,
	`expected_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`completion_nonce` text,
	CONSTRAINT "rockstar_account_enrollment_mode" CHECK("rockstar_account_enrollments"."mode" IN ('signup','add','recover','login')),
	CONSTRAINT "rockstar_account_enrollment_binding" CHECK(length("rockstar_account_enrollments"."binding_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_rockstar_account_enrollment_expiry` ON `rockstar_account_enrollments` (`expires_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rockstar_account_rate_limits` (
	`request_key` text NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL,
	PRIMARY KEY(`request_key`, `window`),
	CONSTRAINT "rockstar_account_rate_attempts" CHECK("rockstar_account_rate_limits"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rockstar_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`recovery_sha256` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rockstar_account_recovery_hash" CHECK(length("rockstar_accounts"."recovery_sha256") = 64),
	CONSTRAINT "rockstar_account_revision" CHECK("rockstar_accounts"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `rockstar_accounts_recovery_sha256_unique` ON `rockstar_accounts` (`recovery_sha256`);
