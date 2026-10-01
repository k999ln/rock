ALTER TABLE `esim_provider_orders` ADD `install_material_ciphertext` text;--> statement-breakpoint
ALTER TABLE `esim_provider_orders` ADD `install_material_nonce` text;--> statement-breakpoint
ALTER TABLE `esim_provider_orders` ADD `install_material_delivery_key_hash` text;--> statement-breakpoint
ALTER TABLE `esim_provider_orders` ADD `install_material_delivered_at` integer;--> statement-breakpoint
ALTER TABLE `esim_provider_webhook_inbox` ADD `install_material_ciphertext` text;--> statement-breakpoint
ALTER TABLE `esim_provider_webhook_inbox` ADD `install_material_nonce` text;--> statement-breakpoint
ALTER TABLE `esim_provider_webhook_inbox` ADD `install_material_delivery_key_hash` text;--> statement-breakpoint
ALTER TABLE `esim_provider_webhook_inbox` ADD `install_material_delivered_at` integer;