CREATE TABLE `esim_provider_profile_bindings` (
	`profile_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`sky_order_id` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "esim_profile_binding_provider_check" CHECK("esim_provider_profile_bindings"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_profile_binding_digest_check" CHECK(length("esim_provider_profile_bindings"."profile_digest") = 64),
	CONSTRAINT "esim_profile_binding_manifest_check" CHECK(length("esim_provider_profile_bindings"."manifest_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_profile_binding_order` ON `esim_provider_profile_bindings` (`provider`,`sky_order_id`);--> statement-breakpoint
CREATE INDEX `idx_esim_profile_binding_owner` ON `esim_provider_profile_bindings` (`owner_user_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_esim_provider_webhook_inbox` (
	`callback_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL,
	`state` text NOT NULL,
	`profile_digest` text,
	`owner_user_id` text,
	`sky_order_id` text,
	CONSTRAINT "esim_webhook_provider_check" CHECK("__new_esim_provider_webhook_inbox"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_webhook_state_check" CHECK("__new_esim_provider_webhook_inbox"."state" IN ('received', 'reconciliation_required')),
	CONSTRAINT "esim_webhook_digest_check" CHECK(length("__new_esim_provider_webhook_inbox"."callback_digest") = 64),
	CONSTRAINT "esim_webhook_profile_digest_check" CHECK("__new_esim_provider_webhook_inbox"."profile_digest" IS NULL OR length("__new_esim_provider_webhook_inbox"."profile_digest") = 64),
	CONSTRAINT "esim_webhook_owner_order_pair_check" CHECK(("__new_esim_provider_webhook_inbox"."owner_user_id" IS NULL) = ("__new_esim_provider_webhook_inbox"."sky_order_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_esim_provider_webhook_inbox`("callback_digest", "provider", "event_type", "received_at", "state", "profile_digest", "owner_user_id", "sky_order_id") SELECT "callback_digest", "provider", "event_type", "received_at", "state", NULL, NULL, NULL FROM `esim_provider_webhook_inbox`;--> statement-breakpoint
DROP TABLE `esim_provider_webhook_inbox`;--> statement-breakpoint
ALTER TABLE `__new_esim_provider_webhook_inbox` RENAME TO `esim_provider_webhook_inbox`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_state_received` ON `esim_provider_webhook_inbox` (`state`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_order` ON `esim_provider_webhook_inbox` (`sky_order_id`,`received_at`);
