CREATE TABLE `rockstar_a2a_broker_devices` (
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
	`registered_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`owner_user_id`, `device_ref`, `key_id`),
	CONSTRAINT "rockstar_a2a_broker_device_algorithm_check" CHECK("rockstar_a2a_broker_devices"."algorithm" = 'ES256'),
	CONSTRAINT "rockstar_a2a_broker_device_public_check" CHECK(length("rockstar_a2a_broker_devices"."public_key_hex") = 130 AND substr("rockstar_a2a_broker_devices"."public_key_hex", 1, 2) = '04'),
	CONSTRAINT "rockstar_a2a_broker_device_fingerprint_check" CHECK(length("rockstar_a2a_broker_devices"."public_key_sha256") = 64 AND "rockstar_a2a_broker_devices"."key_id" = "rockstar_a2a_broker_devices"."public_key_sha256"),
	CONSTRAINT "rockstar_a2a_broker_device_signer_check" CHECK("rockstar_a2a_broker_devices"."application_package" = 'dev.rock.automation' AND length("rockstar_a2a_broker_devices"."signing_certificate_sha256") = 64),
	CONSTRAINT "rockstar_a2a_broker_device_version_check" CHECK("rockstar_a2a_broker_devices"."minimum_application_version" <> '' AND "rockstar_a2a_broker_devices"."minimum_application_version" NOT GLOB '*[^0-9]*' AND length("rockstar_a2a_broker_devices"."minimum_application_version") <= 9),
	CONSTRAINT "rockstar_a2a_broker_device_security_check" CHECK("rockstar_a2a_broker_devices"."security_level" IN ('TRUSTED_ENVIRONMENT', 'STRONG_BOX')),
	CONSTRAINT "rockstar_a2a_broker_device_boot_check" CHECK("rockstar_a2a_broker_devices"."verified_boot_state" = 'VERIFIED'),
	CONSTRAINT "rockstar_a2a_broker_device_status_check" CHECK("rockstar_a2a_broker_devices"."status" IN ('active', 'revoked')),
	CONSTRAINT "rockstar_a2a_broker_device_revoked_check" CHECK(("rockstar_a2a_broker_devices"."status" = 'active' AND "rockstar_a2a_broker_devices"."revoked_at" IS NULL) OR ("rockstar_a2a_broker_devices"."status" = 'revoked' AND "rockstar_a2a_broker_devices"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_a2a_broker_device_fingerprint` ON `rockstar_a2a_broker_devices` (`authority_id`,`key_id`);--> statement-breakpoint
CREATE INDEX `idx_rockstar_a2a_broker_device_owner` ON `rockstar_a2a_broker_devices` (`owner_user_id`,`device_ref`,`status`);--> statement-breakpoint
CREATE TABLE `rockstar_a2a_broker_enrollment_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`nonce_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT "rockstar_a2a_broker_challenge_nonce_check" CHECK(length("rockstar_a2a_broker_enrollment_challenges"."nonce_sha256") = 64),
	CONSTRAINT "rockstar_a2a_broker_challenge_expiry_check" CHECK("rockstar_a2a_broker_enrollment_challenges"."expires_at" > "rockstar_a2a_broker_enrollment_challenges"."created_at" AND "rockstar_a2a_broker_enrollment_challenges"."expires_at" <= "rockstar_a2a_broker_enrollment_challenges"."created_at" + 300000)
);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_a2a_broker_challenge_owner` ON `rockstar_a2a_broker_enrollment_challenges` (`owner_user_id`,`device_ref`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_rockstar_a2a_broker_challenge_expiry` ON `rockstar_a2a_broker_enrollment_challenges` (`consumed_at`,`expires_at`);--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_challenge_no_update BEFORE UPDATE ON rockstar_a2a_broker_enrollment_challenges
WHEN NOT (OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL AND
  NEW.id = OLD.id AND NEW.owner_user_id = OLD.owner_user_id AND NEW.device_ref = OLD.device_ref AND
  NEW.nonce_sha256 = OLD.nonce_sha256 AND NEW.created_at = OLD.created_at AND NEW.expires_at = OLD.expires_at)
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_CHALLENGE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_challenge_no_delete BEFORE DELETE ON rockstar_a2a_broker_enrollment_challenges
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_CHALLENGE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_device_revoke_only BEFORE UPDATE ON rockstar_a2a_broker_devices
WHEN NOT (OLD.status = 'active' AND NEW.status = 'revoked' AND NEW.revoked_at IS NOT NULL AND
  NEW.authority_id = OLD.authority_id AND NEW.owner_user_id = OLD.owner_user_id AND
  NEW.device_ref = OLD.device_ref AND NEW.key_id = OLD.key_id AND NEW.algorithm = OLD.algorithm AND
  NEW.public_key_hex = OLD.public_key_hex AND NEW.public_key_sha256 = OLD.public_key_sha256 AND
  NEW.application_package = OLD.application_package AND
  NEW.minimum_application_version = OLD.minimum_application_version AND
  NEW.signing_certificate_sha256 = OLD.signing_certificate_sha256 AND
  NEW.security_level = OLD.security_level AND NEW.verified_boot_state = OLD.verified_boot_state AND
  NEW.attested_at = OLD.attested_at AND NEW.registered_at = OLD.registered_at)
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_DEVICE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_device_no_delete BEFORE DELETE ON rockstar_a2a_broker_devices
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_DEVICE_IMMUTABLE'); END;
