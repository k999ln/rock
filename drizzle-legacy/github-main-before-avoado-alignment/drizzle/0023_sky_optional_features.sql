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