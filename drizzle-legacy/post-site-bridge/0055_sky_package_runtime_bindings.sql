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
CREATE UNIQUE INDEX `idx_sky_package_runtime_binding_digest` ON `sky_package_runtime_bindings` (`digest`);--> statement-breakpoint
CREATE INDEX `idx_sky_package_runtime_binding_lookup` ON `sky_package_runtime_bindings` (`agent_origin`,`package_key`,`manifest_sha256`,`status`);