-- Separate ephemeral runtime observations from legacy device sync.
-- Existing presence ciphertext is never copied or promoted into the new purpose.
CREATE TABLE IF NOT EXISTS `eve_runtime_presence` (
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`envelope` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_eve_runtime_presence_owner_id` ON `eve_runtime_presence` (`owner_id`,`device_id`);
