CREATE TABLE `a2a_usage_receipts` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_reference` text NOT NULL,
	`receipt_json` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_usage_provider_reference` ON `a2a_usage_receipts` (`provider_id`,`provider_reference`);--> statement-breakpoint
CREATE INDEX `idx_a2a_usage_owner_parent` ON `a2a_usage_receipts` (`owner_user_id`,`parent_job_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `agent_delegation_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`delegation_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`remote_task_id` text NOT NULL,
	`artifact_sha256` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`key_version` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_artifact_identity` ON `agent_delegation_artifacts` (`owner_user_id`,`delegation_id`,`remote_task_id`,`artifact_sha256`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_artifact_owner` ON `agent_delegation_artifacts` (`owner_user_id`,`delegation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_delegation_broker_authorizations` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`authority_id` text NOT NULL,
	`key_id` text NOT NULL,
	`proof_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_a2a_broker_auth_owner` ON `agent_delegation_broker_authorizations` (`owner_user_id`,`delegation_id`);--> statement-breakpoint
CREATE INDEX `idx_a2a_broker_auth_expiry` ON `agent_delegation_broker_authorizations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_delegation_budget_pools` (
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`currency` text NOT NULL,
	`budget_limit_minor` integer NOT NULL,
	`reserved_minor` integer DEFAULT 0 NOT NULL,
	`settled_minor` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_budget_pool_owner_parent` ON `agent_delegation_budget_pools` (`owner_user_id`,`parent_job_id`);--> statement-breakpoint
CREATE TABLE `agent_delegation_budget_reservations` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`currency` text NOT NULL,
	`reserved_minor` integer NOT NULL,
	`settled_minor` integer,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_a2a_budget_reservation_parent` ON `agent_delegation_budget_reservations` (`owner_user_id`,`parent_job_id`,`state`);--> statement-breakpoint
CREATE TABLE `agent_delegation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`delegation_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`event_type` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`remote_state` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_event_revision` ON `agent_delegation_events` (`delegation_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_event_owner` ON `agent_delegation_events` (`owner_user_id`,`delegation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_delegation_inputs` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`input_sha256` text NOT NULL,
	`key_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_input_owner_expiry` ON `agent_delegation_inputs` (`owner_user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `agent_delegations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`message_id` text NOT NULL,
	`target_origin` text NOT NULL,
	`target_agent_name` text NOT NULL,
	`target_agent_version` text NOT NULL,
	`protocol_version` text NOT NULL,
	`input_sha256` text NOT NULL,
	`authorization_sha256` text NOT NULL,
	`budget_currency` text NOT NULL,
	`budget_limit_minor` integer NOT NULL,
	`parent_budget_limit_minor` integer DEFAULT 0 NOT NULL,
	`deadline_at` integer NOT NULL,
	`state` text NOT NULL,
	`remote_task_id` text,
	`remote_context_id` text,
	`remote_state` text,
	`artifacts_captured` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_owner_key` ON `agent_delegations` (`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_owner_message` ON `agent_delegations` (`owner_user_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_parent_created` ON `agent_delegations` (`owner_user_id`,`parent_job_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_reconcile` ON `agent_delegations` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `automation_fund_memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`fund_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`joined_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_fund_memberships_fund` ON `automation_fund_memberships` (`fund_id`);--> statement-breakpoint
CREATE TABLE `automation_funds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`strategy` text NOT NULL,
	`target_tool_count` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_funds_user_updated` ON `automation_funds` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_funds_user_idempotency` ON `automation_funds` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `book_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`source` text NOT NULL,
	`occurred_on` text NOT NULL,
	`reverses_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_book_user_created` ON `book_records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_book_reversal` ON `book_records` (`reverses_id`);--> statement-breakpoint
CREATE TABLE `coconala_team_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coconala_team_user_updated` ON `coconala_team_cases` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `csv_billing_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`billing_account_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `csv_job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`event` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_csv_events_job` ON `csv_job_events` (`job_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_csv_events_user` ON `csv_job_events` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `csv_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`payment_status` text NOT NULL,
	`payment_method` text,
	`payment_reference` text,
	`input_name` text NOT NULL,
	`input_key` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`input_sha256` text NOT NULL,
	`input_encoding` text NOT NULL,
	`specification_json` text NOT NULL,
	`quote_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`result_key` text,
	`safe_result_key` text,
	`report_json_key` text,
	`report_html_key` text,
	`output_sha256` text,
	`validation_json` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`accepted_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_csv_jobs_user_updated` ON `csv_jobs` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_csv_jobs_status_updated` ON `csv_jobs` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_jobs_input_key` ON `csv_jobs` (`input_key`);--> statement-breakpoint
CREATE TABLE `csv_monthly_fees` (
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
CREATE UNIQUE INDEX `idx_csv_fee_account_month` ON `csv_monthly_fees` (`billing_account_id`,`month_jst`);--> statement-breakpoint
CREATE TABLE `csv_trial_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`mode` text NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_trial_session` ON `csv_trial_payments` (`session_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_devices_user_seen` ON `devices` (`user_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `esim_provider_orders` (
	`sky_order_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`pricing_snapshot_json` text NOT NULL,
	`pricing_snapshot_sha256` text NOT NULL,
	`provider_bundle_name` text NOT NULL,
	`quote_digest` text NOT NULL,
	`quote_total` text NOT NULL,
	`quote_currency` text NOT NULL,
	`state` text NOT NULL,
	`provider_order_reference` text,
	`profile_digest` text,
	`install_material_ciphertext` text,
	`install_material_nonce` text,
	`install_material_delivery_key_hash` text,
	`install_material_delivered_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "esim_provider_orders_provider_check" CHECK("esim_provider_orders"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_provider_orders_manifest_check" CHECK(length("esim_provider_orders"."manifest_sha256") = 64),
	CONSTRAINT "esim_provider_orders_quote_check" CHECK(length("esim_provider_orders"."quote_digest") = 64),
	CONSTRAINT "esim_provider_orders_state_check" CHECK("esim_provider_orders"."state" IN ('dispatch_started', 'reconciliation_required', 'provider_completed', 'profile_bound')),
	CONSTRAINT "esim_provider_orders_profile_digest_check" CHECK("esim_provider_orders"."profile_digest" IS NULL OR length("esim_provider_orders"."profile_digest") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_provider_order_reference` ON `esim_provider_orders` (`provider`,`provider_order_reference`);--> statement-breakpoint
CREATE INDEX `idx_esim_provider_orders_owner` ON `esim_provider_orders` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `esim_provider_profile_bindings` (
	`profile_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`sky_order_id` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "esim_profile_binding_provider_check" CHECK("esim_provider_profile_bindings"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_profile_binding_digest_check" CHECK(length("esim_provider_profile_bindings"."profile_digest") = 64),
	CONSTRAINT "esim_profile_binding_manifest_check" CHECK(length("esim_provider_profile_bindings"."manifest_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_profile_binding_order` ON `esim_provider_profile_bindings` (`provider`,`sky_order_id`);--> statement-breakpoint
CREATE INDEX `idx_esim_profile_binding_owner` ON `esim_provider_profile_bindings` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `esim_provider_webhook_inbox` (
	`callback_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL,
	`state` text NOT NULL,
	`profile_digest` text,
	`install_material_ciphertext` text,
	`install_material_nonce` text,
	`install_material_delivery_key_hash` text,
	`install_material_delivered_at` integer,
	`owner_user_id` text,
	`sky_order_id` text,
	CONSTRAINT "esim_webhook_provider_check" CHECK("esim_provider_webhook_inbox"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_webhook_state_check" CHECK("esim_provider_webhook_inbox"."state" IN ('received', 'reconciliation_required')),
	CONSTRAINT "esim_webhook_digest_check" CHECK(length("esim_provider_webhook_inbox"."callback_digest") = 64),
	CONSTRAINT "esim_webhook_profile_digest_check" CHECK("esim_provider_webhook_inbox"."profile_digest" IS NULL OR length("esim_provider_webhook_inbox"."profile_digest") = 64),
	CONSTRAINT "esim_webhook_owner_order_pair_check" CHECK(("esim_provider_webhook_inbox"."owner_user_id" IS NULL) = ("esim_provider_webhook_inbox"."sky_order_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_state_received` ON `esim_provider_webhook_inbox` (`state`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_order` ON `esim_provider_webhook_inbox` (`sky_order_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `fund_plans` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_job_status` ON `job_events` (`job_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_events_user` ON `job_events` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`transport` text NOT NULL,
	`sample` integer NOT NULL,
	`status` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`output_bytes` integer,
	`duration_ms` integer,
	`error_code` text,
	`device_id` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`deadline` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_user_created` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_jobs_one_active_user` ON `jobs` (`user_id`) WHERE "jobs"."status" IN ('queued', 'running');--> statement-breakpoint
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
CREATE INDEX `idx_marketplace_reservation_user` ON `marketplace_reservations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `mercari_revenue_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mercari_revenue_user_updated` ON `mercari_revenue_plans` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `sky_remote_ai_rate_limits` (
	`user_id` text NOT NULL,
	`route` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_rate_limits_user_route` ON `sky_remote_ai_rate_limits` (`user_id`,`route`);--> statement-breakpoint
CREATE INDEX `idx_remote_ai_rate_limits_window` ON `sky_remote_ai_rate_limits` (`window_started_at`);--> statement-breakpoint
CREATE TABLE `sky_a2a_agent_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`origin` text NOT NULL,
	`card_url` text NOT NULL,
	`agent_name` text NOT NULL,
	`agent_version` text NOT NULL,
	`card_sha256` text NOT NULL,
	`card_json` text NOT NULL,
	`discovered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_a2a_agent_owner_origin_name` ON `sky_a2a_agent_connections` (`owner_user_id`,`origin`,`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_sky_a2a_agent_owner_discovered` ON `sky_a2a_agent_connections` (`owner_user_id`,`discovered_at`);--> statement-breakpoint
CREATE TABLE `sky_activation_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`code_sha256` text NOT NULL,
	`max_uses` integer NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_activation_code_hash` ON `sky_activation_codes` (`code_sha256`);--> statement-breakpoint
CREATE INDEX `idx_sky_activation_owner_created` ON `sky_activation_codes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_activation_package_status` ON `sky_activation_codes` (`package_key`,`status`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_sky_commerce_seller_account` ON `sky_commerce_sellers` (`account_id`);--> statement-breakpoint
CREATE TABLE `sky_connections` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`scope` text DEFAULT 'execute' NOT NULL,
	`consent_version` text NOT NULL,
	`connected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_connections_user_tool` ON `sky_connections` (`user_id`,`tool`);--> statement-breakpoint
CREATE INDEX `idx_sky_connections_user_connected` ON `sky_connections` (`user_id`,`connected_at`);--> statement-breakpoint
CREATE TABLE `sky_developer_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`token_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_developer_token_hash` ON `sky_developer_tokens` (`token_sha256`);--> statement-breakpoint
CREATE INDEX `idx_sky_developer_token_owner` ON `sky_developer_tokens` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sky_provider_connections` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'setup_required' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`secret_ref` text,
	`connected_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_provider_connections_user_provider` ON `sky_provider_connections` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_sky_provider_connections_user_updated` ON `sky_provider_connections` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `sky_tool_events` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`installation_id` text NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_tool_events_owner_time` ON `sky_tool_events` (`owner_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_events_package_time` ON `sky_tool_events` (`package_key`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `sky_tool_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`activation_code_id` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`telegram_chat_id` text NOT NULL,
	`bot_username` text,
	`status` text DEFAULT 'active' NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_grant_package_telegram` ON `sky_tool_grants` (`package_key`,`telegram_user_id`);--> statement-breakpoint
CREATE INDEX `idx_sky_grant_telegram_status` ON `sky_tool_grants` (`telegram_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sky_grant_code` ON `sky_tool_grants` (`activation_code_id`);--> statement-breakpoint
CREATE TABLE `sky_tool_package_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`source_revision` text,
	`source_sha256` text,
	`checks_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`notes` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_sky_tool_reviews_package_time` ON `sky_tool_package_reviews` (`package_key`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_reviews_decision_expiry` ON `sky_tool_package_reviews` (`decision`,`expires_at`);--> statement-breakpoint
CREATE TABLE `sky_tool_packages` (
	`package_key` text PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`version` text NOT NULL,
	`user_id` text NOT NULL,
	`manifest` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_tool_id_version` ON `sky_tool_packages` (`tool_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_owner_created` ON `sky_tool_packages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sky_tool_registry_published` ON `sky_tool_packages` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `sky_tool_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sky_submissions_user_created` ON `sky_tool_submissions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tool_controls` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_controls_user_tool` ON `tool_controls` (`user_id`,`tool`);--> statement-breakpoint
CREATE TABLE `tool_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`sample` integer DEFAULT false NOT NULL,
	`transport` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_runs_user_created` ON `tool_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_work_jobs_user_updated` ON `work_jobs` (`user_id`,`updated_at`);