-- Site v49 (e95e63a) compatibility bridge. Existing 17 migrations stay immutable.
-- New objects retain the final primary SQL constraints/triggers; no deployed table is rebuilt.
-- See tests/fixtures/site-migration-reference/manifest.json for original sources and hashes.
CREATE TABLE `a2a_live_usage_snapshots` (
  `delegation_id` text NOT NULL,
  `sequence` integer NOT NULL CHECK (`sequence` > 0),
  `owner_user_id` text NOT NULL,
  `parent_job_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `provider_event_id` text NOT NULL,
  `snapshot_json` text NOT NULL,
  `currency` text NOT NULL,
  `cumulative_amount_minor` integer NOT NULL CHECK (`cumulative_amount_minor` >= 0),
  `pricing_version` text NOT NULL,
  `issued_at` integer NOT NULL,
  `received_at` integer NOT NULL,
  PRIMARY KEY (`delegation_id`, `sequence`)
);
--> statement-breakpoint
CREATE TABLE `a2a_price_quote_consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`quote_request_id` text NOT NULL,
	`agent_connection_id` text NOT NULL,
	`agent_origin` text NOT NULL,
	`agent_name` text NOT NULL,
	`agent_version` text NOT NULL,
	`agent_card_sha256` text NOT NULL,
	`prompt_sha256` text NOT NULL,
	`currency` text NOT NULL,
	`maximum_budget_minor` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	CONSTRAINT "a2a_quote_consent_hash_check" CHECK(length("a2a_price_quote_consent_events"."agent_card_sha256") = 64 AND length("a2a_price_quote_consent_events"."prompt_sha256") = 64),
	CONSTRAINT "a2a_quote_consent_currency_check" CHECK("a2a_price_quote_consent_events"."currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "a2a_quote_consent_budget_check" CHECK("a2a_price_quote_consent_events"."maximum_budget_minor" > 0 AND "a2a_price_quote_consent_events"."maximum_budget_minor" <= 100000000),
	CONSTRAINT "a2a_quote_consent_version_check" CHECK("a2a_price_quote_consent_events"."consent_version" = 'a2a-price-quote-prompt-disclosure-v1')
);
--> statement-breakpoint
CREATE TABLE `a2a_usage_receipts` (
	`delegation_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_reference` text NOT NULL,
	`receipt_json` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL CHECK (`amount_minor` >= 0),
	`issued_at` integer NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
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
	`deadline_at` integer NOT NULL,
	`state` text NOT NULL,
	`remote_task_id` text,
	`remote_context_id` text,
	`remote_state` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `artifacts_captured` integer DEFAULT 0 NOT NULL, `parent_budget_limit_minor` integer DEFAULT 0 NOT NULL, `continue_while_device_offline` integer DEFAULT 0 NOT NULL, `price_quote_digest` text NOT NULL DEFAULT '', `price_quote_json` text, `package_runtime_binding_id` text NOT NULL DEFAULT '', `package_runtime_binding_digest` text NOT NULL DEFAULT '', `predecessor_delegation_id` text);
--> statement-breakpoint
CREATE TABLE `coconala_team_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `csv_trial_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`mode` text NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE esim_cloud_access_keys (
  id text PRIMARY KEY NOT NULL,
  sky_order_id text NOT NULL,
  owner_user_id text NOT NULL,
  device_ref text NOT NULL,
  entitlement_receipt_sha256 text NOT NULL,
  token_sha256 text NOT NULL,
  scopes_json text NOT NULL,
  created_at integer NOT NULL,
  expires_at integer NOT NULL,
  revoked_at integer,
  active_slot text,
  replaced_by_id text,
  CONSTRAINT esim_cloud_hash_check CHECK (length(token_sha256)=64 AND length(entitlement_receipt_sha256)=64),
  CONSTRAINT esim_cloud_expiry_check CHECK (expires_at>created_at),
  CONSTRAINT esim_cloud_active_check CHECK ((revoked_at IS NULL AND active_slot IS NOT NULL AND active_slot=sky_order_id) OR (revoked_at IS NOT NULL AND active_slot IS NULL))
);
--> statement-breakpoint
CREATE TABLE `esim_device_entitlements` (
	`challenge_id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`install_receipt_sha256` text NOT NULL,
	`authority_id` text NOT NULL,
	`key_id` text NOT NULL,
	`starter_pack_id` text NOT NULL,
	`starter_pack_version` text NOT NULL,
	`starter_pack_manifest_sha256` text NOT NULL,
	`receipt_sha256` text NOT NULL,
	`observed_at` integer NOT NULL,
	`activated_at` integer NOT NULL, `signature_algorithm` text, `device_public_key_sha256` text,
	CONSTRAINT "esim_device_entitlement_profile_check" CHECK(length("esim_device_entitlements"."profile_digest") = 64),
	CONSTRAINT "esim_device_entitlement_install_receipt_check" CHECK(length("esim_device_entitlements"."install_receipt_sha256") = 64),
	CONSTRAINT "esim_device_entitlement_pack_hash_check" CHECK(length("esim_device_entitlements"."starter_pack_manifest_sha256") = 64),
	CONSTRAINT "esim_device_entitlement_receipt_check" CHECK(length("esim_device_entitlements"."receipt_sha256") = 64)
);
--> statement-breakpoint
CREATE TABLE `esim_device_gateway_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`install_receipt_sha256` text NOT NULL,
	`starter_pack_id` text NOT NULL,
	`starter_pack_version` text NOT NULL,
	`starter_pack_manifest_sha256` text NOT NULL,
	`nonce_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT "esim_gateway_challenge_profile_check" CHECK(length("esim_device_gateway_challenges"."profile_digest") = 64),
	CONSTRAINT "esim_gateway_challenge_install_receipt_check" CHECK(length("esim_device_gateway_challenges"."install_receipt_sha256") = 64),
	CONSTRAINT "esim_gateway_challenge_pack_hash_check" CHECK(length("esim_device_gateway_challenges"."starter_pack_manifest_sha256") = 64),
	CONSTRAINT "esim_gateway_challenge_nonce_check" CHECK(length("esim_device_gateway_challenges"."nonce_sha256") = 64),
	CONSTRAINT "esim_gateway_challenge_expiry_check" CHECK("esim_device_gateway_challenges"."expires_at" > "esim_device_gateway_challenges"."created_at")
);
--> statement-breakpoint
CREATE TABLE `esim_device_gateway_keys` (
	`authority_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`key_id` text NOT NULL,
	`algorithm` text NOT NULL,
	`public_key_hex` text NOT NULL,
	`public_key_sha256` text NOT NULL,
	`application_package` text NOT NULL,
	`minimum_application_version` text NOT NULL,
	`signing_certificate_sha256` text NOT NULL,
	`security_level` text NOT NULL,
	`verified_boot_state` text NOT NULL,
	`attested_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`owner_user_id`, `device_ref`, `key_id`),
	CONSTRAINT "esim_device_gateway_key_algorithm_check" CHECK("esim_device_gateway_keys"."algorithm" = 'ES256'),
	CONSTRAINT "esim_device_gateway_key_public_check" CHECK(length("esim_device_gateway_keys"."public_key_hex") = 130 AND substr("esim_device_gateway_keys"."public_key_hex", 1, 2) = '04'),
	CONSTRAINT "esim_device_gateway_key_fingerprint_check" CHECK(length("esim_device_gateway_keys"."public_key_sha256") = 64 AND "esim_device_gateway_keys"."key_id" = "esim_device_gateway_keys"."public_key_sha256"),
	CONSTRAINT "esim_device_gateway_key_signer_check" CHECK(length("esim_device_gateway_keys"."signing_certificate_sha256") = 64),
	CONSTRAINT "esim_device_gateway_key_security_check" CHECK("esim_device_gateway_keys"."security_level" IN ('TRUSTED_ENVIRONMENT', 'STRONG_BOX')),
	CONSTRAINT "esim_device_gateway_key_boot_check" CHECK("esim_device_gateway_keys"."verified_boot_state" = 'VERIFIED'),
	CONSTRAINT "esim_device_gateway_key_status_check" CHECK("esim_device_gateway_keys"."status" IN ('active', 'revoked')),
	CONSTRAINT "esim_device_gateway_key_revoked_check" CHECK(("esim_device_gateway_keys"."status" = 'active' AND "esim_device_gateway_keys"."revoked_at" IS NULL) OR ("esim_device_gateway_keys"."status" = 'revoked' AND "esim_device_gateway_keys"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `esim_device_install_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`nonce_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT "esim_install_challenge_profile_digest_check" CHECK(length("esim_device_install_challenges"."profile_digest") = 64),
	CONSTRAINT "esim_install_challenge_nonce_check" CHECK(length("esim_device_install_challenges"."nonce_sha256") = 64),
	CONSTRAINT "esim_install_challenge_expiry_check" CHECK("esim_device_install_challenges"."expires_at" > "esim_device_install_challenges"."created_at")
);
--> statement-breakpoint
CREATE TABLE `esim_device_install_receipts` (
	`challenge_id` text PRIMARY KEY NOT NULL,
	`sky_order_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`profile_digest` text NOT NULL,
	`device_ref` text NOT NULL,
	`issuer_id` text NOT NULL,
	`key_id` text NOT NULL,
	`receipt_sha256` text NOT NULL,
	`evidence_source` text NOT NULL,
	`observed_at` integer NOT NULL,
	`verified_at` integer NOT NULL,
	CONSTRAINT "esim_install_receipt_profile_digest_check" CHECK(length("esim_device_install_receipts"."profile_digest") = 64),
	CONSTRAINT "esim_install_receipt_hash_check" CHECK(length("esim_device_install_receipts"."receipt_sha256") = 64),
	CONSTRAINT "esim_install_receipt_source_check" CHECK("esim_device_install_receipts"."evidence_source" IN ('carrier_privileged', 'oem_euicc_controller'))
);
--> statement-breakpoint
CREATE TABLE `esim_provider_orders` (
	`sky_order_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`provider_bundle_name` text NOT NULL,
	`quote_digest` text NOT NULL,
	`quote_total` text NOT NULL,
	`quote_currency` text NOT NULL,
	`state` text NOT NULL,
	`provider_order_reference` text,
	`profile_digest` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, `install_material_ciphertext` text, `install_material_nonce` text, `install_material_delivery_key_hash` text, `install_material_delivered_at` integer, `pricing_snapshot_json` text NOT NULL, `pricing_snapshot_sha256` text NOT NULL,
	CONSTRAINT "esim_provider_orders_provider_check" CHECK("esim_provider_orders"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_provider_orders_manifest_check" CHECK(length("esim_provider_orders"."manifest_sha256") = 64),
	CONSTRAINT "esim_provider_orders_quote_check" CHECK(length("esim_provider_orders"."quote_digest") = 64),
	CONSTRAINT "esim_provider_orders_state_check" CHECK("esim_provider_orders"."state" IN ('dispatch_started', 'reconciliation_required', 'provider_completed', 'profile_bound')),
	CONSTRAINT "esim_provider_orders_profile_digest_check" CHECK("esim_provider_orders"."profile_digest" IS NULL OR length("esim_provider_orders"."profile_digest") = 64)
);
--> statement-breakpoint
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
CREATE TABLE "esim_provider_webhook_inbox" (
	`callback_digest` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer NOT NULL,
	`state` text NOT NULL,
	`profile_digest` text,
	`owner_user_id` text,
	`sky_order_id` text, `install_material_ciphertext` text, `install_material_nonce` text, `install_material_delivery_key_hash` text, `install_material_delivered_at` integer,
	CONSTRAINT "esim_webhook_provider_check" CHECK("esim_provider_webhook_inbox"."provider" = 'esim-go-v3'),
	CONSTRAINT "esim_webhook_state_check" CHECK("esim_provider_webhook_inbox"."state" IN ('received', 'reconciliation_required')),
	CONSTRAINT "esim_webhook_digest_check" CHECK(length("esim_provider_webhook_inbox"."callback_digest") = 64),
	CONSTRAINT "esim_webhook_profile_digest_check" CHECK("esim_provider_webhook_inbox"."profile_digest" IS NULL OR length("esim_provider_webhook_inbox"."profile_digest") = 64),
	CONSTRAINT "esim_webhook_owner_order_pair_check" CHECK(("esim_provider_webhook_inbox"."owner_user_id" IS NULL) = ("esim_provider_webhook_inbox"."sky_order_id" IS NULL))
);
--> statement-breakpoint
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
CREATE TABLE `remote_ai_text_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`parent_job_id` text NOT NULL,
	`model_id` text NOT NULL,
	`card_id` text NOT NULL,
	`rate_card_digest` text NOT NULL,
	`quote_digest` text NOT NULL,
	`approval_digest` text NOT NULL,
	`quote_json` text NOT NULL,
	`rate_card_json` text NOT NULL,
	`currency` text NOT NULL,
	`maximum_charge_minor` integer NOT NULL,
	`approved_cap_minor` integer NOT NULL,
	`parent_budget_limit_minor` integer NOT NULL,
	`save_result` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'quoted' NOT NULL,
	`settled_minor` integer,
	`usage_json` text,
	`observation_json` text,
	`price_json` text,
	`provider_response_id` text,
	`result_text` text,
	`duration_ms` integer,
	`error_code` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "remote_ai_text_budget_check" CHECK("remote_ai_text_executions"."maximum_charge_minor" >= 0 AND "remote_ai_text_executions"."maximum_charge_minor" <= "remote_ai_text_executions"."approved_cap_minor" AND "remote_ai_text_executions"."approved_cap_minor" <= "remote_ai_text_executions"."parent_budget_limit_minor"),
	CONSTRAINT "remote_ai_text_state_check" CHECK("remote_ai_text_executions"."state" IN ('quoted','reserved','sending','completed','unreconciled','cancelled','expired')),
	CONSTRAINT "remote_ai_text_save_check" CHECK("remote_ai_text_executions"."save_result" IN (0,1) AND ("remote_ai_text_executions"."save_result" = 1 OR "remote_ai_text_executions"."result_text" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `remote_ai_text_inputs` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`input_sha256` text NOT NULL,
	`key_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `remote_ai_text_executions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "remote_ai_text_input_digest_check" CHECK(length("remote_ai_text_inputs"."input_sha256") = 64),
	CONSTRAINT "remote_ai_text_input_key_version_check" CHECK("remote_ai_text_inputs"."key_version" = 'aes-256-gcm-v1')
);
--> statement-breakpoint
CREATE TABLE `remote_ai_text_send_claims` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`claimed_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `remote_ai_text_executions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rockstar_a2a_broker_devices` (
	`authority_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`key_id` text NOT NULL,
	`algorithm` text NOT NULL,
	`public_key_hex` text NOT NULL,
	`public_key_sha256` text NOT NULL,
	`application_package` text NOT NULL,
	`minimum_application_version` text NOT NULL,
	`signing_certificate_sha256` text NOT NULL,
	`security_level` text NOT NULL,
	`verified_boot_state` text NOT NULL,
	`attested_at` integer NOT NULL,
	`registered_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`owner_user_id`, `device_ref`, `key_id`),
	CONSTRAINT "rockstar_a2a_broker_device_algorithm_check" CHECK("rockstar_a2a_broker_devices"."algorithm" = 'ES256'),
	CONSTRAINT "rockstar_a2a_broker_device_public_check" CHECK(length("rockstar_a2a_broker_devices"."public_key_hex") = 130 AND substr("rockstar_a2a_broker_devices"."public_key_hex", 1, 2) = '04'),
	CONSTRAINT "rockstar_a2a_broker_device_fingerprint_check" CHECK(length("rockstar_a2a_broker_devices"."public_key_sha256") = 64 AND "rockstar_a2a_broker_devices"."key_id" = "rockstar_a2a_broker_devices"."public_key_sha256"),
	CONSTRAINT "rockstar_a2a_broker_device_signer_check" CHECK("rockstar_a2a_broker_devices"."application_package" = 'dev.rock.automation' AND length("rockstar_a2a_broker_devices"."signing_certificate_sha256") = 64),
	CONSTRAINT "rockstar_a2a_broker_device_version_check" CHECK("rockstar_a2a_broker_devices"."minimum_application_version" <> '' AND "rockstar_a2a_broker_devices"."minimum_application_version" NOT GLOB '*[^0-9]*' AND length("rockstar_a2a_broker_devices"."minimum_application_version") <= 9),
	CONSTRAINT "rockstar_a2a_broker_device_security_check" CHECK("rockstar_a2a_broker_devices"."security_level" IN ('TRUSTED_ENVIRONMENT', 'STRONG_BOX')),
	CONSTRAINT "rockstar_a2a_broker_device_boot_check" CHECK("rockstar_a2a_broker_devices"."verified_boot_state" = 'VERIFIED'),
	CONSTRAINT "rockstar_a2a_broker_device_status_check" CHECK("rockstar_a2a_broker_devices"."status" IN ('active', 'revoked')),
	CONSTRAINT "rockstar_a2a_broker_device_revoked_check" CHECK(("rockstar_a2a_broker_devices"."status" = 'active' AND "rockstar_a2a_broker_devices"."revoked_at" IS NULL) OR ("rockstar_a2a_broker_devices"."status" = 'revoked' AND "rockstar_a2a_broker_devices"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `rockstar_a2a_broker_enrollment_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`device_ref` text NOT NULL,
	`nonce_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	CONSTRAINT "rockstar_a2a_broker_challenge_nonce_check" CHECK(length("rockstar_a2a_broker_enrollment_challenges"."nonce_sha256") = 64),
	CONSTRAINT "rockstar_a2a_broker_challenge_expiry_check" CHECK("rockstar_a2a_broker_enrollment_challenges"."expires_at" > "rockstar_a2a_broker_enrollment_challenges"."created_at" AND "rockstar_a2a_broker_enrollment_challenges"."expires_at" <= "rockstar_a2a_broker_enrollment_challenges"."created_at" + 300000)
);
--> statement-breakpoint
CREATE TABLE `rockstar_device_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_code_sha256` text NOT NULL,
	`device_code_sha256` text NOT NULL,
	`client_name` text NOT NULL,
	`status` text NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_polled_at` integer,
	`approved_at` integer,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE `rockstar_device_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_name` text NOT NULL,
	`token_sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `rockstar_entitlement_events` (
	`issuer_id` text NOT NULL,
	`event_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`purchase_reference_sha256` text NOT NULL,
	`event_type` text NOT NULL,
	`issuer_key_id` text NOT NULL,
	`event_sha256` text NOT NULL,
	`signature` text NOT NULL,
	`received_at` integer NOT NULL,
	`applied_at` integer,
	PRIMARY KEY(`issuer_id`, `event_id`),
	CONSTRAINT "rockstar_entitlement_event_hash_check" CHECK(length("rockstar_entitlement_events"."purchase_reference_sha256") = 64 AND length("rockstar_entitlement_events"."event_sha256") = 64),
	CONSTRAINT "rockstar_entitlement_event_type_check" CHECK("rockstar_entitlement_events"."event_type" IN ('refunded', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE `rockstar_entitlement_issuer_deliveries` (
	`issuer_id` text NOT NULL,
	`idempotency_key_sha256` text NOT NULL,
	`request_sha256` text NOT NULL,
	`purchase_reference_sha256` text NOT NULL,
	`claim_id` text NOT NULL,
	`claim_json` text NOT NULL,
	`claim_json_sha256` text NOT NULL,
	`claim_code_ciphertext` text,
	`claim_code_nonce` text,
	`state` text DEFAULT 'prepared' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`delivered_at` integer, `code_encryption_key_id` text DEFAULT 'legacy' NOT NULL,
	PRIMARY KEY(`issuer_id`, `idempotency_key_sha256`),
	CONSTRAINT "rockstar_entitlement_issuer_delivery_hashes_check" CHECK(length("rockstar_entitlement_issuer_deliveries"."idempotency_key_sha256") = 64 AND length("rockstar_entitlement_issuer_deliveries"."request_sha256") = 64 AND length("rockstar_entitlement_issuer_deliveries"."purchase_reference_sha256") = 64 AND length("rockstar_entitlement_issuer_deliveries"."claim_json_sha256") = 64),
	CONSTRAINT "rockstar_entitlement_issuer_delivery_claim_json_check" CHECK(json_valid("rockstar_entitlement_issuer_deliveries"."claim_json")),
	CONSTRAINT "rockstar_entitlement_issuer_delivery_state_check" CHECK(("rockstar_entitlement_issuer_deliveries"."state" = 'prepared' AND "rockstar_entitlement_issuer_deliveries"."claim_code_ciphertext" IS NOT NULL AND "rockstar_entitlement_issuer_deliveries"."claim_code_nonce" IS NOT NULL AND "rockstar_entitlement_issuer_deliveries"."delivered_at" IS NULL) OR ("rockstar_entitlement_issuer_deliveries"."state" = 'delivered' AND "rockstar_entitlement_issuer_deliveries"."claim_code_ciphertext" IS NULL AND "rockstar_entitlement_issuer_deliveries"."claim_code_nonce" IS NULL AND "rockstar_entitlement_issuer_deliveries"."delivered_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `rockstar_entitlement_issuer_rate_limits` (
	`issuer_id` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rockstar_entitlement_issuer_rate_limit_count_check" CHECK("rockstar_entitlement_issuer_rate_limits"."request_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `rockstar_service_entitlements` (
	`issuer_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`purchase_reference_sha256` text NOT NULL,
	`claim_code_sha256` text NOT NULL,
	`form_factor` text NOT NULL,
	`scopes_json` text NOT NULL,
	`issuer_key_id` text NOT NULL,
	`claim_signature` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`claimed_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	PRIMARY KEY(`issuer_id`, `claim_id`),
	CONSTRAINT "rockstar_entitlement_form_factor_check" CHECK("rockstar_service_entitlements"."form_factor" IN ('physical_sim', 'esim', 'service_only')),
	CONSTRAINT "rockstar_entitlement_status_check" CHECK("rockstar_service_entitlements"."status" IN ('active', 'refunded', 'revoked', 'expired')),
	CONSTRAINT "rockstar_entitlement_purchase_hash_check" CHECK(length("rockstar_service_entitlements"."purchase_reference_sha256") = 64),
	CONSTRAINT "rockstar_entitlement_code_hash_check" CHECK(length("rockstar_service_entitlements"."claim_code_sha256") = 64)
);
--> statement-breakpoint
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
CREATE TABLE `sky_campus_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `edge_type` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_campus_items` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `summary` text NOT NULL,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `details_json` text DEFAULT '{}' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `visibility` text DEFAULT 'campus' NOT NULL,
  `starts_at` text,
  `ends_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_campus_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `handle` text NOT NULL,
  `display_name` text NOT NULL,
  `affiliation` text NOT NULL,
  `affiliation_status` text NOT NULL,
  `headline` text DEFAULT '' NOT NULL,
  `bio` text DEFAULT '' NOT NULL,
  `skills_json` text DEFAULT '[]' NOT NULL,
  `interests_json` text DEFAULT '[]' NOT NULL,
  `looking_for_json` text DEFAULT '[]' NOT NULL,
  `links_json` text DEFAULT '[]' NOT NULL,
  `is_public` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_campus_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `reporter_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `reason` text NOT NULL,
  `detail` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_campus_tag_events` (
  `id` text PRIMARY KEY NOT NULL,
  `tag_id` text NOT NULL,
  `source` text NOT NULL,
  `occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_campus_tags` (
  `tag_id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `campus_id` text NOT NULL,
  `mode` text NOT NULL,
  `destination` text NOT NULL,
  `label` text DEFAULT '' NOT NULL,
  `placement` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_commerce_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `sky_commerce_sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`account_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_library_items` (
	`user_id` text NOT NULL,
	`tool` text NOT NULL,
	`saved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sky_package_runtime_bindings` (
	`binding_id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`key_id` text NOT NULL,
	`agent_origin` text NOT NULL,
	`package_key` text NOT NULL,
	`manifest_sha256` text NOT NULL,
	`digest` text NOT NULL,
	`binding_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`revoked_at` integer,
	`revoked_by` text,
	CONSTRAINT "sky_package_runtime_binding_hash_check" CHECK(length("sky_package_runtime_bindings"."manifest_sha256") = 64 AND length("sky_package_runtime_bindings"."digest") = 64),
	CONSTRAINT "sky_package_runtime_binding_json_check" CHECK(json_valid("sky_package_runtime_bindings"."binding_json")),
	CONSTRAINT "sky_package_runtime_binding_status_check" CHECK("sky_package_runtime_bindings"."status" IN ('active', 'revoked')),
	CONSTRAINT "sky_package_runtime_binding_revocation_check" CHECK(("sky_package_runtime_bindings"."status" = 'active' AND "sky_package_runtime_bindings"."revoked_at" IS NULL AND "sky_package_runtime_bindings"."revoked_by" IS NULL) OR ("sky_package_runtime_bindings"."status" = 'revoked' AND "sky_package_runtime_bindings"."revoked_at" IS NOT NULL AND "sky_package_runtime_bindings"."revoked_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `sky_provider_connections` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'setup_required' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`secret_ref` text,
	`connected_at` integer,
	`updated_at` integer NOT NULL
, `revision` integer DEFAULT 1 NOT NULL
CONSTRAINT `sky_provider_revision_positive` CHECK(typeof("sky_provider_connections"."revision") = 'integer' AND "sky_provider_connections"."revision" >= 1));
--> statement-breakpoint
CREATE TABLE `sky_remote_ai_rate_limits` (
	`user_id` text NOT NULL,
	`route` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
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
CREATE INDEX `idx_a2a_broker_auth_expiry` ON `agent_delegation_broker_authorizations` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_a2a_broker_auth_owner` ON `agent_delegation_broker_authorizations` (`owner_user_id`,`delegation_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_budget_pool_owner_parent` ON `agent_delegation_budget_pools` (`owner_user_id`,`parent_job_id`);
--> statement-breakpoint
CREATE INDEX `idx_a2a_budget_reservation_parent` ON `agent_delegation_budget_reservations` (`owner_user_id`,`parent_job_id`,`state`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_live_usage_event` ON `a2a_live_usage_snapshots` (`provider_id`,`provider_event_id`);
--> statement-breakpoint
CREATE INDEX `idx_a2a_live_usage_owner_parent` ON `a2a_live_usage_snapshots` (`owner_user_id`,`parent_job_id`,`delegation_id`,`sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_quote_consent_owner_request` ON `a2a_price_quote_consent_events` (`owner_user_id`,`quote_request_id`);
--> statement-breakpoint
CREATE INDEX `idx_a2a_quote_consent_owner_time` ON `a2a_price_quote_consent_events` (`owner_user_id`,`consented_at`);
--> statement-breakpoint
CREATE INDEX `idx_a2a_usage_owner_parent` ON `a2a_usage_receipts` (`owner_user_id`,`parent_job_id`,`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_a2a_usage_provider_reference` ON `a2a_usage_receipts` (`provider_id`,`provider_reference`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_artifact_identity` ON `agent_delegation_artifacts` (`owner_user_id`,`delegation_id`,`remote_task_id`,`artifact_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_artifact_owner` ON `agent_delegation_artifacts` (`owner_user_id`,`delegation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_event_owner` ON `agent_delegation_events` (`owner_user_id`,`delegation_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_event_revision` ON `agent_delegation_events` (`delegation_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_input_owner_expiry` ON `agent_delegation_inputs` (`owner_user_id`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_owner_key` ON `agent_delegations` (`owner_user_id`,`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_owner_message` ON `agent_delegations` (`owner_user_id`,`message_id`);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_package_binding` ON `agent_delegations` (`package_runtime_binding_id`,`package_runtime_binding_digest`);
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_parent_created` ON `agent_delegations` (`owner_user_id`,`parent_job_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_predecessor` ON `agent_delegations` (`predecessor_delegation_id`) WHERE "agent_delegations"."predecessor_delegation_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_delegation_price_quote_digest`
  ON `agent_delegations` (`price_quote_digest`) WHERE `price_quote_digest` <> '';
--> statement-breakpoint
CREATE INDEX `idx_agent_delegation_reconcile` ON `agent_delegations` (`state`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_coconala_team_user_updated` ON `coconala_team_cases` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_csv_trial_session` ON `csv_trial_payments` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_esim_cloud_active_order ON esim_cloud_access_keys(active_slot);
--> statement-breakpoint
CREATE INDEX idx_esim_cloud_owner ON esim_cloud_access_keys(owner_user_id,sky_order_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_esim_cloud_token ON esim_cloud_access_keys(token_sha256);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_device_entitlement_order` ON `esim_device_entitlements` (`sky_order_id`);
--> statement-breakpoint
CREATE INDEX `idx_esim_device_entitlement_owner` ON `esim_device_entitlements` (`owner_user_id`,`activated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_device_gateway_key_fingerprint` ON `esim_device_gateway_keys` (`authority_id`,`key_id`);
--> statement-breakpoint
CREATE INDEX `idx_esim_device_gateway_key_owner` ON `esim_device_gateway_keys` (`owner_user_id`,`device_ref`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_esim_gateway_challenge_order` ON `esim_device_gateway_challenges` (`owner_user_id`,`sky_order_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_esim_install_challenges_order` ON `esim_device_install_challenges` (`owner_user_id`,`sky_order_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_install_receipt_order` ON `esim_device_install_receipts` (`sky_order_id`);
--> statement-breakpoint
CREATE INDEX `idx_esim_install_receipt_owner` ON `esim_device_install_receipts` (`owner_user_id`,`verified_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_profile_binding_order` ON `esim_provider_profile_bindings` (`provider`,`sky_order_id`);
--> statement-breakpoint
CREATE INDEX `idx_esim_profile_binding_owner` ON `esim_provider_profile_bindings` (`owner_user_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_esim_provider_order_reference` ON `esim_provider_orders` (`provider`,`provider_order_reference`);
--> statement-breakpoint
CREATE INDEX `idx_esim_provider_orders_owner` ON `esim_provider_orders` (`owner_user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_order` ON `esim_provider_webhook_inbox` (`sky_order_id`,`received_at`);
--> statement-breakpoint
CREATE INDEX `idx_esim_webhook_inbox_state_received` ON `esim_provider_webhook_inbox` (`state`,`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_rate_card_digest` ON `remote_ai_rate_cards` (`digest`);
--> statement-breakpoint
CREATE INDEX `idx_remote_ai_rate_card_lookup` ON `remote_ai_rate_cards` (`provider_id`, `model_id`, `currency`, `status`, `effective_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_rate_limits_user_route` ON `sky_remote_ai_rate_limits` (`user_id`,`route`);
--> statement-breakpoint
CREATE INDEX `idx_remote_ai_rate_limits_window` ON `sky_remote_ai_rate_limits` (`window_started_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_input_owner_execution` ON `remote_ai_text_inputs` (`owner_user_id`,`execution_id`);
--> statement-breakpoint
CREATE INDEX `idx_remote_ai_text_owner_parent` ON `remote_ai_text_executions` (`owner_user_id`,`parent_job_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_owner_request` ON `remote_ai_text_executions` (`owner_user_id`,`request_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_quote` ON `remote_ai_text_executions` (`quote_digest`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_response` ON `remote_ai_text_executions` (`provider_response_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_remote_ai_text_send_claim_owner_execution` ON `remote_ai_text_send_claims` (`owner_user_id`,`execution_id`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_a2a_broker_challenge_expiry` ON `rockstar_a2a_broker_enrollment_challenges` (`consumed_at`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_a2a_broker_challenge_owner` ON `rockstar_a2a_broker_enrollment_challenges` (`owner_user_id`,`device_ref`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_a2a_broker_device_fingerprint` ON `rockstar_a2a_broker_devices` (`authority_id`,`key_id`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_a2a_broker_device_owner` ON `rockstar_a2a_broker_devices` (`owner_user_id`,`device_ref`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_device_auth_device_code` ON `rockstar_device_authorizations` (`device_code_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_device_auth_expiry` ON `rockstar_device_authorizations` (`status`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_device_auth_user_code` ON `rockstar_device_authorizations` (`user_code_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_device_session_owner` ON `rockstar_device_sessions` (`user_id`,`revoked_at`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_device_session_token` ON `rockstar_device_sessions` (`token_sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_entitlement_code` ON `rockstar_service_entitlements` (`claim_code_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_entitlement_event_claim` ON `rockstar_entitlement_events` (`issuer_id`,`claim_id`,`received_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_entitlement_issuer_delivery_claim` ON `rockstar_entitlement_issuer_deliveries` (`issuer_id`,`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_entitlement_issuer_delivery_purchase` ON `rockstar_entitlement_issuer_deliveries` (`issuer_id`,`purchase_reference_sha256`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_rockstar_entitlement_owner_status` ON `rockstar_service_entitlements` (`owner_user_id`,`status`,`claimed_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rockstar_entitlement_purchase_ref` ON `rockstar_service_entitlements` (`issuer_id`,`purchase_reference_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_sky_a2a_agent_owner_discovered` ON `sky_a2a_agent_connections` (`owner_user_id`,`discovered_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_a2a_agent_owner_origin_name` ON `sky_a2a_agent_connections` (`owner_user_id`,`origin`,`agent_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_activation_code_hash` ON `sky_activation_codes` (`code_sha256`);
--> statement-breakpoint
CREATE INDEX `idx_sky_activation_owner_created` ON `sky_activation_codes` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_activation_package_status` ON `sky_activation_codes` (`package_key`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_edge_target` ON `sky_campus_edges` (`campus_id`,`target_type`,`target_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_edge_unique` ON `sky_campus_edges` (`actor_user_id`,`edge_type`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_items_feed` ON `sky_campus_items` (`campus_id`,`kind`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_items_owner` ON `sky_campus_items` (`owner_user_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_profile_handle` ON `sky_campus_profiles` (`campus_id`,`handle`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_profile_public` ON `sky_campus_profiles` (`campus_id`,`is_public`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_profile_user_campus` ON `sky_campus_profiles` (`user_id`,`campus_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_campus_report_unique` ON `sky_campus_reports` (`reporter_user_id`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_reports_target` ON `sky_campus_reports` (`campus_id`,`target_type`,`target_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tag_events_source` ON `sky_campus_tag_events` (`source`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tag_events_tag` ON `sky_campus_tag_events` (`tag_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tags_active` ON `sky_campus_tags` (`campus_id`,`active`);
--> statement-breakpoint
CREATE INDEX `idx_sky_campus_tags_owner` ON `sky_campus_tags` (`owner_user_id`,`campus_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_commerce_event_order` ON `sky_commerce_events` (`order_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_offer_package` ON `sky_commerce_offers` (`package_key`,`mode`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_order_active` ON `sky_commerce_orders` (`active_key`);
--> statement-breakpoint
CREATE INDEX `idx_sky_commerce_order_buyer` ON `sky_commerce_orders` (`buyer_user_id`,`mode`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_order_payment` ON `sky_commerce_orders` (`payment_intent_id`);
--> statement-breakpoint
CREATE INDEX `idx_sky_commerce_order_seller` ON `sky_commerce_orders` (`seller_user_id`,`mode`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_order_session` ON `sky_commerce_orders` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_seller_account` ON `sky_commerce_sellers` (`account_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_commerce_seller_owner` ON `sky_commerce_sellers` (`user_id`,`mode`);
--> statement-breakpoint
CREATE INDEX `idx_sky_grant_code` ON `sky_tool_grants` (`activation_code_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_grant_package_telegram` ON `sky_tool_grants` (`package_key`,`telegram_user_id`);
--> statement-breakpoint
CREATE INDEX `idx_sky_grant_telegram_status` ON `sky_tool_grants` (`telegram_user_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_library_owner_tool` ON `sky_library_items` (`user_id`,`tool`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_package_runtime_binding_digest` ON `sky_package_runtime_bindings` (`digest`);
--> statement-breakpoint
CREATE INDEX `idx_sky_package_runtime_binding_lookup` ON `sky_package_runtime_bindings` (`agent_origin`,`package_key`,`manifest_sha256`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sky_provider_connections_user_provider` ON `sky_provider_connections` (`user_id`,`provider`);
--> statement-breakpoint
CREATE INDEX `idx_sky_provider_connections_user_updated` ON `sky_provider_connections` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_tool_reviews_decision_expiry` ON `sky_tool_package_reviews` (`decision`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_sky_tool_reviews_package_time` ON `sky_tool_package_reviews` (`package_key`,`reviewed_at`);
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_release_before_external_send`
AFTER UPDATE OF `state` ON `agent_delegations`
WHEN NEW.`state` IN ('cancelled_before_dispatch', 'expired')
  OR (NEW.`state` = 'remote_failed' AND NEW.`remote_state` = 'PREFLIGHT_FAILED_BEFORE_SEND')
BEGIN
  UPDATE `agent_delegation_budget_reservations`
  SET `state` = 'released', `updated_at` = NEW.`updated_at`
  WHERE `delegation_id` = NEW.`id`
    AND `owner_user_id` = NEW.`owner_user_id`
    AND `state` = 'held';
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_after_insert`
AFTER INSERT ON `agent_delegation_budget_reservations`
WHEN NEW.`state` = 'held'
BEGIN
  UPDATE `agent_delegation_budget_pools`
  SET `reserved_minor` = `reserved_minor` + NEW.`reserved_minor`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `owner_user_id` = NEW.`owner_user_id`
    AND `parent_job_id` = NEW.`parent_job_id`
    AND `currency` = NEW.`currency`;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_before_insert`
BEFORE INSERT ON `agent_delegation_budget_reservations`
WHEN NEW.`state` = 'held'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegation_budget_pools` p
    WHERE p.`owner_user_id` = NEW.`owner_user_id`
      AND p.`parent_job_id` = NEW.`parent_job_id`
      AND p.`currency` = NEW.`currency`
  ) THEN RAISE(ABORT, 'A2A_PARENT_BUDGET_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegation_budget_pools` p
    WHERE p.`owner_user_id` = NEW.`owner_user_id`
      AND p.`parent_job_id` = NEW.`parent_job_id`
      AND p.`currency` = NEW.`currency`
      AND p.`reserved_minor` + p.`settled_minor` + NEW.`reserved_minor` <= p.`budget_limit_minor`
  ) THEN RAISE(ABORT, 'A2A_PARENT_BUDGET_EXCEEDED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_release`
AFTER UPDATE OF `state` ON `agent_delegation_budget_reservations`
WHEN OLD.`state` = 'held' AND NEW.`state` = 'released'
BEGIN
  UPDATE `agent_delegation_budget_pools`
  SET `reserved_minor` = `reserved_minor` - OLD.`reserved_minor`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `owner_user_id` = OLD.`owner_user_id`
    AND `parent_job_id` = OLD.`parent_job_id`
    AND `currency` = OLD.`currency`
    AND `reserved_minor` >= OLD.`reserved_minor`;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_reservation_terminal_frozen`
BEFORE UPDATE ON `agent_delegation_budget_reservations`
WHEN OLD.`state` IN ('released', 'settled')
  AND (NEW.`state` != OLD.`state`
    OR NEW.`settled_minor` IS NOT OLD.`settled_minor`
    OR NEW.`reserved_minor` != OLD.`reserved_minor`
    OR NEW.`currency` != OLD.`currency`
    OR NEW.`owner_user_id` != OLD.`owner_user_id`
    OR NEW.`parent_job_id` != OLD.`parent_job_id`
    OR NEW.`created_at` != OLD.`created_at`)
BEGIN
  SELECT RAISE(ABORT, 'A2A_BUDGET_RESERVATION_TERMINAL_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_settlement_after_update`
AFTER UPDATE OF `state` ON `agent_delegation_budget_reservations`
WHEN OLD.`state` = 'held' AND NEW.`state` = 'settled'
BEGIN
  UPDATE `agent_delegation_budget_pools`
  SET `reserved_minor` = `reserved_minor` - OLD.`reserved_minor`,
      `settled_minor` = `settled_minor` + NEW.`settled_minor`,
      `revision` = `revision` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `owner_user_id` = OLD.`owner_user_id`
    AND `parent_job_id` = OLD.`parent_job_id`
    AND `currency` = OLD.`currency`;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_budget_settlement_before_update`
BEFORE UPDATE OF `state` ON `agent_delegation_budget_reservations`
WHEN OLD.`state` = 'held' AND NEW.`state` = 'settled'
BEGIN
  SELECT CASE WHEN NEW.`settled_minor` IS NULL
    OR NEW.`settled_minor` < 0
    OR NEW.`settled_minor` > OLD.`reserved_minor`
    OR NOT EXISTS (
      SELECT 1 FROM `agent_delegation_budget_pools` p
      WHERE p.`owner_user_id` = OLD.`owner_user_id`
        AND p.`parent_job_id` = OLD.`parent_job_id`
        AND p.`currency` = OLD.`currency`
        AND p.`reserved_minor` >= OLD.`reserved_minor`
        AND p.`reserved_minor` - OLD.`reserved_minor` + p.`settled_minor` + NEW.`settled_minor` <= p.`budget_limit_minor`
    )
  THEN RAISE(ABORT, 'A2A_USAGE_SETTLEMENT_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `a2a_usage_receipts` r
    WHERE r.`delegation_id` = OLD.`delegation_id`
      AND r.`owner_user_id` = OLD.`owner_user_id`
      AND r.`parent_job_id` = OLD.`parent_job_id`
      AND r.`currency` = OLD.`currency`
      AND r.`amount_minor` = NEW.`settled_minor`
  ) THEN RAISE(ABORT, 'A2A_USAGE_RECEIPT_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_delegation_fanout_limits_before_insert`
BEFORE INSERT ON `agent_delegations`
WHEN NOT EXISTS (
  SELECT 1 FROM `agent_delegations` d
  WHERE d.`owner_user_id` = NEW.`owner_user_id`
    AND d.`idempotency_key` = NEW.`idempotency_key`
)
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM `agent_delegations` d
    WHERE d.`owner_user_id` = NEW.`owner_user_id`
      AND d.`parent_job_id` = NEW.`parent_job_id`
      AND d.`state` IN (
        'awaiting_approval', 'prepared', 'dispatching', 'dispatch_submitting',
        'indeterminate', 'submitted', 'working', 'awaiting_remote_input',
        'cancel_requested', 'cancel_submitting', 'cancel_unconfirmed'
      )
  ) >= 4 THEN RAISE(ABORT, 'A2A_DELEGATION_CONCURRENCY_LIMIT') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM `agent_delegations` d
    WHERE d.`owner_user_id` = NEW.`owner_user_id`
      AND d.`parent_job_id` = NEW.`parent_job_id`
  ) >= 8 THEN RAISE(ABORT, 'A2A_DELEGATION_COUNT_LIMIT') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_live_usage_snapshot_before_insert`
BEFORE INSERT ON `a2a_live_usage_snapshots`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegations` d
    JOIN `agent_delegation_budget_reservations` r
      ON r.`owner_user_id` = d.`owner_user_id` AND r.`delegation_id` = d.`id`
    WHERE d.`id` = NEW.`delegation_id` AND d.`owner_user_id` = NEW.`owner_user_id`
      AND d.`parent_job_id` = NEW.`parent_job_id` AND d.`remote_task_id` IS NOT NULL
      AND d.`state` IN ('submitted','working','awaiting_remote_input','cancel_requested','cancel_submitting','cancel_unconfirmed')
      AND r.`state` = 'held' AND r.`currency` = NEW.`currency`
      AND NEW.`cumulative_amount_minor` <= r.`reserved_minor`
  ) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_RESERVATION_INVALID') END;
  SELECT CASE WHEN NEW.`sequence` != COALESCE((
    SELECT MAX(`sequence`) + 1 FROM `a2a_live_usage_snapshots`
    WHERE `delegation_id` = NEW.`delegation_id`
  ), 1) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_SEQUENCE_INVALID') END;
  SELECT CASE WHEN NEW.`cumulative_amount_minor` < COALESCE((
    SELECT `cumulative_amount_minor` FROM `a2a_live_usage_snapshots`
    WHERE `delegation_id` = NEW.`delegation_id` ORDER BY `sequence` DESC LIMIT 1
  ), 0) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_AMOUNT_DECREASED') END;
  SELECT CASE WHEN NEW.`issued_at` <= COALESCE((
    SELECT `issued_at` FROM `a2a_live_usage_snapshots`
    WHERE `delegation_id` = NEW.`delegation_id` ORDER BY `sequence` DESC LIMIT 1
  ), 0) THEN RAISE(ABORT, 'A2A_LIVE_USAGE_TIME_NOT_MONOTONIC') END;
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_live_usage_snapshot_immutable_delete`
BEFORE DELETE ON `a2a_live_usage_snapshots`
BEGIN SELECT RAISE(ABORT, 'A2A_LIVE_USAGE_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `a2a_live_usage_snapshot_immutable_update`
BEFORE UPDATE ON `a2a_live_usage_snapshots`
BEGIN SELECT RAISE(ABORT, 'A2A_LIVE_USAGE_SNAPSHOT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `a2a_parent_predecessor_guard`
BEFORE INSERT ON `agent_delegations`
WHEN NEW.`predecessor_delegation_id` IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `agent_delegations` p
    WHERE p.`id` = NEW.`predecessor_delegation_id`
      AND p.`owner_user_id` = NEW.`owner_user_id`
      AND p.`parent_job_id` = NEW.`parent_job_id`
      AND p.`state` = 'remote_completed'
      AND p.`artifacts_captured` = 1
      AND p.`predecessor_delegation_id` IS NULL
  ) THEN RAISE(ABORT, 'A2A_PARENT_PREDECESSOR_NOT_REVIEWABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER a2a_price_quote_consent_no_delete BEFORE DELETE ON a2a_price_quote_consent_events
BEGIN SELECT RAISE(ABORT, 'A2A_PRICE_QUOTE_CONSENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER a2a_price_quote_consent_no_update BEFORE UPDATE ON a2a_price_quote_consent_events
BEGIN SELECT RAISE(ABORT, 'A2A_PRICE_QUOTE_CONSENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER `a2a_usage_receipt_immutable_delete`
BEFORE DELETE ON `a2a_usage_receipts`
BEGIN
  SELECT RAISE(ABORT, 'A2A_USAGE_RECEIPT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `a2a_usage_receipt_immutable_update`
BEFORE UPDATE ON `a2a_usage_receipts`
BEGIN
  SELECT RAISE(ABORT, 'A2A_USAGE_RECEIPT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER marketplace_approvals_relation_guard
BEFORE INSERT ON marketplace_approvals
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.proposal_digest = NEW.proposal_digest
		AND proposal.status = 'PROPOSED'
)
BEGIN SELECT RAISE(ABORT, 'marketplace approval relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_position_binding_frozen
BEFORE UPDATE OF proposal_id,user_id,asset_id,side,quantity,entry_price_minor,notional_minor
ON marketplace_positions
BEGIN SELECT RAISE(ABORT, 'marketplace position binding immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_positions_no_delete
BEFORE DELETE ON marketplace_positions
BEGIN SELECT RAISE(ABORT, 'marketplace position immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_positions_relation_guard
BEFORE INSERT ON marketplace_positions
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.asset_id = NEW.asset_id
		AND proposal.side = NEW.side
		AND proposal.quantity = NEW.quantity
		AND proposal.price_minor = NEW.entry_price_minor
		AND proposal.notional_minor = NEW.notional_minor
		AND proposal.status = 'EXECUTED'
)
BEGIN SELECT RAISE(ABORT, 'marketplace position relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_receipts_relation_guard
BEFORE INSERT ON marketplace_receipts
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.status = 'EXECUTED'
)
BEGIN SELECT RAISE(ABORT, 'marketplace receipt relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_reservation_binding_frozen
BEFORE UPDATE OF proposal_id,user_id,held_minor ON marketplace_reservations
BEGIN SELECT RAISE(ABORT, 'marketplace reservation binding immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_reservations_no_delete
BEFORE DELETE ON marketplace_reservations
BEGIN SELECT RAISE(ABORT, 'marketplace reservation immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marketplace_reservations_relation_guard
BEFORE INSERT ON marketplace_reservations
WHEN NOT EXISTS (
	SELECT 1 FROM marketplace_proposals AS proposal
	WHERE proposal.id = NEW.proposal_id
		AND proposal.user_id = NEW.user_id
		AND proposal.notional_minor = NEW.held_minor
		AND proposal.status = 'EXECUTED'
)
	OR NEW.state != 'COMMITTED'
BEGIN SELECT RAISE(ABORT, 'marketplace reservation relation mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_dispatch_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state = 'sending'
BEGIN
  SELECT CASE WHEN NEW.updated_at > OLD.expires_at + 86400000
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest AND c.status = 'active'
      AND c.effective_at <= NEW.updated_at AND c.expires_at > NEW.updated_at)
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.reserved_minor >= NEW.maximum_charge_minor
        AND p.reserved_minor + p.settled_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_DISPATCH_PREFLIGHT') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_input_delete_guard BEFORE DELETE ON remote_ai_text_inputs
WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e WHERE e.id = OLD.execution_id
  AND e.owner_user_id = OLD.owner_user_id AND e.state IN ('completed','unreconciled','cancelled','expired'))
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_INPUT_DELETE_BEFORE_TERMINAL'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_input_no_update BEFORE UPDATE ON remote_ai_text_inputs
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_INPUT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_input_relation_guard BEFORE INSERT ON remote_ai_text_inputs
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e
    WHERE e.id = NEW.execution_id AND e.owner_user_id = NEW.owner_user_id
      AND e.state = 'reserved' AND e.expires_at + 86400000 = NEW.expires_at)
    OR length(NEW.nonce) > 64 OR length(NEW.ciphertext) > 80000
    OR NEW.created_at >= NEW.expires_at
  THEN RAISE(ABORT, 'REMOTE_AI_TEXT_INPUT_BINDING') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_no_delete BEFORE DELETE ON remote_ai_text_executions
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_AUDIT_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_quote_guard BEFORE INSERT ON remote_ai_text_executions
BEGIN
  SELECT CASE WHEN NEW.state != 'quoted' OR NEW.revision != 0
    OR NEW.settled_minor IS NOT NULL OR NEW.provider_response_id IS NOT NULL
    OR NEW.usage_json IS NOT NULL OR NEW.price_json IS NOT NULL OR NEW.result_text IS NOT NULL
    OR NEW.observation_json IS NOT NULL OR NEW.duration_ms IS NOT NULL OR NEW.error_code IS NOT NULL
    OR NEW.expires_at <= NEW.created_at OR NEW.updated_at != NEW.created_at
    OR NEW.parent_budget_limit_minor > 9007199254740991
    OR NOT json_valid(NEW.quote_json) OR NOT json_valid(NEW.rate_card_json)
    OR json_extract(NEW.quote_json, '$.ownerId') IS NOT NEW.owner_user_id
    OR json_extract(NEW.quote_json, '$.requestId') IS NOT NEW.request_id
    OR json_extract(NEW.quote_json, '$.quoteDigest') IS NOT NEW.quote_digest
    OR json_extract(NEW.quote_json, '$.approvedCapMinor') IS NOT NEW.approved_cap_minor
    OR json_extract(NEW.quote_json, '$.ceiling.maximumChargeMinor') IS NOT NEW.maximum_charge_minor
    OR json_extract(NEW.quote_json, '$.ceiling.rateCardDigest') IS NOT NEW.rate_card_digest
    OR json_extract(NEW.quote_json, '$.ceiling.currency') IS NOT NEW.currency
    OR json_extract(NEW.quote_json, '$.ceiling.modelId') IS NOT NEW.model_id
    OR json_extract(NEW.quote_json, '$.expiresAt') IS NOT NEW.expires_at
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest
      AND c.card_json = NEW.rate_card_json AND c.status = 'active'
      AND c.effective_at <= NEW.created_at AND c.expires_at >= NEW.expires_at)
  THEN RAISE(ABORT, 'REMOTE_AI_TEXT_QUOTE_BINDING') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_release AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state IN ('cancelled','expired')
BEGIN
  UPDATE agent_delegation_budget_pools
    SET reserved_minor = reserved_minor - OLD.maximum_charge_minor,
        revision = revision + 1, updated_at = NEW.updated_at
    WHERE owner_user_id = OLD.owner_user_id AND parent_job_id = OLD.parent_job_id;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_release_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'reserved' AND NEW.state IN ('cancelled','expired')
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
    WHERE p.owner_user_id = OLD.owner_user_id AND p.parent_job_id = OLD.parent_job_id
      AND p.currency = OLD.currency AND p.reserved_minor >= OLD.maximum_charge_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_RELEASE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_reserve AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'quoted' AND NEW.state = 'reserved'
BEGIN
  UPDATE agent_delegation_budget_pools
    SET reserved_minor = reserved_minor + NEW.maximum_charge_minor,
        revision = revision + 1, updated_at = NEW.updated_at
    WHERE owner_user_id = NEW.owner_user_id AND parent_job_id = NEW.parent_job_id;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_reserve_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'quoted' AND NEW.state = 'reserved'
BEGIN
  SELECT CASE WHEN NEW.updated_at >= NEW.expires_at
    OR NOT EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = NEW.parent_job_id
      AND w.user_id = NEW.owner_user_id AND json_extract(w.payload, '$.status') = 'active')
    OR NOT EXISTS (SELECT 1 FROM remote_ai_rate_cards c WHERE c.provider_id = 'openai'
      AND c.card_id = NEW.card_id AND c.digest = NEW.rate_card_digest AND c.status = 'active'
      AND c.effective_at <= NEW.updated_at AND c.expires_at > NEW.updated_at)
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.budget_limit_minor = NEW.parent_budget_limit_minor
        AND p.reserved_minor >= 0 AND p.settled_minor >= 0
        AND p.reserved_minor + p.settled_minor + NEW.maximum_charge_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_BUDGET_OR_QUOTE_UNAVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_send_claim_binding_guard BEFORE INSERT ON remote_ai_text_send_claims
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM remote_ai_text_executions e
    WHERE e.id = NEW.execution_id AND e.owner_user_id = NEW.owner_user_id AND e.state = 'sending')
  THEN RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_BINDING') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_send_claim_no_delete BEFORE DELETE ON remote_ai_text_send_claims
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_send_claim_no_update BEFORE UPDATE ON remote_ai_text_send_claims
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_SEND_CLAIM_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_settle AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state IN ('sending','unreconciled') AND NEW.state = 'completed'
BEGIN
  UPDATE agent_delegation_budget_pools
    SET reserved_minor = reserved_minor - OLD.maximum_charge_minor,
        settled_minor = settled_minor + NEW.settled_minor,
        revision = revision + 1, updated_at = NEW.updated_at
    WHERE owner_user_id = OLD.owner_user_id AND parent_job_id = OLD.parent_job_id;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_state_guard BEFORE UPDATE ON remote_ai_text_executions
BEGIN
  SELECT CASE WHEN NEW.revision != OLD.revision + 1 OR NEW.updated_at < OLD.updated_at
    OR NOT (
      (OLD.state = 'quoted' AND NEW.state IN ('reserved','cancelled','expired')) OR
      (OLD.state = 'reserved' AND NEW.state IN ('sending','cancelled','expired')) OR
      (OLD.state = 'sending' AND NEW.state IN ('completed','unreconciled')) OR
      (OLD.state = 'sending' AND NEW.state = 'sending'
        AND NEW.settled_minor IS OLD.settled_minor AND NEW.usage_json IS OLD.usage_json
        AND NEW.price_json IS OLD.price_json AND NEW.provider_response_id IS OLD.provider_response_id
        AND NEW.result_text IS OLD.result_text AND NEW.duration_ms IS OLD.duration_ms
        AND NEW.error_code IS OLD.error_code AND json_valid(NEW.observation_json)
        AND json_remove(NEW.observation_json, '$.liveMeter') IS
          COALESCE(json_remove(OLD.observation_json, '$.liveMeter'), '{}')
        AND json_type(NEW.observation_json, '$.liveMeter') IS 'object'
        AND json_type(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') >= 0
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') <= OLD.maximum_charge_minor
        AND json_type(NEW.observation_json, '$.liveMeter.estimatedInputTokens') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedInputTokens') =
          json_extract(OLD.quote_json, '$.ceiling.inputTokenUpperBound')
        AND json_type(NEW.observation_json, '$.liveMeter.estimatedOutputTokens') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedOutputTokens') BETWEEN 0 AND
          json_extract(OLD.quote_json, '$.ceiling.outputTokenLimit')
        AND json_type(NEW.observation_json, '$.liveMeter.observedOutputBytes') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.observedOutputBytes') BETWEEN 0 AND 1500000
        AND json_type(NEW.observation_json, '$.liveMeter.observedAt') IS 'integer'
        AND json_extract(NEW.observation_json, '$.liveMeter.observedAt') >= OLD.updated_at
        AND json_extract(NEW.observation_json, '$.liveMeter.currency') IS OLD.currency
        AND json_extract(NEW.observation_json, '$.liveMeter.basis') IS
          'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3'
        AND json_extract(NEW.observation_json, '$.liveMeter.finalProviderUsage') IS 0
        AND json_extract(NEW.observation_json, '$.liveMeter.observedOutputBytes') >
          COALESCE(json_extract(OLD.observation_json, '$.liveMeter.observedOutputBytes'), -1)
        AND json_extract(NEW.observation_json, '$.liveMeter.estimatedChargeMinor') >=
          COALESCE(json_extract(OLD.observation_json, '$.liveMeter.estimatedChargeMinor'), 0)
        AND json_extract(NEW.observation_json, '$.liveMeter.observedAt') >=
          COALESCE(json_extract(OLD.observation_json, '$.liveMeter.observedAt'), OLD.updated_at)) OR
      (OLD.state = 'unreconciled' AND NEW.state = 'completed') OR
      (OLD.state = 'completed' AND NEW.state = 'completed'
        AND OLD.result_text IS NOT NULL AND NEW.result_text IS NULL
        AND NEW.settled_minor IS OLD.settled_minor AND NEW.usage_json IS OLD.usage_json
        AND NEW.price_json IS OLD.price_json AND NEW.provider_response_id IS OLD.provider_response_id
        AND NEW.observation_json IS OLD.observation_json
        AND NEW.duration_ms IS OLD.duration_ms AND NEW.error_code IS OLD.error_code)
    ) THEN RAISE(ABORT, 'REMOTE_AI_TEXT_STATE_TRANSITION') END;
  SELECT CASE WHEN NEW.state NOT IN ('completed')
    AND (NEW.settled_minor IS NOT NULL OR NEW.provider_response_id IS NOT NULL
      OR NEW.usage_json IS NOT NULL OR NEW.price_json IS NOT NULL OR NEW.result_text IS NOT NULL)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_UNCONFIRMED_COST') END;
END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_terms_frozen BEFORE UPDATE ON remote_ai_text_executions
WHEN NEW.id IS NOT OLD.id OR NEW.owner_user_id IS NOT OLD.owner_user_id
  OR NEW.request_id IS NOT OLD.request_id OR NEW.parent_job_id IS NOT OLD.parent_job_id
  OR NEW.model_id IS NOT OLD.model_id OR NEW.card_id IS NOT OLD.card_id
  OR NEW.rate_card_digest IS NOT OLD.rate_card_digest OR NEW.quote_digest IS NOT OLD.quote_digest
  OR NEW.approval_digest IS NOT OLD.approval_digest OR NEW.quote_json IS NOT OLD.quote_json
  OR NEW.rate_card_json IS NOT OLD.rate_card_json OR NEW.currency IS NOT OLD.currency
  OR NEW.maximum_charge_minor IS NOT OLD.maximum_charge_minor
  OR NEW.approved_cap_minor IS NOT OLD.approved_cap_minor
  OR NEW.parent_budget_limit_minor IS NOT OLD.parent_budget_limit_minor
  OR NEW.save_result IS NOT OLD.save_result OR NEW.created_at IS NOT OLD.created_at
  OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'REMOTE_AI_TEXT_TERMS_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER remote_ai_text_usage_guard BEFORE UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state IN ('sending','unreconciled') AND NEW.state = 'completed'
BEGIN
  SELECT CASE WHEN NEW.settled_minor IS NULL OR NEW.settled_minor < 0
    OR NEW.settled_minor > OLD.maximum_charge_minor OR NEW.duration_ms IS NULL OR NEW.duration_ms < 0
    OR NEW.provider_response_id IS NULL OR NEW.usage_json IS NULL OR NEW.price_json IS NULL
    OR NOT json_valid(NEW.usage_json) OR NOT json_valid(NEW.price_json)
    OR json_extract(NEW.price_json, '$.status') IS NOT 'priced'
    OR json_extract(NEW.price_json, '$.chargeMinor') IS NOT NEW.settled_minor
    OR json_extract(NEW.price_json, '$.providerResponseId') IS NOT NEW.provider_response_id
    OR json_extract(NEW.price_json, '$.currency') IS NOT NEW.currency
    OR json_extract(NEW.price_json, '$.rateCardDigest') IS NOT NEW.rate_card_digest
    OR NOT EXISTS (SELECT 1 FROM agent_delegation_budget_pools p
      WHERE p.owner_user_id = NEW.owner_user_id AND p.parent_job_id = NEW.parent_job_id
        AND p.currency = NEW.currency AND p.reserved_minor >= OLD.maximum_charge_minor
        AND p.reserved_minor - OLD.maximum_charge_minor + p.settled_minor + NEW.settled_minor <= p.budget_limit_minor)
    THEN RAISE(ABORT, 'REMOTE_AI_TEXT_USAGE_MISMATCH') END;
END;
--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_challenge_no_delete BEFORE DELETE ON rockstar_a2a_broker_enrollment_challenges
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_CHALLENGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_challenge_no_update BEFORE UPDATE ON rockstar_a2a_broker_enrollment_challenges
WHEN NOT (OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL AND
  NEW.id = OLD.id AND NEW.owner_user_id = OLD.owner_user_id AND NEW.device_ref = OLD.device_ref AND
  NEW.nonce_sha256 = OLD.nonce_sha256 AND NEW.created_at = OLD.created_at AND NEW.expires_at = OLD.expires_at)
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_CHALLENGE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_device_no_delete BEFORE DELETE ON rockstar_a2a_broker_devices
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_DEVICE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER rockstar_a2a_broker_device_revoke_only BEFORE UPDATE ON rockstar_a2a_broker_devices
WHEN NOT (OLD.status = 'active' AND NEW.status = 'revoked' AND NEW.revoked_at IS NOT NULL AND
  NEW.authority_id = OLD.authority_id AND NEW.owner_user_id = OLD.owner_user_id AND
  NEW.device_ref = OLD.device_ref AND NEW.key_id = OLD.key_id AND NEW.algorithm = OLD.algorithm AND
  NEW.public_key_hex = OLD.public_key_hex AND NEW.public_key_sha256 = OLD.public_key_sha256 AND
  NEW.application_package = OLD.application_package AND
  NEW.minimum_application_version = OLD.minimum_application_version AND
  NEW.signing_certificate_sha256 = OLD.signing_certificate_sha256 AND
  NEW.security_level = OLD.security_level AND NEW.verified_boot_state = OLD.verified_boot_state AND
  NEW.attested_at = OLD.attested_at AND NEW.registered_at = OLD.registered_at)
BEGIN SELECT RAISE(ABORT, 'ROCKSTAR_A2A_BROKER_DEVICE_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER sky_tool_package_reviews_no_delete
BEFORE DELETE ON sky_tool_package_reviews
BEGIN SELECT RAISE(ABORT, 'sky tool review immutable'); END;
--> statement-breakpoint
CREATE TRIGGER sky_tool_package_reviews_no_update
BEFORE UPDATE ON sky_tool_package_reviews
BEGIN SELECT RAISE(ABORT, 'sky tool review immutable'); END;
