-- Imported existing RockstarOS schema 0067_sky_optional_features.sql
CREATE TABLE `sky_feature_additions` (
	`owner_user_id` text NOT NULL,
	`feature` text NOT NULL,
	`enabled` integer NOT NULL,
	`purpose` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_feature_additions_owner_feature` ON `sky_feature_additions` (`owner_user_id`,`feature`);
--> statement-breakpoint
-- Imported existing RockstarOS schema 0068_sky_hub_plugins.sql
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
--> statement-breakpoint
-- Imported existing RockstarOS schema 0069_sky_x_feed_state.sql
CREATE TABLE `sky_x_feed_state` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text DEFAULT '[]' NOT NULL,
	`remote_user_id` text,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`next_refresh_at` integer DEFAULT 0 NOT NULL,
	`retry_after` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`window_day` text DEFAULT '' NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
--> statement-breakpoint
-- Imported existing RockstarOS schema 0071_sky_communities.sql
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
--> statement-breakpoint
-- Imported existing RockstarOS schema 0072_community_os_keys.sql
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
--> statement-breakpoint
-- Imported existing RockstarOS schema 0073_sky_timeline_interactions.sql
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
--> statement-breakpoint
-- Imported existing RockstarOS schema 0074_sky_x_account_oauth.sql
CREATE TABLE `sky_x_accounts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`remote_id` text,
	`username` text,
	`display_name` text,
	`tokens` text,
	`cache` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`next_refresh_at` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`window_day` text DEFAULT '' NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
--> statement-breakpoint
CREATE TABLE `sky_x_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`cookie_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`account_revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sky_x_oauth_owner_expiry` ON `sky_x_oauth_states` (`owner_id`,`expires_at`);
