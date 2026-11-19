CREATE TABLE `eve_device_jobs` (
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
CREATE UNIQUE INDEX `idx_eve_device_job_owner_id` ON `eve_device_jobs` (`owner_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `idx_eve_device_jobs_thread` ON `eve_device_jobs` (`owner_id`,`thread_id`,`updated_at`);