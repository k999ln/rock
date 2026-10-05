CREATE TABLE `sky_campus_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `handle` text NOT NULL,
  `display_name` text NOT NULL,
  `affiliation` text NOT NULL,
  `affiliation_status` text NOT NULL,
  `headline` text DEFAULT '' NOT NULL,
  `bio` text DEFAULT '' NOT NULL,
  `skills_json` text DEFAULT '[]' NOT NULL,
  `interests_json` text DEFAULT '[]' NOT NULL,
  `looking_for_json` text DEFAULT '[]' NOT NULL,
  `links_json` text DEFAULT '[]' NOT NULL,
  `is_public` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_profile_user_campus` ON `sky_campus_profiles` (`user_id`,`campus_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_profile_handle` ON `sky_campus_profiles` (`campus_id`,`handle`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_profile_public` ON `sky_campus_profiles` (`campus_id`,`is_public`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `sky_campus_items` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `summary` text NOT NULL,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `details_json` text DEFAULT '{}' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `visibility` text DEFAULT 'campus' NOT NULL,
  `starts_at` text,
  `ends_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_items_feed` ON `sky_campus_items` (`campus_id`,`kind`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_items_owner` ON `sky_campus_items` (`owner_user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `sky_campus_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `edge_type` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_edge_unique` ON `sky_campus_edges` (`actor_user_id`,`edge_type`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_edge_target` ON `sky_campus_edges` (`campus_id`,`target_type`,`target_id`,`status`);
--> statement-breakpoint
CREATE TABLE `sky_campus_tags` (
  `tag_id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `mode` text NOT NULL,
  `destination` text NOT NULL,
  `label` text DEFAULT '' NOT NULL,
  `placement` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tags_owner` ON `sky_campus_tags` (`owner_user_id`,`campus_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tags_active` ON `sky_campus_tags` (`campus_id`,`active`);
--> statement-breakpoint
CREATE TABLE `sky_campus_tag_events` (
  `id` text PRIMARY KEY NOT NULL,
  `tag_id` text NOT NULL,
  `source` text NOT NULL,
  `occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tag_events_tag` ON `sky_campus_tag_events` (`tag_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tag_events_source` ON `sky_campus_tag_events` (`source`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE `sky_campus_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `reporter_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `reason` text NOT NULL,
  `detail` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_report_unique` ON `sky_campus_reports` (`reporter_user_id`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_reports_target` ON `sky_campus_reports` (`campus_id`,`target_type`,`target_id`,`status`);
