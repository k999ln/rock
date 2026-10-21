CREATE TABLE IF NOT EXISTS `sky_library_items` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`saved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sky_library_owner_tool` ON `sky_library_items` (`user_id`,`tool`);--> statement-breakpoint
CREATE TABLE `sky_recurring_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`status` text NOT NULL,
	`invoice_id` text,
	`item_id` text,
	`started_at` integer NOT NULL,
	`attempt_revision` integer DEFAULT -1 NOT NULL,
	`attempt_key_revision` integer DEFAULT -1 NOT NULL,
	`attempt_started_at` integer,
	`paid_at` integer,
	FOREIGN KEY (`contract_id`) REFERENCES `sky_recurring_contracts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sky_recurring_charge_state" CHECK("sky_recurring_charges"."status" IN ('creating','open','paid','attention'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sky_recurring_charges_invoice_id_unique` ON `sky_recurring_charges` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sky_recurring_charge_period` ON `sky_recurring_charges` (`contract_id`,`period_start`);--> statement-breakpoint
CREATE TABLE `sky_recurring_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`payment_method_id` text NOT NULL,
	`payment_revision` integer DEFAULT 0 NOT NULL,
	`consent_version` text NOT NULL,
	`credit_minor` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`status` text NOT NULL,
	`access_until` integer NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "sky_recurring_credit" CHECK("sky_recurring_contracts"."credit_minor"=14000),
	CONSTRAINT "sky_recurring_period" CHECK("sky_recurring_contracts"."period_end">"sky_recurring_contracts"."period_start"),
	CONSTRAINT "sky_recurring_state" CHECK("sky_recurring_contracts"."status" IN ('active','collecting','past_due','cancelled','disputed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sky_recurring_contracts_owner_id_unique` ON `sky_recurring_contracts` (`owner_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS work_jobs (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_work_jobs_user_updated ON work_jobs(user_id,updated_at);
