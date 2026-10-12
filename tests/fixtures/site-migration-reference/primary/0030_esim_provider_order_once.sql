CREATE TABLE `esim_provider_orders` (
	`sky_order_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`provider_bundle_name` text NOT NULL,
	`quote_digest` text NOT NULL,
	`quote_total` text NOT NULL,
	`quote_currency` text NOT NULL,
	`state` text NOT NULL,
	`provider_order_reference` text,
	`profile_digest` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "esim_provider_orders_provider_check" CHECK("esim_provider_orders"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_provider_orders_manifest_check" CHECK(length("esim_provider_orders"."manifest_sha256") = 64),
	CONSTRAINT "esim_provider_orders_quote_check" CHECK(length("esim_provider_orders"."quote_digest") = 64),
	CONSTRAINT "esim_provider_orders_state_check" CHECK("esim_provider_orders"."state" IN ('dispatch_started', 'reconciliation_required', 'provider_completed', 'profile_bound')),
	CONSTRAINT "esim_provider_orders_profile_digest_check" CHECK("esim_provider_orders"."profile_digest" IS NULL OR length("esim_provider_orders"."profile_digest") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_provider_order_reference` ON `esim_provider_orders` (`provider`,`provider_order_reference`);--> statement-breakpoint
CREATE INDEX `idx_esim_provider_orders_owner` ON `esim_provider_orders` (`owner_user_id`,`updated_at`);