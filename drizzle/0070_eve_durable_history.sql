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