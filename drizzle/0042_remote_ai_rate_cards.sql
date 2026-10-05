CREATE TABLE `remote_ai_rate_cards` (
  `provider_id` text NOT NULL,
  `card_id` text NOT NULL,
  `key_id` text NOT NULL,
  `model_id` text NOT NULL,
  `currency` text NOT NULL,
  `pricing_version` text NOT NULL,
  `effective_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `digest` text NOT NULL,
  `card_json` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL,
  `created_by` text NOT NULL,
  `revoked_at` integer,
  `revoked_by` text,
  CONSTRAINT `pk_remote_ai_rate_cards` PRIMARY KEY(`provider_id`, `card_id`),
  CONSTRAINT `remote_ai_rate_card_digest_check` CHECK(length(`digest`) = 64),
  CONSTRAINT `remote_ai_rate_card_currency_check` CHECK(`currency` GLOB '[A-Z][A-Z][A-Z]'),
  CONSTRAINT `remote_ai_rate_card_validity_check` CHECK(`expires_at` > `effective_at`),
  CONSTRAINT `remote_ai_rate_card_status_check` CHECK(`status` IN ('active', 'revoked')),
  CONSTRAINT `remote_ai_rate_card_revocation_check` CHECK((`status` = 'active' AND `revoked_at` IS NULL AND `revoked_by` IS NULL) OR (`status` = 'revoked' AND `revoked_at` IS NOT NULL AND `revoked_by` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_remote_ai_rate_card_lookup` ON `remote_ai_rate_cards` (`provider_id`, `model_id`, `currency`, `status`, `effective_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_rate_card_digest` ON `remote_ai_rate_cards` (`digest`);
