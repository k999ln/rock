CREATE TABLE `sky_code_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`revision` integer NOT NULL,
	`parent_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `sky_code_repositories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_code_repo_revision` ON `sky_code_commits` (`repo_id`,`revision`);--> statement-breakpoint
CREATE TABLE `sky_code_repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`head_id` text,
	`hidden` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_code_owner` ON `sky_code_repositories` (`user_id`);
--> statement-breakpoint
CREATE TRIGGER sky_code_commits_no_update BEFORE UPDATE ON sky_code_commits BEGIN SELECT RAISE(ABORT, 'immutable code commit'); END;
--> statement-breakpoint
CREATE TRIGGER sky_code_commits_no_delete BEFORE DELETE ON sky_code_commits BEGIN SELECT RAISE(ABORT, 'immutable code commit'); END;
