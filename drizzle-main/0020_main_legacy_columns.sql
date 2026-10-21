-- The canonical avoado.si D1 recorded the original Sites bridge before these
-- additive columns existed. Its 0013-0019 migrations are already recorded, so
-- this main-only lineage adds the missing columns before replaying the current
-- idempotent full-schema bridge in 0021. Every addition preserves existing rows.
ALTER TABLE `agent_delegations` ADD COLUMN `parent_budget_limit_minor` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `continue_while_device_offline` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `price_quote_digest` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `price_quote_json` text;
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `package_runtime_binding_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `package_runtime_binding_digest` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `agent_delegations` ADD COLUMN `predecessor_delegation_id` text;
--> statement-breakpoint
ALTER TABLE `csv_billing_accounts` ADD COLUMN `cancel_at_month` text;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `product_version` text DEFAULT 'catalog-csv-clean@0.1.0' NOT NULL;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `seller_id` text DEFAULT 'platform-owner' NOT NULL;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `channel` text DEFAULT 'direct' NOT NULL;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `terms_version` text DEFAULT 'csv-business-v1' NOT NULL;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `available_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `lease_id` text;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `lease_expires_at` integer;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `delivery_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `approved_at` integer;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `revision_requested_at` integer;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `revision_reason` text;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `canceled_at` integer;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `cancellation_reason` text;
--> statement-breakpoint
ALTER TABLE `csv_jobs` ADD COLUMN `files_purged_at` integer;
