CREATE TABLE `esim_device_install_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`nonce_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT "esim_install_challenge_profile_digest_check" CHECK(length("esim_device_install_challenges"."profile_digest") = 64),
	CONSTRAINT "esim_install_challenge_nonce_check" CHECK(length("esim_device_install_challenges"."nonce_sha256") = 64),
	CONSTRAINT "esim_install_challenge_expiry_check" CHECK("esim_device_install_challenges"."expires_at" > "esim_device_install_challenges"."created_at")
);
--> statement-breakpoint
CREATE INDEX `idx_esim_install_challenges_order` ON `esim_device_install_challenges` (`owner_user_id`,`sky_order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `esim_device_install_receipts` (
	`challenge_id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`issuer_id` text NOT NULL,
	`key_id` text NOT NULL,
	`receipt_sha256` text NOT NULL,
	`evidence_source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`verified_at` integer NOT NULL,
	CONSTRAINT "esim_install_receipt_profile_digest_check" CHECK(length("esim_device_install_receipts"."profile_digest") = 64),
	CONSTRAINT "esim_install_receipt_hash_check" CHECK(length("esim_device_install_receipts"."receipt_sha256") = 64),
	CONSTRAINT "esim_install_receipt_source_check" CHECK("esim_device_install_receipts"."evidence_source" IN ('carrier_privileged', 'oem_euicc_controller'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_install_receipt_order` ON `esim_device_install_receipts` (`sky_order_id`);--> statement-breakpoint
CREATE INDEX `idx_esim_install_receipt_owner` ON `esim_device_install_receipts` (`owner_user_id`,`verified_at`);