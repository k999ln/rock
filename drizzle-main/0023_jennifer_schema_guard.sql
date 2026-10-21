-- Failed Sites deployments can apply migrations before Worker publication.
-- Reassert the Jennifer execution and passkey schema idempotently so the
-- canonical main lineage is complete even when 0014/0015 were not recorded.
CREATE TABLE IF NOT EXISTS `jennifer_plan_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`root_job_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`plan_digest` text NOT NULL,
	`parent_plan_digest` text,
	`plan_json` text NOT NULL,
	`diff_json` text DEFAULT '[]' NOT NULL,
	`resolution_json` text DEFAULT '[]' NOT NULL,
	`state` text NOT NULL,
	`approved_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `jennifer_plan_digest_check` CHECK(length(`plan_digest`) = 64),
	CONSTRAINT `jennifer_plan_state_check` CHECK(`state` IN ('draft','inventory_approved','delivery_approved','paused','superseded','accepted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_jennifer_plan_root_revision` ON `jennifer_plan_revisions` (`owner_user_id`,`root_job_id`,`revision`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_jennifer_plan_digest` ON `jennifer_plan_revisions` (`owner_user_id`,`plan_digest`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_plan_owner_updated` ON `jennifer_plan_revisions` (`owner_user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jennifer_task_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`root_job_id` text NOT NULL,
	`plan_revision` integer NOT NULL,
	`task_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`role` text NOT NULL,
	`child_job_id` text NOT NULL,
	`delegation_id` text NOT NULL,
	`principal` text NOT NULL,
	`input_digest` text NOT NULL,
	`artifact_set_digest` text,
	`usage_receipt_digest` text,
	`report_digest` text,
	`report_json` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `jennifer_attempt_role_check` CHECK(`role` IN ('worker','reviewer')),
	CONSTRAINT `jennifer_attempt_number_check` CHECK(`attempt` > 0),
	CONSTRAINT `jennifer_attempt_input_digest_check` CHECK(length(`input_digest`) = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_jennifer_attempt_identity` ON `jennifer_task_attempts` (`owner_user_id`,`root_job_id`,`plan_revision`,`task_id`,`attempt`,`role`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_jennifer_attempt_delegation` ON `jennifer_task_attempts` (`owner_user_id`,`delegation_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_attempt_root` ON `jennifer_task_attempts` (`owner_user_id`,`root_job_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_work_jobs_jennifer_coordination` ON `work_jobs` (
	`user_id`,
	json_extract(`payload`, '$.coordination.rootJobId'),
	json_extract(`payload`, '$.coordination.planId'),
	json_extract(`payload`, '$.coordination.taskId'),
	json_extract(`payload`, '$.coordination.role')
) WHERE json_extract(`payload`, '$.coordination.schema') = 'rockstaros-jennifer-task-job/1'
  AND json_extract(`payload`, '$.status') != 'cancelled';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jennifer_passkey_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`challenge_sha256` text NOT NULL,
	`request_key_sha256` text NOT NULL,
	`rp_id` text NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT `jennifer_passkey_challenge_kind_check` CHECK(`kind` IN ('registration','authentication')),
	CONSTRAINT `jennifer_passkey_challenge_hash_check` CHECK(length(`challenge_sha256`) = 64),
	CONSTRAINT `jennifer_passkey_challenge_request_key_check` CHECK(length(`request_key_sha256`) = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_jennifer_passkey_challenge_hash` ON `jennifer_passkey_challenges` (`challenge_sha256`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_passkey_challenge_expiry` ON `jennifer_passkey_challenges` (`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_passkey_challenge_rate` ON `jennifer_passkey_challenges` (`request_key_sha256`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jennifer_passkey_credentials` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key_cose` text NOT NULL,
	`sign_count` integer NOT NULL,
	`transports_json` text DEFAULT '[]' NOT NULL,
	`label` text NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`rp_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	CONSTRAINT `jennifer_passkey_counter_check` CHECK(`sign_count` >= 0),
	CONSTRAINT `jennifer_passkey_transports_check` CHECK(json_valid(`transports_json`)),
	CONSTRAINT `jennifer_passkey_device_type_check` CHECK(`device_type` IN ('singleDevice','multiDevice')),
	CONSTRAINT `jennifer_passkey_backed_up_check` CHECK(`backed_up` IN (0,1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_passkey_owner` ON `jennifer_passkey_credentials` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jennifer_passkey_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`auth_method` text NOT NULL,
	`token_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	CONSTRAINT `jennifer_passkey_session_hash_check` CHECK(length(`token_sha256`) = 64),
	CONSTRAINT `jennifer_passkey_session_method_check` CHECK(`auth_method` = 'passkey')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_jennifer_passkey_session_token` ON `jennifer_passkey_sessions` (`token_sha256`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_passkey_session_owner` ON `jennifer_passkey_sessions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_passkey_session_credential` ON `jennifer_passkey_sessions` (`credential_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jennifer_passkey_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`credential_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `jennifer_passkey_event_details_check` CHECK(json_valid(`details_json`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jennifer_passkey_event_owner` ON `jennifer_passkey_events` (`user_id`,`created_at`);
