CREATE TABLE `agent_delegation_inputs` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`input_sha256` text NOT NULL,
	`key_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_input_owner_expiry` ON `agent_delegation_inputs` (`owner_user_id`,`expires_at`);