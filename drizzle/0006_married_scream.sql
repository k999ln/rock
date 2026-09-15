CREATE TABLE `sky_connections` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`scope` text DEFAULT 'execute' NOT NULL,
	`consent_version` text NOT NULL,
	`connected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_connections_user_tool` ON `sky_connections` (`user_id`,`tool`);--> statement-breakpoint
CREATE INDEX `idx_sky_connections_user_connected` ON `sky_connections` (`user_id`,`connected_at`);