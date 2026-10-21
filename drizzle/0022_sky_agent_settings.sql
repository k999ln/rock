CREATE TABLE `sky_agent_settings` (
	`owner_user_id` text NOT NULL,
	`id` text NOT NULL,
	`source_tool` text,
	`settings` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_agent_settings_owner_id` ON `sky_agent_settings` (`owner_user_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_sky_agent_settings_owner_updated` ON `sky_agent_settings` (`owner_user_id`,`updated_at`);--> statement-breakpoint
