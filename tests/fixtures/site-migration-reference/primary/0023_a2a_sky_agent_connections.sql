CREATE TABLE `sky_a2a_agent_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`origin` text NOT NULL,
	`card_url` text NOT NULL,
	`agent_name` text NOT NULL,
	`agent_version` text NOT NULL,
	`card_sha256` text NOT NULL,
	`card_json` text NOT NULL,
	`discovered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_a2a_agent_owner_origin_name` ON `sky_a2a_agent_connections` (`owner_user_id`,`origin`,`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_sky_a2a_agent_owner_discovered` ON `sky_a2a_agent_connections` (`owner_user_id`,`discovered_at`);