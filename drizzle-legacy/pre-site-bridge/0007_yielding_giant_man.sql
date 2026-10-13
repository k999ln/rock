CREATE TABLE `mercari_revenue_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mercari_revenue_user_updated` ON `mercari_revenue_plans` (`user_id`,`updated_at`);