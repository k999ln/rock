ALTER TABLE `preorder_attempts` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preorders` ADD `terms_version` text;--> statement-breakpoint
ALTER TABLE `preorders` ADD `terms_accepted_at` integer;--> statement-breakpoint
ALTER TABLE `preorders` ADD `stripe_expires_at` integer;