CREATE TABLE `eve_device_commands` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`device_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`digest` text NOT NULL,
	`envelope` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eve_device_command_owner_id` ON `eve_device_commands` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_eve_device_command_pending` ON `eve_device_commands` (`owner_id`,`device_id`,`state`);--> statement-breakpoint
CREATE TABLE `eve_device_presence` (
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eve_device_presence_owner_id` ON `eve_device_presence` (`owner_id`,`device_id`);