CREATE TABLE `agent_delegation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`delegation_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`event_type` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`remote_state` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_event_revision` ON `agent_delegation_events` (`delegation_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_event_owner` ON `agent_delegation_events` (`owner_user_id`,`delegation_id`,`created_at`);