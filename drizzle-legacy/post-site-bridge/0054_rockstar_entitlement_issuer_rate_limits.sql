CREATE TABLE `rockstar_entitlement_issuer_rate_limits` (
	`issuer_id` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rockstar_entitlement_issuer_rate_limit_count_check" CHECK("rockstar_entitlement_issuer_rate_limits"."request_count" >= 0)
);
