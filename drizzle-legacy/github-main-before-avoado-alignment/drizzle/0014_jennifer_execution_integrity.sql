CREATE TABLE `jennifer_plan_revisions` (
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
CREATE UNIQUE INDEX `idx_jennifer_plan_root_revision` ON `jennifer_plan_revisions` (`owner_user_id`,`root_job_id`,`revision`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jennifer_plan_digest` ON `jennifer_plan_revisions` (`owner_user_id`,`plan_digest`);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_plan_owner_updated` ON `jennifer_plan_revisions` (`owner_user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `jennifer_task_attempts` (
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
CREATE UNIQUE INDEX `idx_jennifer_attempt_identity` ON `jennifer_task_attempts` (`owner_user_id`,`root_job_id`,`plan_revision`,`task_id`,`attempt`,`role`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jennifer_attempt_delegation` ON `jennifer_task_attempts` (`owner_user_id`,`delegation_id`);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_attempt_root` ON `jennifer_task_attempts` (`owner_user_id`,`root_job_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_jobs_jennifer_coordination` ON `work_jobs` (
	`user_id`,
	json_extract(`payload`, '$.coordination.rootJobId'),
	json_extract(`payload`, '$.coordination.planId'),
	json_extract(`payload`, '$.coordination.taskId'),
	json_extract(`payload`, '$.coordination.role')
) WHERE json_extract(`payload`, '$.coordination.schema') = 'rockstaros-jennifer-task-job/1'
  AND json_extract(`payload`, '$.status') != 'cancelled';
