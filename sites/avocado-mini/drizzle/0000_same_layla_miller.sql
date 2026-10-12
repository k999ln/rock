CREATE TABLE `preorder_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preorder_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`order_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preorder_stock` (
	`sku` text PRIMARY KEY NOT NULL,
	`capacity` integer NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preorders` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`amount_jpy` integer NOT NULL,
	`terms_snapshot_json` text NOT NULL,
	`status` text NOT NULL,
	`stripe_session_id` text,
	`stripe_payment_intent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preorders_stripe_session_id_unique` ON `preorders` (`stripe_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preorders_stripe_payment_intent_id_unique` ON `preorders` (`stripe_payment_intent_id`);