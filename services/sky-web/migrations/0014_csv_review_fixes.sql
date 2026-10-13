PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_csv_monthly_fee_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text DEFAULT 'platform-owner' NOT NULL,
	`billing_account_id` text NOT NULL,
	`contract_id` text DEFAULT 'csv-seller-fee/1' NOT NULL,
	`policy_version` text DEFAULT 'csv-seller-fee/1' NOT NULL,
	`month_jst` text NOT NULL,
	`verified_net_usd_minor` integer,
	`fee_due_usd_minor` integer,
	`status` text NOT NULL,
	`evidence_digest` text NOT NULL,
	`reason` text DEFAULT 'reconciled' NOT NULL,
	`decision_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_csv_monthly_fee_decisions`("id", "seller_id", "billing_account_id", "contract_id", "policy_version", "month_jst", "verified_net_usd_minor", "fee_due_usd_minor", "status", "evidence_digest", "reason", "decision_json", "created_at", "updated_at") SELECT "id", "seller_id", "billing_account_id", "contract_id", "policy_version", "month_jst", "verified_net_usd_minor", "fee_due_usd_minor", "status", "evidence_digest", "reason", "decision_json", "created_at", "updated_at" FROM `csv_monthly_fee_decisions`;--> statement-breakpoint
DROP TABLE `csv_monthly_fee_decisions`;--> statement-breakpoint
ALTER TABLE `__new_csv_monthly_fee_decisions` RENAME TO `csv_monthly_fee_decisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_fee_decision_account_month` ON `csv_monthly_fee_decisions` (`billing_account_id`,`month_jst`);--> statement-breakpoint
CREATE INDEX `idx_csv_fee_month_status` ON `csv_monthly_fee_decisions` (`month_jst`,`status`);--> statement-breakpoint
CREATE TABLE `__new_csv_monthly_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`month_jst` text NOT NULL,
	`verified_net_usd_minor` integer NOT NULL,
	`fee_due_usd_minor` integer NOT NULL,
	`status` text NOT NULL,
	`provider_evidence` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_csv_monthly_fees`("id", "billing_account_id", "month_jst", "verified_net_usd_minor", "fee_due_usd_minor", "status", "provider_evidence", "created_at", "updated_at") SELECT "id", "billing_account_id", "month_jst", "verified_net_usd_minor", "fee_due_usd_minor", "status", "provider_evidence", "created_at", "updated_at" FROM `csv_monthly_fees`;--> statement-breakpoint
DROP TABLE `csv_monthly_fees`;--> statement-breakpoint
ALTER TABLE `__new_csv_monthly_fees` RENAME TO `csv_monthly_fees`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_fee_account_month` ON `csv_monthly_fees` (`billing_account_id`,`month_jst`);