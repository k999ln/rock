CREATE TABLE `eve_conversations` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`remember` integer NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL,
	`save_token` text NOT NULL,
	`deleted_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_eve_device_command_owner_id` ON `eve_device_commands` (`owner_id`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_eve_device_command_pending` ON `eve_device_commands` (`owner_id`,`device_id`,`state`);
--> statement-breakpoint
CREATE TABLE `eve_device_jobs` (
	`owner_id` text NOT NULL,
	`job_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`device_id` text NOT NULL,
	`revision` integer NOT NULL,
	`digest` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eve_device_job_owner_id` ON `eve_device_jobs` (`owner_id`,`job_id`);
--> statement-breakpoint
CREATE INDEX `idx_eve_device_jobs_thread` ON `eve_device_jobs` (`owner_id`,`thread_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `eve_device_presence` (
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eve_device_presence_owner_id` ON `eve_device_presence` (`owner_id`,`device_id`);
--> statement-breakpoint
CREATE TABLE `eve_memory_terms` (
	`owner_id` text NOT NULL,
	`token` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `token`, `thread_id`, `message_id`)
);
--> statement-breakpoint
CREATE TABLE `eve_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eve_messages_identity` ON `eve_messages` (`owner_id`,`thread_id`,`message_id`);
