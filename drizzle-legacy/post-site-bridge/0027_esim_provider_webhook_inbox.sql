CREATE TABLE `esim_provider_webhook_inbox` (
	`callback_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_state_received` ON `esim_provider_webhook_inbox` (`state`,`received_at`);