CREATE TABLE `sky_compute_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`order_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`order_owner_user_id` text NOT NULL,
	`provider_owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`price_micros` integer NOT NULL,
	`state` text NOT NULL,
	`output_sha256` text,
	`output_bytes` integer,
	`output_ciphertext` text,
	`output_nonce` text,
	`detail_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "sky_compute_assignment_state_check" CHECK("sky_compute_assignments"."state" IN ('leased', 'submitted', 'verified', 'rejected', 'unverified', 'expired', 'released')),
	CONSTRAINT "sky_compute_assignment_price_check" CHECK("sky_compute_assignments"."price_micros" >= 0),
	CONSTRAINT "sky_compute_assignment_output_check" CHECK(("sky_compute_assignments"."output_sha256" IS NULL AND "sky_compute_assignments"."output_bytes" IS NULL) OR (length("sky_compute_assignments"."output_sha256") = 64 AND "sky_compute_assignments"."output_bytes" >= 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_compute_assignment_lease_lot` ON `sky_compute_assignments` (`lease_id`,`lot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_compute_assignment_device_once` ON `sky_compute_assignments` (`order_id`,`lot_id`,`provider_owner_user_id`,`device_ref`) WHERE "sky_compute_assignments"."state" NOT IN ('expired', 'released');--> statement-breakpoint
CREATE INDEX `idx_sky_compute_assignment_lot` ON `sky_compute_assignments` (`order_id`,`lot_id`,`state`);--> statement-breakpoint
CREATE TABLE `sky_compute_credit_accounts` (
	`owner_user_id` text PRIMARY KEY NOT NULL,
	`balance_micros` integer DEFAULT 0 NOT NULL,
	`held_micros` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "sky_compute_credit_account_check" CHECK("sky_compute_credit_accounts"."balance_micros" >= 0 AND "sky_compute_credit_accounts"."held_micros" >= 0 AND "sky_compute_credit_accounts"."held_micros" <= "sky_compute_credit_accounts"."balance_micros")
);
--> statement-breakpoint
CREATE TABLE `sky_compute_credit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`balance_delta_micros` integer NOT NULL,
	`held_delta_micros` integer NOT NULL,
	`order_id` text,
	`lease_id` text,
	`assignment_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "sky_compute_credit_entry_kind_check" CHECK(("sky_compute_credit_entries"."kind" = 'grant' AND "sky_compute_credit_entries"."balance_delta_micros" > 0 AND "sky_compute_credit_entries"."held_delta_micros" = 0) OR ("sky_compute_credit_entries"."kind" = 'hold' AND "sky_compute_credit_entries"."balance_delta_micros" = 0 AND "sky_compute_credit_entries"."held_delta_micros" > 0) OR ("sky_compute_credit_entries"."kind" = 'hold_release' AND "sky_compute_credit_entries"."balance_delta_micros" = 0 AND "sky_compute_credit_entries"."held_delta_micros" < 0) OR ("sky_compute_credit_entries"."kind" = 'spend' AND "sky_compute_credit_entries"."balance_delta_micros" < 0 AND "sky_compute_credit_entries"."held_delta_micros" = "sky_compute_credit_entries"."balance_delta_micros") OR ("sky_compute_credit_entries"."kind" = 'earn' AND "sky_compute_credit_entries"."balance_delta_micros" > 0 AND "sky_compute_credit_entries"."held_delta_micros" = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_compute_credit_entry_key` ON `sky_compute_credit_entries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_sky_compute_credit_entry_owner` ON `sky_compute_credit_entries` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sky_compute_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`order_owner_user_id` text NOT NULL,
	`provider_owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`key_id` text NOT NULL,
	`pool` text NOT NULL,
	`sku_id` text NOT NULL,
	`price_micros_per_lot` integer NOT NULL,
	`lot_count` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`closed_at` integer,
	CONSTRAINT "sky_compute_lease_state_check" CHECK("sky_compute_leases"."state" IN ('active', 'submitted', 'rejected', 'released', 'expired')),
	CONSTRAINT "sky_compute_lease_pool_check" CHECK(("sky_compute_leases"."pool" = 'owner' AND "sky_compute_leases"."order_owner_user_id" = "sky_compute_leases"."provider_owner_user_id" AND "sky_compute_leases"."price_micros_per_lot" = 0) OR ("sky_compute_leases"."pool" = 'public' AND "sky_compute_leases"."price_micros_per_lot" >= 0)),
	CONSTRAINT "sky_compute_lease_window_check" CHECK("sky_compute_leases"."expires_at" > "sky_compute_leases"."issued_at" AND "sky_compute_leases"."expires_at" - "sky_compute_leases"."issued_at" <= 600000 AND "sky_compute_leases"."lot_count" BETWEEN 0 AND 8),
	CONSTRAINT "sky_compute_lease_closed_check" CHECK(("sky_compute_leases"."state" = 'active') = ("sky_compute_leases"."closed_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_compute_lease_one_active_per_device` ON `sky_compute_leases` (`provider_owner_user_id`,`device_ref`) WHERE "sky_compute_leases"."state" = 'active';--> statement-breakpoint
CREATE INDEX `idx_sky_compute_lease_expiry` ON `sky_compute_leases` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_compute_lease_order` ON `sky_compute_leases` (`order_id`,`state`);--> statement-breakpoint
CREATE TABLE `sky_compute_lots` (
	`order_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`input_sha256` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`item_count` integer NOT NULL,
	`input_ciphertext` text,
	`input_nonce` text,
	`key_version` text NOT NULL,
	`state` text NOT NULL,
	`required_results` integer NOT NULL,
	`open_slots` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`verified_output_sha256` text,
	`verified_assignment_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`order_id`, `lot_id`),
	CONSTRAINT "sky_compute_lot_state_check" CHECK("sky_compute_lots"."state" IN ('queued', 'verified', 'failed', 'cancelled')),
	CONSTRAINT "sky_compute_lot_slot_check" CHECK("sky_compute_lots"."required_results" BETWEEN 1 AND 5 AND "sky_compute_lots"."open_slots" >= 0 AND "sky_compute_lots"."open_slots" <= "sky_compute_lots"."required_results" AND "sky_compute_lots"."attempts" >= 0),
	CONSTRAINT "sky_compute_lot_input_check" CHECK(length("sky_compute_lots"."input_sha256") = 64 AND "sky_compute_lots"."input_bytes" >= 1 AND "sky_compute_lots"."item_count" >= 1),
	CONSTRAINT "sky_compute_lot_closed_check" CHECK("sky_compute_lots"."state" = 'queued' OR "sky_compute_lots"."open_slots" = 0),
	CONSTRAINT "sky_compute_lot_verified_check" CHECK(("sky_compute_lots"."state" = 'verified') = ("sky_compute_lots"."verified_output_sha256" IS NOT NULL AND "sky_compute_lots"."verified_assignment_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_sky_compute_lot_queue` ON `sky_compute_lots` (`order_id`,`state`,`open_slots`);--> statement-breakpoint
CREATE TABLE `sky_compute_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`authority_id` text NOT NULL,
	`key_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`serves_owner_pool` integer NOT NULL,
	`serves_public_pool` integer NOT NULL,
	`provider_ref_hash` text NOT NULL,
	`provider_pseudonym` text NOT NULL,
	`platform` text NOT NULL,
	`abi` text NOT NULL,
	`region` text NOT NULL,
	`trust_tier` text NOT NULL,
	`runtime_artifact_sha256` text NOT NULL,
	`model_sha256` text NOT NULL,
	`tokenizer_sha256` text NOT NULL,
	`memory_mib` integer NOT NULL,
	`max_lots_per_lease` integer NOT NULL,
	`price_micros_per_lot` integer NOT NULL,
	`max_input_bytes_per_lot` integer NOT NULL,
	`data_classes_json` text NOT NULL,
	`available_from` integer NOT NULL,
	`available_until` integer NOT NULL,
	`state` text NOT NULL,
	`conditions_json` text,
	`conditions_observed_at` integer,
	`verified_lots` integer DEFAULT 0 NOT NULL,
	`rejected_lots` integer DEFAULT 0 NOT NULL,
	`expired_leases` integer DEFAULT 0 NOT NULL,
	`released_leases` integer DEFAULT 0 NOT NULL,
	`signed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "sky_compute_offer_state_check" CHECK("sky_compute_offers"."state" IN ('active', 'withdrawn')),
	CONSTRAINT "sky_compute_offer_pool_check" CHECK("sky_compute_offers"."serves_owner_pool" IN (0, 1) AND "sky_compute_offers"."serves_public_pool" IN (0, 1) AND "sky_compute_offers"."serves_owner_pool" + "sky_compute_offers"."serves_public_pool" >= 1),
	CONSTRAINT "sky_compute_offer_platform_check" CHECK("sky_compute_offers"."platform" = 'android' AND "sky_compute_offers"."abi" = 'arm64-v8a'),
	CONSTRAINT "sky_compute_offer_trust_check" CHECK("sky_compute_offers"."trust_tier" = 'hardware_backed'),
	CONSTRAINT "sky_compute_offer_digest_check" CHECK(length("sky_compute_offers"."provider_ref_hash") = 64 AND length("sky_compute_offers"."key_id") = 64 AND length("sky_compute_offers"."runtime_artifact_sha256") = 64 AND length("sky_compute_offers"."model_sha256") = 64 AND length("sky_compute_offers"."tokenizer_sha256") = 64),
	CONSTRAINT "sky_compute_offer_bounds_check" CHECK("sky_compute_offers"."memory_mib" >= 1 AND "sky_compute_offers"."max_lots_per_lease" BETWEEN 1 AND 8 AND "sky_compute_offers"."price_micros_per_lot" >= 0 AND "sky_compute_offers"."max_input_bytes_per_lot" >= 1 AND "sky_compute_offers"."available_until" > "sky_compute_offers"."available_from"),
	CONSTRAINT "sky_compute_offer_counter_check" CHECK("sky_compute_offers"."verified_lots" >= 0 AND "sky_compute_offers"."rejected_lots" >= 0 AND "sky_compute_offers"."expired_leases" >= 0 AND "sky_compute_offers"."released_leases" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_compute_offer_device_sku` ON `sky_compute_offers` (`owner_user_id`,`device_ref`,`sku_id`);--> statement-breakpoint
CREATE INDEX `idx_sky_compute_offer_state` ON `sky_compute_offers` (`state`,`sku_id`);--> statement-breakpoint
CREATE TABLE `sky_compute_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`pool` text NOT NULL,
	`sku_id` text NOT NULL,
	`data_class` text NOT NULL,
	`runtime_artifact_sha256` text NOT NULL,
	`model_sha256` text NOT NULL,
	`tokenizer_sha256` text NOT NULL,
	`regions_json` text NOT NULL,
	`minimum_memory_mib` integer NOT NULL,
	`maximum_price_micros_per_lot` integer NOT NULL,
	`budget_micros` integer NOT NULL,
	`reserved_micros` integer DEFAULT 0 NOT NULL,
	`settled_micros` integer DEFAULT 0 NOT NULL,
	`sky_fee_bps` integer DEFAULT 0 NOT NULL,
	`validation_method` text NOT NULL,
	`quorum` integer NOT NULL,
	`deadline_at` integer NOT NULL,
	`state` text NOT NULL,
	`lot_count` integer NOT NULL,
	`verified_lots` integer DEFAULT 0 NOT NULL,
	`failed_lots` integer DEFAULT 0 NOT NULL,
	`request_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer,
	`purged_at` integer,
	CONSTRAINT "sky_compute_order_pool_check" CHECK("sky_compute_orders"."pool" IN ('owner', 'public')),
	CONSTRAINT "sky_compute_order_data_check" CHECK("sky_compute_orders"."data_class" IN ('public', 'synthetic', 'owner_private') AND ("sky_compute_orders"."data_class" <> 'owner_private' OR "sky_compute_orders"."pool" = 'owner')),
	CONSTRAINT "sky_compute_order_validation_check" CHECK(("sky_compute_orders"."validation_method" = 'owner_trust' AND "sky_compute_orders"."pool" = 'owner' AND "sky_compute_orders"."quorum" = 1) OR ("sky_compute_orders"."validation_method" = 'independent_reference' AND "sky_compute_orders"."quorum" = 1) OR ("sky_compute_orders"."validation_method" = 'duplicate_quorum' AND "sky_compute_orders"."quorum" IN (2, 3))),
	CONSTRAINT "sky_compute_order_state_check" CHECK("sky_compute_orders"."state" IN ('open', 'completed', 'completed_with_failures', 'cancelled', 'expired')),
	CONSTRAINT "sky_compute_order_budget_check" CHECK("sky_compute_orders"."budget_micros" >= 0 AND "sky_compute_orders"."maximum_price_micros_per_lot" >= 0 AND "sky_compute_orders"."reserved_micros" >= 0 AND "sky_compute_orders"."settled_micros" >= 0 AND "sky_compute_orders"."reserved_micros" + "sky_compute_orders"."settled_micros" <= "sky_compute_orders"."budget_micros"),
	CONSTRAINT "sky_compute_order_owner_pool_free_check" CHECK("sky_compute_orders"."pool" <> 'owner' OR ("sky_compute_orders"."budget_micros" = 0 AND "sky_compute_orders"."maximum_price_micros_per_lot" = 0)),
	CONSTRAINT "sky_compute_order_fee_check" CHECK("sky_compute_orders"."sky_fee_bps" = 0),
	CONSTRAINT "sky_compute_order_lot_check" CHECK("sky_compute_orders"."lot_count" BETWEEN 1 AND 64 AND "sky_compute_orders"."verified_lots" >= 0 AND "sky_compute_orders"."failed_lots" >= 0 AND "sky_compute_orders"."verified_lots" + "sky_compute_orders"."failed_lots" <= "sky_compute_orders"."lot_count"),
	CONSTRAINT "sky_compute_order_closed_check" CHECK(("sky_compute_orders"."state" = 'open' AND "sky_compute_orders"."closed_at" IS NULL) OR ("sky_compute_orders"."state" <> 'open' AND "sky_compute_orders"."closed_at" IS NOT NULL AND "sky_compute_orders"."reserved_micros" = 0)),
	CONSTRAINT "sky_compute_order_digest_check" CHECK(length("sky_compute_orders"."request_sha256") = 64 AND length("sky_compute_orders"."runtime_artifact_sha256") = 64 AND length("sky_compute_orders"."model_sha256") = 64 AND length("sky_compute_orders"."tokenizer_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_sky_compute_order_owner` ON `sky_compute_orders` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_compute_order_open` ON `sky_compute_orders` (`state`,`sku_id`,`deadline_at`);--> statement-breakpoint
CREATE TABLE `sky_compute_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`provider_owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`key_id` text NOT NULL,
	`payload` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`signature` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`outcome_json` text NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT "sky_compute_receipt_outcome_check" CHECK("sky_compute_receipts"."outcome" IN ('accepted', 'rejected')),
	CONSTRAINT "sky_compute_receipt_digest_check" CHECK(length("sky_compute_receipts"."payload_sha256") = 64 AND length("sky_compute_receipts"."key_id") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_compute_receipt_lease` ON `sky_compute_receipts` (`lease_id`);
--> statement-breakpoint
-- Guards and bookkeeping below are part of the Compute Grid contract: the store
-- issues plain INSERT/UPDATE statements (never OR IGNORE / OR REPLACE), and a
-- violated guard aborts the whole D1 batch.
CREATE TRIGGER `sky_compute_assignment_guard_insert`
BEFORE INSERT ON `sky_compute_assignments`
BEGIN
  SELECT CASE WHEN NEW.`state` <> 'leased' OR NEW.`output_sha256` IS NOT NULL
    THEN RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_STATE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `sky_compute_leases` l
    WHERE l.`id` = NEW.`lease_id` AND l.`state` = 'active' AND l.`order_id` = NEW.`order_id`
      AND l.`order_owner_user_id` = NEW.`order_owner_user_id`
      AND l.`provider_owner_user_id` = NEW.`provider_owner_user_id`
      AND l.`device_ref` = NEW.`device_ref` AND l.`price_micros_per_lot` = NEW.`price_micros`
  ) THEN RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_LEASE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `sky_compute_lots` t JOIN `sky_compute_orders` o ON o.`id` = t.`order_id`
    WHERE t.`order_id` = NEW.`order_id` AND t.`lot_id` = NEW.`lot_id` AND t.`state` = 'queued'
      AND t.`open_slots` > 0 AND o.`state` = 'open' AND o.`owner_user_id` = NEW.`order_owner_user_id`
  ) THEN RAISE(ABORT, 'SKY_COMPUTE_LOT_NOT_ASSIGNABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_assignment_after_insert`
AFTER INSERT ON `sky_compute_assignments`
BEGIN
  UPDATE `sky_compute_lots`
  SET `open_slots` = `open_slots` - 1, `updated_at` = NEW.`created_at`
  WHERE `order_id` = NEW.`order_id` AND `lot_id` = NEW.`lot_id`;
  UPDATE `sky_compute_orders`
  SET `reserved_micros` = `reserved_micros` + NEW.`price_micros`, `updated_at` = NEW.`created_at`
  WHERE `id` = NEW.`order_id`;
  UPDATE `sky_compute_leases` SET `lot_count` = `lot_count` + 1 WHERE `id` = NEW.`lease_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_assignment_guard_update`
BEFORE UPDATE ON `sky_compute_assignments`
BEGIN
  SELECT CASE WHEN NEW.`id` <> OLD.`id` OR NEW.`lease_id` <> OLD.`lease_id`
      OR NEW.`order_id` <> OLD.`order_id` OR NEW.`lot_id` <> OLD.`lot_id`
      OR NEW.`order_owner_user_id` <> OLD.`order_owner_user_id`
      OR NEW.`provider_owner_user_id` <> OLD.`provider_owner_user_id`
      OR NEW.`device_ref` <> OLD.`device_ref` OR NEW.`price_micros` <> OLD.`price_micros`
    THEN RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_BINDING_FROZEN') END;
  SELECT CASE WHEN NEW.`state` <> OLD.`state` AND NOT (
      (OLD.`state` = 'leased' AND NEW.`state` IN ('submitted', 'verified', 'rejected', 'expired', 'released'))
      OR (OLD.`state` = 'submitted' AND NEW.`state` IN ('verified', 'rejected', 'unverified'))
    ) THEN RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_TRANSITION') END;
  SELECT CASE WHEN NEW.`state` IN ('submitted', 'verified') AND NEW.`output_sha256` IS NULL
    THEN RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_OUTPUT_REQUIRED') END;
  SELECT CASE WHEN OLD.`output_sha256` IS NOT NULL AND (NEW.`output_sha256` IS NULL
      OR NEW.`output_sha256` <> OLD.`output_sha256` OR NEW.`output_bytes` <> OLD.`output_bytes`)
    THEN RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_OUTPUT_FROZEN') END;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_assignments_no_delete`
BEFORE DELETE ON `sky_compute_assignments`
BEGIN
  SELECT RAISE(ABORT, 'SKY_COMPUTE_ASSIGNMENT_NO_DELETE');
END;
--> statement-breakpoint
-- A result that is lost or refused gives its reservation back and, while the
-- lot still waits for results, reopens the slot for another device. Only a
-- lease that ran out or a refused result counts as a failed attempt; a device
-- that hands a lot back because its owner picked it up does not.
CREATE TRIGGER `sky_compute_assignment_reservation_release`
AFTER UPDATE OF `state` ON `sky_compute_assignments`
WHEN OLD.`state` IN ('leased', 'submitted')
  AND NEW.`state` IN ('rejected', 'unverified', 'expired', 'released')
BEGIN
  UPDATE `sky_compute_orders`
  SET `reserved_micros` = `reserved_micros` - OLD.`price_micros`, `updated_at` = NEW.`updated_at`
  WHERE `id` = OLD.`order_id`;
  UPDATE `sky_compute_lots`
  SET `open_slots` = `open_slots` + 1,
      `attempts` = `attempts` + CASE WHEN NEW.`state` IN ('expired', 'rejected') THEN 1 ELSE 0 END,
      `updated_at` = NEW.`updated_at`
  WHERE `order_id` = OLD.`order_id` AND `lot_id` = OLD.`lot_id` AND `state` = 'queued'
    AND NEW.`state` <> 'unverified';
  UPDATE `sky_compute_offers`
  SET `rejected_lots` = `rejected_lots` + 1
  WHERE NEW.`state` = 'rejected'
    AND `id` = (SELECT l.`offer_id` FROM `sky_compute_leases` l WHERE l.`id` = OLD.`lease_id`);
END;
--> statement-breakpoint
-- The only place a verified lot becomes a spend and an earning. It fires once
-- per assignment, because the transition guard never lets `verified` be left.
CREATE TRIGGER `sky_compute_assignment_settle`
AFTER UPDATE OF `state` ON `sky_compute_assignments`
WHEN OLD.`state` IN ('leased', 'submitted') AND NEW.`state` = 'verified'
BEGIN
  UPDATE `sky_compute_orders`
  SET `reserved_micros` = `reserved_micros` - OLD.`price_micros`,
      `settled_micros` = `settled_micros` + OLD.`price_micros`,
      `updated_at` = NEW.`updated_at`
  WHERE `id` = OLD.`order_id`;
  INSERT INTO `sky_compute_credit_entries`
    (`id`, `owner_user_id`, `kind`, `balance_delta_micros`, `held_delta_micros`,
     `order_id`, `lease_id`, `assignment_id`, `idempotency_key`, `created_at`)
  SELECT 'spend:' || OLD.`id`, OLD.`order_owner_user_id`, 'spend', -OLD.`price_micros`,
    -OLD.`price_micros`, OLD.`order_id`, OLD.`lease_id`, OLD.`id`, 'spend:' || OLD.`id`, NEW.`updated_at`
  WHERE OLD.`price_micros` > 0;
  INSERT INTO `sky_compute_credit_entries`
    (`id`, `owner_user_id`, `kind`, `balance_delta_micros`, `held_delta_micros`,
     `order_id`, `lease_id`, `assignment_id`, `idempotency_key`, `created_at`)
  SELECT 'earn:' || OLD.`id`, OLD.`provider_owner_user_id`, 'earn', OLD.`price_micros`,
    0, OLD.`order_id`, OLD.`lease_id`, OLD.`id`, 'earn:' || OLD.`id`, NEW.`updated_at`
  WHERE OLD.`price_micros` > 0;
  UPDATE `sky_compute_offers`
  SET `verified_lots` = `verified_lots` + 1
  WHERE `id` = (SELECT l.`offer_id` FROM `sky_compute_leases` l WHERE l.`id` = OLD.`lease_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_credit_entry_apply`
AFTER INSERT ON `sky_compute_credit_entries`
BEGIN
  INSERT INTO `sky_compute_credit_accounts`
    (`owner_user_id`, `balance_micros`, `held_micros`, `revision`, `updated_at`)
  SELECT NEW.`owner_user_id`, 0, 0, 0, NEW.`created_at`
  WHERE NOT EXISTS (SELECT 1 FROM `sky_compute_credit_accounts` a WHERE a.`owner_user_id` = NEW.`owner_user_id`);
  UPDATE `sky_compute_credit_accounts`
  SET `balance_micros` = `balance_micros` + NEW.`balance_delta_micros`,
      `held_micros` = `held_micros` + NEW.`held_delta_micros`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`created_at`
  WHERE `owner_user_id` = NEW.`owner_user_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_credit_entries_no_update`
BEFORE UPDATE ON `sky_compute_credit_entries`
BEGIN
  SELECT RAISE(ABORT, 'SKY_COMPUTE_CREDIT_ENTRY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_credit_entries_no_delete`
BEFORE DELETE ON `sky_compute_credit_entries`
BEGIN
  SELECT RAISE(ABORT, 'SKY_COMPUTE_CREDIT_ENTRY_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_lease_guard_update`
BEFORE UPDATE ON `sky_compute_leases`
BEGIN
  SELECT CASE WHEN NEW.`id` <> OLD.`id` OR NEW.`order_id` <> OLD.`order_id`
      OR NEW.`offer_id` <> OLD.`offer_id` OR NEW.`order_owner_user_id` <> OLD.`order_owner_user_id`
      OR NEW.`provider_owner_user_id` <> OLD.`provider_owner_user_id`
      OR NEW.`device_ref` <> OLD.`device_ref` OR NEW.`key_id` <> OLD.`key_id`
      OR NEW.`pool` <> OLD.`pool` OR NEW.`sku_id` <> OLD.`sku_id`
      OR NEW.`price_micros_per_lot` <> OLD.`price_micros_per_lot`
      OR NEW.`issued_at` <> OLD.`issued_at` OR NEW.`expires_at` <> OLD.`expires_at`
    THEN RAISE(ABORT, 'SKY_COMPUTE_LEASE_BINDING_FROZEN') END;
  SELECT CASE WHEN NEW.`state` <> OLD.`state` AND OLD.`state` <> 'active'
    THEN RAISE(ABORT, 'SKY_COMPUTE_LEASE_TRANSITION') END;
END;
--> statement-breakpoint
-- Closing a lease without a usable receipt hands every lot it still held back.
CREATE TRIGGER `sky_compute_lease_close`
AFTER UPDATE OF `state` ON `sky_compute_leases`
WHEN OLD.`state` = 'active' AND NEW.`state` IN ('expired', 'released', 'rejected')
BEGIN
  UPDATE `sky_compute_assignments`
  SET `state` = NEW.`state`, `updated_at` = NEW.`closed_at`
  WHERE `lease_id` = NEW.`id` AND `state` = 'leased';
  UPDATE `sky_compute_offers`
  SET `expired_leases` = `expired_leases` + 1
  WHERE NEW.`state` = 'expired' AND `id` = NEW.`offer_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_lot_guard_update`
BEFORE UPDATE ON `sky_compute_lots`
BEGIN
  SELECT CASE WHEN NEW.`order_id` <> OLD.`order_id` OR NEW.`lot_id` <> OLD.`lot_id`
      OR NEW.`owner_user_id` <> OLD.`owner_user_id` OR NEW.`input_sha256` <> OLD.`input_sha256`
      OR NEW.`input_bytes` <> OLD.`input_bytes` OR NEW.`item_count` <> OLD.`item_count`
    THEN RAISE(ABORT, 'SKY_COMPUTE_LOT_BINDING_FROZEN') END;
  SELECT CASE WHEN NEW.`state` <> OLD.`state` AND OLD.`state` <> 'queued'
    THEN RAISE(ABORT, 'SKY_COMPUTE_LOT_TRANSITION') END;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_lot_closed`
AFTER UPDATE OF `state` ON `sky_compute_lots`
WHEN OLD.`state` = 'queued' AND NEW.`state` IN ('verified', 'failed', 'cancelled')
BEGIN
  UPDATE `sky_compute_orders`
  SET `verified_lots` = `verified_lots` + CASE WHEN NEW.`state` = 'verified' THEN 1 ELSE 0 END,
      `failed_lots` = `failed_lots` + CASE WHEN NEW.`state` = 'verified' THEN 0 ELSE 1 END,
      `updated_at` = NEW.`updated_at`
  WHERE `id` = NEW.`order_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_order_guard_update`
BEFORE UPDATE ON `sky_compute_orders`
BEGIN
  SELECT CASE WHEN NEW.`id` <> OLD.`id` OR NEW.`owner_user_id` <> OLD.`owner_user_id`
      OR NEW.`pool` <> OLD.`pool` OR NEW.`sku_id` <> OLD.`sku_id`
      OR NEW.`data_class` <> OLD.`data_class`
      OR NEW.`runtime_artifact_sha256` <> OLD.`runtime_artifact_sha256`
      OR NEW.`model_sha256` <> OLD.`model_sha256`
      OR NEW.`tokenizer_sha256` <> OLD.`tokenizer_sha256`
      OR NEW.`maximum_price_micros_per_lot` <> OLD.`maximum_price_micros_per_lot`
      OR NEW.`budget_micros` <> OLD.`budget_micros`
      OR NEW.`validation_method` <> OLD.`validation_method` OR NEW.`quorum` <> OLD.`quorum`
      OR NEW.`deadline_at` <> OLD.`deadline_at` OR NEW.`lot_count` <> OLD.`lot_count`
      OR NEW.`request_sha256` <> OLD.`request_sha256`
    THEN RAISE(ABORT, 'SKY_COMPUTE_ORDER_BINDING_FROZEN') END;
  SELECT CASE WHEN NEW.`state` <> OLD.`state` AND OLD.`state` <> 'open'
    THEN RAISE(ABORT, 'SKY_COMPUTE_ORDER_TRANSITION') END;
  SELECT CASE WHEN OLD.`state` <> 'open' AND NEW.`settled_micros` <> OLD.`settled_micros`
    THEN RAISE(ABORT, 'SKY_COMPUTE_ORDER_CLOSED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_receipts_no_update`
BEFORE UPDATE ON `sky_compute_receipts`
BEGIN
  SELECT RAISE(ABORT, 'SKY_COMPUTE_RECEIPT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `sky_compute_receipts_no_delete`
BEFORE DELETE ON `sky_compute_receipts`
BEGIN
  SELECT RAISE(ABORT, 'SKY_COMPUTE_RECEIPT_IMMUTABLE');
END;
