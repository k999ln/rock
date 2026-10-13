CREATE TABLE `esim_device_gateway_keys` (
	`authority_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`key_id` text NOT NULL,
	`algorithm` text NOT NULL,
	`public_key_hex` text NOT NULL,
	`public_key_sha256` text NOT NULL,
	`application_package` text NOT NULL,
	`minimum_application_version` text NOT NULL,
	`signing_certificate_sha256` text NOT NULL,
	`security_level` text NOT NULL,
	`verified_boot_state` text NOT NULL,
	`attested_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`owner_user_id`, `device_ref`, `key_id`),
	CONSTRAINT "esim_device_gateway_key_algorithm_check" CHECK("esim_device_gateway_keys"."algorithm" = 'ES256'),
	CONSTRAINT "esim_device_gateway_key_public_check" CHECK(length("esim_device_gateway_keys"."public_key_hex") = 130 AND substr("esim_device_gateway_keys"."public_key_hex", 1, 2) = '04'),
	CONSTRAINT "esim_device_gateway_key_fingerprint_check" CHECK(length("esim_device_gateway_keys"."public_key_sha256") = 64 AND "esim_device_gateway_keys"."key_id" = "esim_device_gateway_keys"."public_key_sha256"),
	CONSTRAINT "esim_device_gateway_key_signer_check" CHECK(length("esim_device_gateway_keys"."signing_certificate_sha256") = 64),
	CONSTRAINT "esim_device_gateway_key_security_check" CHECK("esim_device_gateway_keys"."security_level" IN ('TRUSTED_ENVIRONMENT', 'STRONG_BOX')),
	CONSTRAINT "esim_device_gateway_key_boot_check" CHECK("esim_device_gateway_keys"."verified_boot_state" = 'VERIFIED'),
	CONSTRAINT "esim_device_gateway_key_status_check" CHECK("esim_device_gateway_keys"."status" IN ('active', 'revoked')),
	CONSTRAINT "esim_device_gateway_key_revoked_check" CHECK(("esim_device_gateway_keys"."status" = 'active' AND "esim_device_gateway_keys"."revoked_at" IS NULL) OR ("esim_device_gateway_keys"."status" = 'revoked' AND "esim_device_gateway_keys"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_device_gateway_key_fingerprint` ON `esim_device_gateway_keys` (`authority_id`,`key_id`);--> statement-breakpoint
CREATE INDEX `idx_esim_device_gateway_key_owner` ON `esim_device_gateway_keys` (`owner_user_id`,`device_ref`,`status`);