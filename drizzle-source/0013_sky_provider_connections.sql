CREATE TABLE `sky_provider_connections` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'setup_required' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`secret_ref` text,
	`connected_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_provider_connections_user_provider` ON `sky_provider_connections` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_sky_provider_connections_user_updated` ON `sky_provider_connections` (`user_id`,`updated_at`);