CREATE TABLE `rockstar_entitlement_issuer_deliveries` (
	`issuer_id` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`request_sha256` text NOT NULL,
	`purchase_reference_sha256` text NOT NULL,
	`claim_id` text NOT NULL,
	`claim_json` text NOT NULL,
	`claim_json_sha256` text NOT NULL,
	`claim_code_ciphertext` text,
	`claim_code_nonce` text,
	`state` text DEFAULT 'prepared' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`delivered_at` integer,
	PRIMARY KEY(`issuer_id`, `idempotency_key_sha256`),
	CONSTRAINT "rockstar_entitlement_issuer_delivery_hashes_check" CHECK(length("rockstar_entitlement_issuer_deliveries"."idempotency_key_sha256") = 64 AND length("rockstar_entitlement_issuer_deliveries"."request_sha256") = 64 AND length("rockstar_entitlement_issuer_deliveries"."purchase_reference_sha256") = 64 AND length("rockstar_entitlement_issuer_deliveries"."claim_json_sha256") = 64),
	CONSTRAINT "rockstar_entitlement_issuer_delivery_claim_json_check" CHECK(json_valid("rockstar_entitlement_issuer_deliveries"."claim_json")),
	CONSTRAINT "rockstar_entitlement_issuer_delivery_state_check" CHECK(("rockstar_entitlement_issuer_deliveries"."state" = 'prepared' AND "rockstar_entitlement_issuer_deliveries"."claim_code_ciphertext" IS NOT NULL AND "rockstar_entitlement_issuer_deliveries"."claim_code_nonce" IS NOT NULL AND "rockstar_entitlement_issuer_deliveries"."delivered_at" IS NULL) OR ("rockstar_entitlement_issuer_deliveries"."state" = 'delivered' AND "rockstar_entitlement_issuer_deliveries"."claim_code_ciphertext" IS NULL AND "rockstar_entitlement_issuer_deliveries"."claim_code_nonce" IS NULL AND "rockstar_entitlement_issuer_deliveries"."delivered_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_entitlement_issuer_delivery_claim` ON `rockstar_entitlement_issuer_deliveries` (`issuer_id`,`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_rockstar_entitlement_issuer_delivery_purchase` ON `rockstar_entitlement_issuer_deliveries` (`issuer_id`,`purchase_reference_sha256`,`created_at`);