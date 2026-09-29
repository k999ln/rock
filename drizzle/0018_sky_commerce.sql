CREATE TABLE `sky_commerce_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_commerce_event_order` ON `sky_commerce_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sky_commerce_offers` (
	`package_key` text NOT NULL,
	`seller_user_id` text NOT NULL,
	`mode` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`revision` integer NOT NULL,
	`active` integer NOT NULL,
	`terms_url` text NOT NULL,
	`refund_policy` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_offer_package` ON `sky_commerce_offers` (`package_key`,`mode`);--> statement-breakpoint
CREATE TABLE `sky_commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_user_id` text NOT NULL,
	`seller_user_id` text NOT NULL,
	`mode` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`commission_minor` integer NOT NULL,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`account_id` text NOT NULL,
	`offer_revision` integer NOT NULL,
	`terms_url` text NOT NULL,
	`refund_policy` text NOT NULL,
	`status` text NOT NULL,
	`active_key` text,
	`session_id` text,
	`payment_intent_id` text,
	`checkout_url` text,
	`receipt_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_order_active` ON `sky_commerce_orders` (`active_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_order_session` ON `sky_commerce_orders` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_order_payment` ON `sky_commerce_orders` (`payment_intent_id`);--> statement-breakpoint
CREATE INDEX `idx_sky_commerce_order_buyer` ON `sky_commerce_orders` (`buyer_user_id`,`mode`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_commerce_order_seller` ON `sky_commerce_orders` (`seller_user_id`,`mode`,`created_at`);--> statement-breakpoint
CREATE TABLE `sky_commerce_sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`account_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_seller_owner` ON `sky_commerce_sellers` (`user_id`,`mode`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_seller_account` ON `sky_commerce_sellers` (`account_id`);
