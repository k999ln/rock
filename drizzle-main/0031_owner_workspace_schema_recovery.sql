-- Append-only owner workspace recovery after published timestamp inversions.
-- Preserve 0020-0030 bytes and recorded journal times; restored main DB required.
CREATE TABLE IF NOT EXISTS `eve_conversations` (
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
CREATE TABLE IF NOT EXISTS `eve_device_commands` (
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
CREATE TABLE IF NOT EXISTS `eve_device_jobs` (
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
CREATE TABLE IF NOT EXISTS `eve_device_presence` (
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `eve_memory_terms` (
	`owner_id` text NOT NULL,
	`token` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `token`, `thread_id`, `message_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `eve_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rockstar_account_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`mode` text NOT NULL,
	`binding_sha256` text NOT NULL,
	`origin` text NOT NULL,
	`recovery_sha256` text,
	`expected_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`completion_nonce` text,
	CONSTRAINT "rockstar_account_enrollment_mode" CHECK("rockstar_account_enrollments"."mode" IN ('signup','add','recover','login')),
	CONSTRAINT "rockstar_account_enrollment_binding" CHECK(length("rockstar_account_enrollments"."binding_sha256") = 64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rockstar_account_rate_limits` (
	`request_key` text NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL,
	PRIMARY KEY(`request_key`, `window`),
	CONSTRAINT "rockstar_account_rate_attempts" CHECK("rockstar_account_rate_limits"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rockstar_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`recovery_sha256` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rockstar_account_recovery_hash" CHECK(length("rockstar_accounts"."recovery_sha256") = 64),
	CONSTRAINT "rockstar_account_revision" CHECK("rockstar_accounts"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_communities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`rules` text NOT NULL,
	`visibility` text NOT NULL,
	`invite_hash` text,
	`created_at` integer NOT NULL,
	`archived_at` integer DEFAULT 0 NOT NULL
, `recovery_hash` text, `os_revision` integer DEFAULT 0 NOT NULL, `post_mode` text DEFAULT 'members' NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_community_editions` (
	`community_id` text NOT NULL,
	`version` integer NOT NULL,
	`manifest` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `version`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_community_installs` (
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
CREATE TABLE IF NOT EXISTS `sky_community_keys` (
	`community_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`revoked_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `profile_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_community_members` (
	`community_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `profile_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_feature_additions` (
	`owner_user_id` text NOT NULL,
	`feature` text NOT NULL,
	`enabled` integer NOT NULL,
	`purpose` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_hub_plugins` (
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
CREATE TABLE IF NOT EXISTS `sky_social_follows` (
	`follower_id` text NOT NULL,
	`following_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `following_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`community_id` text,
	`content` text NOT NULL,
	`attachment` text,
	`created_at` integer NOT NULL
, `reply_to` text);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_social_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_social_reactions` (
	`profile_id` text NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `post_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_x_accounts` (
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
CREATE TABLE IF NOT EXISTS `sky_x_feed_state` (
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
CREATE TABLE IF NOT EXISTS `sky_x_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`cookie_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`account_revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `eve_messages_identity` ON `eve_messages` (`owner_id`,`thread_id`,`message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_eve_device_command_owner_id` ON `eve_device_commands` (`owner_id`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_eve_device_command_pending` ON `eve_device_commands` (`owner_id`,`device_id`,`state`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_eve_device_job_owner_id` ON `eve_device_jobs` (`owner_id`,`job_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_eve_device_jobs_thread` ON `eve_device_jobs` (`owner_id`,`thread_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_eve_device_presence_owner_id` ON `eve_device_presence` (`owner_id`,`device_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_rockstar_account_enrollment_expiry` ON `rockstar_account_enrollments` (`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sky_feature_additions_owner_feature` ON `sky_feature_additions` (`owner_user_id`,`feature`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sky_hub_plugins_owner_key` ON `sky_hub_plugins` (`owner_user_id`,`plugin_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `rockstar_accounts_recovery_sha256_unique` ON `rockstar_accounts` (`recovery_sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sky_community_install_active` ON `sky_community_installs` (`owner_id`) WHERE "sky_community_installs"."active"=1;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_posts_community` ON `sky_social_posts` (`community_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_posts_created` ON `sky_social_posts` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_posts_reply` ON `sky_social_posts` (`reply_to`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sky_social_profiles_owner_id_unique` ON `sky_social_profiles` (`owner_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_reactions_post` ON `sky_social_reactions` (`post_id`,`kind`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_x_oauth_owner_expiry` ON `sky_x_oauth_states` (`owner_id`,`expires_at`);
--> statement-breakpoint
-- Existing partially migrated tables must already have the post-0027 columns.
-- These zero-row reads fail without modifying data if operator repair is needed.
SELECT recovery_hash, os_revision, post_mode FROM sky_communities LIMIT 0;
--> statement-breakpoint
SELECT reply_to FROM sky_social_posts LIMIT 0;
