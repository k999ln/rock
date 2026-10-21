CREATE TABLE `sky_communities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`rules` text NOT NULL,
	`visibility` text NOT NULL,
	`invite_hash` text,
	`created_at` integer NOT NULL,
	`archived_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_community_members` (
	`community_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `profile_id`)
);
--> statement-breakpoint
CREATE TABLE `sky_social_follows` (
	`follower_id` text NOT NULL,
	`following_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `following_id`)
);
--> statement-breakpoint
CREATE TABLE `sky_social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`community_id` text,
	`content` text NOT NULL,
	`attachment` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sky_social_posts_created` ON `sky_social_posts` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `sky_social_posts_community` ON `sky_social_posts` (`community_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sky_social_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sky_social_profiles_owner_id_unique` ON `sky_social_profiles` (`owner_id`);