CREATE TABLE `marketplace_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`proposal_digest` text NOT NULL,
	`decision` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketplace_approval_proposal` ON `marketplace_approvals` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_approval_user` ON `marketplace_approvals` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketplace_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`reference_price_minor` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_assets_created` ON `marketplace_assets` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_assets_user` ON `marketplace_assets` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketplace_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`subject_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_events_user` ON `marketplace_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_events_subject` ON `marketplace_events` (`subject_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketplace_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`side` text NOT NULL,
	`quantity` integer NOT NULL,
	`entry_price_minor` integer NOT NULL,
	`notional_minor` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketplace_position_proposal` ON `marketplace_positions` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_position_user` ON `marketplace_positions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketplace_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`side` text NOT NULL,
	`price_minor` integer NOT NULL,
	`quantity` integer NOT NULL,
	`mode` text NOT NULL,
	`expires_at` text NOT NULL,
	`notional_minor` integer NOT NULL,
	`request_json` text NOT NULL,
	`proposal_digest` text NOT NULL,
	`risk_json` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketplace_proposal_idempotency` ON `marketplace_proposals` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketplace_proposal_digest` ON `marketplace_proposals` (`proposal_digest`);--> statement-breakpoint
CREATE INDEX `idx_marketplace_proposal_user` ON `marketplace_proposals` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `marketplace_receipts` (
	`proposal_id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`execution_key` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketplace_receipt_id` ON `marketplace_receipts` (`receipt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_marketplace_execution_key` ON `marketplace_receipts` (`user_id`,`execution_key`);--> statement-breakpoint
CREATE TABLE `marketplace_reservations` (
	`proposal_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`held_minor` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_reservation_user` ON `marketplace_reservations` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER marketplace_approvals_no_update
BEFORE UPDATE ON marketplace_approvals
BEGIN SELECT RAISE(ABORT, 'marketplace approval immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_approvals_no_delete
BEFORE DELETE ON marketplace_approvals
BEGIN SELECT RAISE(ABORT, 'marketplace approval immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_receipts_no_update
BEFORE UPDATE ON marketplace_receipts
BEGIN SELECT RAISE(ABORT, 'marketplace receipt immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_receipts_no_delete
BEFORE DELETE ON marketplace_receipts
BEGIN SELECT RAISE(ABORT, 'marketplace receipt immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_events_no_update
BEFORE UPDATE ON marketplace_events
BEGIN SELECT RAISE(ABORT, 'marketplace event immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_events_no_delete
BEFORE DELETE ON marketplace_events
BEGIN SELECT RAISE(ABORT, 'marketplace event immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_proposal_binding_frozen
BEFORE UPDATE OF user_id,asset_id,side,price_minor,quantity,mode,expires_at,
  notional_minor,request_json,proposal_digest,risk_json,idempotency_key
ON marketplace_proposals
BEGIN SELECT RAISE(ABORT, 'marketplace proposal binding immutable'); END;
