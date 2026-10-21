CREATE TABLE `mini_creator_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mini_creator_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`demo_url` text,
	`source_url` text,
	`status` text NOT NULL,
	`removal_hash` text NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` integer NOT NULL
);
