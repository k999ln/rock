CREATE TABLE IF NOT EXISTS `sky_hosted_monthly_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`invoice_id` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_hosted_monthly_tests` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`contract_id` text NOT NULL,
	`old_contract_json` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`phase` text DEFAULT 'migrating' NOT NULL,
	`fixture_minor` integer DEFAULT 0 NOT NULL,
	`customer_id` text,
	`fail_method_id` text,
	`good_method_id` text,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sky_hosted_fixture" CHECK("sky_hosted_monthly_tests"."fixture_minor" IN (0,10000)),
	CONSTRAINT "sky_hosted_phase" CHECK("sky_hosted_monthly_tests"."phase" IN ('migrating','active','capped','unpaid','restored'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sky_hosted_monthly_tests_id_unique` ON `sky_hosted_monthly_tests` (`id`);
