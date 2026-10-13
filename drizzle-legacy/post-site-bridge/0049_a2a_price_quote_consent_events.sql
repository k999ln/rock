CREATE TABLE `a2a_price_quote_consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`quote_request_id` text NOT NULL,
	`agent_connection_id` text NOT NULL,
	`agent_origin` text NOT NULL,
	`agent_name` text NOT NULL,
	`agent_version` text NOT NULL,
	`agent_card_sha256` text NOT NULL,
	`prompt_sha256` text NOT NULL,
	`currency` text NOT NULL,
	`maximum_budget_minor` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	CONSTRAINT "a2a_quote_consent_hash_check" CHECK(length("a2a_price_quote_consent_events"."agent_card_sha256") = 64 AND length("a2a_price_quote_consent_events"."prompt_sha256") = 64),
	CONSTRAINT "a2a_quote_consent_currency_check" CHECK("a2a_price_quote_consent_events"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "a2a_quote_consent_budget_check" CHECK("a2a_price_quote_consent_events"."maximum_budget_minor" > 0 AND "a2a_price_quote_consent_events"."maximum_budget_minor" <= 100000000),
	CONSTRAINT "a2a_quote_consent_version_check" CHECK("a2a_price_quote_consent_events"."consent_version" = 'a2a-price-quote-prompt-disclosure-v1')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_quote_consent_owner_request` ON `a2a_price_quote_consent_events` (`owner_user_id`,`quote_request_id`);--> statement-breakpoint
CREATE INDEX `idx_a2a_quote_consent_owner_time` ON `a2a_price_quote_consent_events` (`owner_user_id`,`consented_at`);
--> statement-breakpoint
CREATE TRIGGER a2a_price_quote_consent_no_update BEFORE UPDATE ON a2a_price_quote_consent_events
BEGIN SELECT RAISE(ABORT, 'A2A_PRICE_QUOTE_CONSENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER a2a_price_quote_consent_no_delete BEFORE DELETE ON a2a_price_quote_consent_events
BEGIN SELECT RAISE(ABORT, 'A2A_PRICE_QUOTE_CONSENT_IMMUTABLE'); END;
