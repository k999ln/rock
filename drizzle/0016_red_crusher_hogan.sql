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
CREATE INDEX `idx_sky_tool_reviews_decision_expiry` ON `sky_tool_package_reviews` (`decision`,`expires_at`);
--> statement-breakpoint
CREATE TRIGGER sky_tool_package_reviews_no_update
BEFORE UPDATE ON sky_tool_package_reviews
BEGIN SELECT RAISE(ABORT, 'sky tool review immutable'); END;
--> statement-breakpoint
CREATE TRIGGER sky_tool_package_reviews_no_delete
BEFORE DELETE ON sky_tool_package_reviews
BEGIN SELECT RAISE(ABORT, 'sky tool review immutable'); END;
