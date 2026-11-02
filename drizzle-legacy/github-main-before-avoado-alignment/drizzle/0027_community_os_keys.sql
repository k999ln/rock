CREATE TABLE `sky_community_editions` (
	`community_id` text NOT NULL,
	`version` integer NOT NULL,
	`manifest` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `sky_community_installs` (
	`owner_id` text NOT NULL,
	`community_id` text NOT NULL,
	`version` integer NOT NULL,
	`revision` integer NOT NULL,
	`manifest` text NOT NULL,
	`agent_refs` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`save_token` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `community_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sky_community_install_active` ON `sky_community_installs` (`owner_id`) WHERE "sky_community_installs"."active"=1;--> statement-breakpoint
CREATE TABLE `sky_community_keys` (
	`community_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`revoked_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `profile_id`)
);
--> statement-breakpoint
ALTER TABLE `sky_communities` ADD `recovery_hash` text;--> statement-breakpoint
ALTER TABLE `sky_communities` ADD `os_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sky_communities` ADD `post_mode` text DEFAULT 'members' NOT NULL;
--> statement-breakpoint
UPDATE sky_communities SET visibility='members',invite_hash=NULL;
