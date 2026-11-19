CREATE TABLE `sky_agent_share_installs` (
	`owner_id` text NOT NULL,
	`share_id` text NOT NULL,
	`version` integer NOT NULL,
	`agent_id` text NOT NULL,
	`manifest` text NOT NULL,
	`digest` text NOT NULL,
	`config_digest` text NOT NULL,
	`save_token` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sky_agent_share_installs_version` ON `sky_agent_share_installs` (`owner_id`,`share_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `sky_agent_share_installs_agent` ON `sky_agent_share_installs` (`owner_id`,`agent_id`);--> statement-breakpoint
CREATE TABLE `sky_agent_shares` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`owner_id` text NOT NULL,
	`community_id` text,
	`manifest` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`withdrawn_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sky_agent_shares_id_version` ON `sky_agent_shares` (`id`,`version`);--> statement-breakpoint
CREATE INDEX `sky_agent_shares_owner` ON `sky_agent_shares` (`owner_id`);