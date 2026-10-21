-- Additive convergence for Home/Sky/Eve; existing table bytes are retained.
CREATE TABLE IF NOT EXISTS `sky_agent_settings` (
	`owner_user_id` text NOT NULL,
	`id` text NOT NULL,
	`source_tool` text,
	`settings` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sky_agent_settings_owner_id` ON `sky_agent_settings` (`owner_user_id`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sky_agent_settings_owner_updated` ON `sky_agent_settings` (`owner_user_id`,`updated_at`);--> statement-breakpoint

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
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sky_feature_additions_owner_feature` ON `sky_feature_additions` (`owner_user_id`,`feature`);
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
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sky_hub_plugins_owner_key` ON `sky_hub_plugins` (`owner_user_id`,`plugin_key`);
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_community_members` (
	`community_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `profile_id`)
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
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_posts_created` ON `sky_social_posts` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_posts_community` ON `sky_social_posts` (`community_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_social_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sky_social_profiles_owner_id_unique` ON `sky_social_profiles` (`owner_id`);
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
CREATE UNIQUE INDEX IF NOT EXISTS `sky_community_install_active` ON `sky_community_installs` (`owner_id`) WHERE "sky_community_installs"."active"=1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sky_community_keys` (
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
CREATE TABLE IF NOT EXISTS `sky_social_reactions` (
	`profile_id` text NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `post_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_reactions_post` ON `sky_social_reactions` (`post_id`,`kind`);--> statement-breakpoint
ALTER TABLE `sky_social_posts` ADD `reply_to` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sky_social_posts_reply` ON `sky_social_posts` (`reply_to`,`created_at`);
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
CREATE INDEX IF NOT EXISTS `sky_x_oauth_owner_expiry` ON `sky_x_oauth_states` (`owner_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE sky_linux_service_documents (
 id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('workspace','listing','review')), revision INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL CHECK(json_valid(payload)), updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_sky_linux_service_owner ON sky_linux_service_documents(owner_user_id,kind,updated_at);
--> statement-breakpoint
CREATE TABLE sky_linux_service_receipts (
 id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, digest TEXT NOT NULL,
 kind TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_sky_linux_receipt_workspace ON sky_linux_service_receipts(workspace_id,created_at);

--> statement-breakpoint
CREATE TABLE rockstar_service_setups (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_rockstar_service_setup_session ON rockstar_service_setups(json_extract(payload,'$.billing.sessionId'));

--> statement-breakpoint
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
CREATE UNIQUE INDEX IF NOT EXISTS `eve_messages_identity` ON `eve_messages` (`owner_id`,`thread_id`,`message_id`);
--> statement-breakpoint
