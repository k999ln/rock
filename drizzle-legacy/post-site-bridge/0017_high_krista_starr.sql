CREATE TABLE `coconala_team_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coconala_team_user_updated` ON `coconala_team_cases` (`user_id`,`updated_at`);