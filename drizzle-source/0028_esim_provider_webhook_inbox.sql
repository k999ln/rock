PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_esim_provider_webhook_inbox` (
	`callback_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL,
	`state` text NOT NULL,
	CONSTRAINT "esim_webhook_provider_check" CHECK("__new_esim_provider_webhook_inbox"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_webhook_state_check" CHECK("__new_esim_provider_webhook_inbox"."state" IN ('received', 'reconciliation_required')),
	CONSTRAINT "esim_webhook_digest_check" CHECK(length("__new_esim_provider_webhook_inbox"."callback_digest") = 64)
);
--> statement-breakpoint
INSERT INTO `__new_esim_provider_webhook_inbox`("callback_digest", "provider", "event_type", "received_at", "state") SELECT "callback_digest", "provider", "event_type", "received_at", "state" FROM `esim_provider_webhook_inbox`;--> statement-breakpoint
DROP TABLE `esim_provider_webhook_inbox`;--> statement-breakpoint
ALTER TABLE `__new_esim_provider_webhook_inbox` RENAME TO `esim_provider_webhook_inbox`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_state_received` ON `esim_provider_webhook_inbox` (`state`,`received_at`);