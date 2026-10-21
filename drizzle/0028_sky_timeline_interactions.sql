CREATE TABLE `sky_social_reactions` (
	`profile_id` text NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `post_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `sky_social_reactions_post` ON `sky_social_reactions` (`post_id`,`kind`);--> statement-breakpoint
ALTER TABLE `sky_social_posts` ADD `reply_to` text;--> statement-breakpoint
CREATE INDEX `sky_social_posts_reply` ON `sky_social_posts` (`reply_to`,`created_at`);