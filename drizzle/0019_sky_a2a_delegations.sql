CREATE TABLE `agent_delegations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`message_id` text NOT NULL,
	`target_origin` text NOT NULL,
	`target_agent_name` text NOT NULL,
	`target_agent_version` text NOT NULL,
	`protocol_version` text NOT NULL,
	`input_sha256` text NOT NULL,
	`authorization_sha256` text NOT NULL,
	`budget_currency` text NOT NULL,
	`budget_limit_minor` integer NOT NULL,
	`deadline_at` integer NOT NULL,
	`state` text NOT NULL,
	`remote_task_id` text,
	`remote_context_id` text,
	`remote_state` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_owner_key` ON `agent_delegations` (`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_owner_message` ON `agent_delegations` (`owner_user_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_parent_created` ON `agent_delegations` (`owner_user_id`,`parent_job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_reconcile` ON `agent_delegations` (`state`,`updated_at`);