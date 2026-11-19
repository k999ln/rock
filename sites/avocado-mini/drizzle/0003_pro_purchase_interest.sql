CREATE TABLE `pro_interest_attempts` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pro_purchase_interests` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `region` text NOT NULL,
  `note` text NOT NULL,
  `configuration_json` text NOT NULL,
  `status` text NOT NULL,
  `removal_hash` text NOT NULL,
  `consent_version` text NOT NULL,
  `created_at` integer NOT NULL
);
