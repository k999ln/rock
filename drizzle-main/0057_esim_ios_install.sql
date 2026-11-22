CREATE TABLE IF NOT EXISTS esim_ios_install_declarations (
  sky_order_id TEXT NOT NULL REFERENCES sky_commerce_orders(id),
  owner_user_id TEXT NOT NULL,
  profile_digest TEXT NOT NULL REFERENCES esim_provider_profile_bindings(profile_digest),
  declared_at INTEGER NOT NULL,
  PRIMARY KEY (sky_order_id, owner_user_id, profile_digest)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS esim_go_profile_status_events (
  callback_digest TEXT PRIMARY KEY NOT NULL REFERENCES esim_provider_webhook_inbox(callback_digest),
  profile_status TEXT NOT NULL CHECK (profile_status IN ('Downloaded', 'Installed', 'Released')),
  event_at INTEGER NOT NULL CHECK (event_at >= 0)
);
