CREATE TABLE `rockstar_service_entitlements` (
	`issuer_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`purchase_reference_sha256` text NOT NULL,
	`claim_code_sha256` text NOT NULL,
	`form_factor` text NOT NULL,
	`scopes_json` text NOT NULL,
	`issuer_key_id` text NOT NULL,
	`claim_signature` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`claimed_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	PRIMARY KEY(`issuer_id`, `claim_id`),
	CONSTRAINT "rockstar_entitlement_form_factor_check" CHECK("rockstar_service_entitlements"."form_factor" IN ('physical_sim', 'esim', 'service_only')),
	CONSTRAINT "rockstar_entitlement_status_check" CHECK("rockstar_service_entitlements"."status" IN ('active', 'refunded', 'revoked', 'expired')),
	CONSTRAINT "rockstar_entitlement_purchase_hash_check" CHECK(length("rockstar_service_entitlements"."purchase_reference_sha256") = 64),
	CONSTRAINT "rockstar_entitlement_code_hash_check" CHECK(length("rockstar_service_entitlements"."claim_code_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_entitlement_owner_status` ON `rockstar_service_entitlements` (`owner_user_id`,`status`,`claimed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_entitlement_code` ON `rockstar_service_entitlements` (`claim_code_sha256`);