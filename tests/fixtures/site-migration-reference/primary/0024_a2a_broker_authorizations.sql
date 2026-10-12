CREATE TABLE `agent_delegation_broker_authorizations` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`authority_id` text NOT NULL,
	`key_id` text NOT NULL,
	`proof_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_a2a_broker_auth_owner` ON `agent_delegation_broker_authorizations` (`owner_user_id`,`delegation_id`);--> statement-breakpoint
CREATE INDEX `idx_a2a_broker_auth_expiry` ON `agent_delegation_broker_authorizations` (`expires_at`);