ALTER TABLE `agent_delegations` ADD COLUMN `price_quote_digest` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `price_quote_json` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_price_quote_digest`
  ON `agent_delegations` (`price_quote_digest`) WHERE `price_quote_digest` <> '';
