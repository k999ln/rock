CREATE TABLE `esim_device_entitlements` (
	`challenge_id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`install_receipt_sha256` text NOT NULL,
	`authority_id` text NOT NULL,
	`key_id` text NOT NULL,
	`starter_pack_id` text NOT NULL,
	`starter_pack_version` text NOT NULL,
	`starter_pack_manifest_sha256` text NOT NULL,
	`receipt_sha256` text NOT NULL,
	`observed_at` integer NOT NULL,
	`activated_at` integer NOT NULL,
	CONSTRAINT "esim_device_entitlement_profile_check" CHECK(length("esim_device_entitlements"."profile_digest") = 64),
	CONSTRAINT "esim_device_entitlement_install_receipt_check" CHECK(length("esim_device_entitlements"."install_receipt_sha256") = 64),
	CONSTRAINT "esim_device_entitlement_pack_hash_check" CHECK(length("esim_device_entitlements"."starter_pack_manifest_sha256") = 64),
	CONSTRAINT "esim_device_entitlement_receipt_check" CHECK(length("esim_device_entitlements"."receipt_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_device_entitlement_order` ON `esim_device_entitlements` (`sky_order_id`);--> statement-breakpoint
CREATE INDEX `idx_esim_device_entitlement_owner` ON `esim_device_entitlements` (`owner_user_id`,`activated_at`);--> statement-breakpoint
CREATE TABLE `esim_device_gateway_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`install_receipt_sha256` text NOT NULL,
	`starter_pack_id` text NOT NULL,
	`starter_pack_version` text NOT NULL,
	`starter_pack_manifest_sha256` text NOT NULL,
	`nonce_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT "esim_gateway_challenge_profile_check" CHECK(length("esim_device_gateway_challenges"."profile_digest") = 64),
	CONSTRAINT "esim_gateway_challenge_install_receipt_check" CHECK(length("esim_device_gateway_challenges"."install_receipt_sha256") = 64),
	CONSTRAINT "esim_gateway_challenge_pack_hash_check" CHECK(length("esim_device_gateway_challenges"."starter_pack_manifest_sha256") = 64),
	CONSTRAINT "esim_gateway_challenge_nonce_check" CHECK(length("esim_device_gateway_challenges"."nonce_sha256") = 64),
	CONSTRAINT "esim_gateway_challenge_expiry_check" CHECK("esim_device_gateway_challenges"."expires_at" > "esim_device_gateway_challenges"."created_at")
);
--> statement-breakpoint
CREATE INDEX `idx_esim_gateway_challenge_order` ON `esim_device_gateway_challenges` (`owner_user_id`,`sky_order_id`,`created_at`);