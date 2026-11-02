CREATE TABLE `sky_hub_plugins` (
	`owner_user_id` text NOT NULL,
	`plugin_key` text NOT NULL,
	`kind` text NOT NULL,
	`resource` text NOT NULL,
	`enabled` integer NOT NULL,
	`revision` integer NOT NULL,
	`metadata` text NOT NULL,
	`consent_version` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_hub_plugins_owner_key` ON `sky_hub_plugins` (`owner_user_id`,`plugin_key`);