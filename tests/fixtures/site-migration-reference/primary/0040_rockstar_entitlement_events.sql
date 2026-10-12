CREATE TABLE `rockstar_entitlement_events` (
	`issuer_id` text NOT NULL,
	`event_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`purchase_reference_sha256` text NOT NULL,
	`event_type` text NOT NULL,
	`issuer_key_id` text NOT NULL,
	`event_sha256` text NOT NULL,
	`signature` text NOT NULL,
	`received_at` integer NOT NULL,
	`applied_at` integer,
	PRIMARY KEY(`issuer_id`, `event_id`),
	CONSTRAINT "rockstar_entitlement_event_hash_check" CHECK(length("rockstar_entitlement_events"."purchase_reference_sha256") = 64 AND length("rockstar_entitlement_events"."event_sha256") = 64),
	CONSTRAINT "rockstar_entitlement_event_type_check" CHECK("rockstar_entitlement_events"."event_type" IN ('refunded', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_entitlement_event_claim` ON `rockstar_entitlement_events` (`issuer_id`,`claim_id`,`received_at`);