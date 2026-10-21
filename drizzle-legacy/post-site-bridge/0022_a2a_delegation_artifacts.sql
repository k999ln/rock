CREATE TABLE `agent_delegation_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`delegation_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`remote_task_id` text NOT NULL,
	`artifact_sha256` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`key_version` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_artifact_identity` ON `agent_delegation_artifacts` (`owner_user_id`,`delegation_id`,`remote_task_id`,`artifact_sha256`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_artifact_owner` ON `agent_delegation_artifacts` (`owner_user_id`,`delegation_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD `artifacts_captured` integer DEFAULT 0 NOT NULL;