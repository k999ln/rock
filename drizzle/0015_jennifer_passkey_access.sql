CREATE TABLE `jennifer_passkey_challenges` (
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
CREATE UNIQUE INDEX `idx_jennifer_passkey_challenge_hash` ON `jennifer_passkey_challenges` (`challenge_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_passkey_challenge_expiry` ON `jennifer_passkey_challenges` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_passkey_challenge_rate` ON `jennifer_passkey_challenges` (`request_key_sha256`,`created_at`);
--> statement-breakpoint
CREATE TABLE `jennifer_passkey_credentials` (
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
CREATE INDEX `idx_jennifer_passkey_owner` ON `jennifer_passkey_credentials` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `jennifer_passkey_sessions` (
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
CREATE UNIQUE INDEX `idx_jennifer_passkey_session_token` ON `jennifer_passkey_sessions` (`token_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_passkey_session_owner` ON `jennifer_passkey_sessions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_passkey_session_credential` ON `jennifer_passkey_sessions` (`credential_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `jennifer_passkey_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`credential_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `jennifer_passkey_event_details_check` CHECK(json_valid(`details_json`))
);
--> statement-breakpoint
CREATE INDEX `idx_jennifer_passkey_event_owner` ON `jennifer_passkey_events` (`user_id`,`created_at`);
