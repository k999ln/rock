CREATE TABLE `operator_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`command_id` text,
	`actor_user_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`event` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operator_audit_device_created` ON `operator_audit_events` (`device_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_operator_audit_incident_created` ON `operator_audit_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `operator_device_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`operator_user_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`issued_at` integer NOT NULL,
	`not_before` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`acknowledged_at` integer,
	`completed_at` integer,
	`result_code` text
);
--> statement-breakpoint
CREATE INDEX `idx_operator_commands_device_status` ON `operator_device_commands` (`device_id`,`status`,`issued_at`);--> statement-breakpoint
CREATE INDEX `idx_operator_commands_incident` ON `operator_device_commands` (`incident_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `operator_managed_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`platform` text NOT NULL,
	`model` text NOT NULL,
	`os_version` text NOT NULL,
	`status` text NOT NULL,
	`trust_state` text NOT NULL,
	`channel_state` text NOT NULL,
	`key_fingerprint` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operator_devices_status_seen` ON `operator_managed_devices` (`status`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_operator_devices_owner` ON `operator_managed_devices` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER operator_audit_events_no_update
BEFORE UPDATE ON operator_audit_events
BEGIN SELECT RAISE(ABORT, 'operator audit immutable'); END;--> statement-breakpoint
CREATE TRIGGER operator_audit_events_no_delete
BEFORE DELETE ON operator_audit_events
BEGIN SELECT RAISE(ABORT, 'operator audit immutable'); END;
