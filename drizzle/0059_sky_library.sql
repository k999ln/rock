CREATE TABLE `sky_library_items` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`saved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_library_owner_tool` ON `sky_library_items` (`user_id`,`tool`);
