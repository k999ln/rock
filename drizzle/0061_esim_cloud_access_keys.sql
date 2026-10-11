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
CREATE UNIQUE INDEX idx_esim_cloud_token ON esim_cloud_access_keys(token_sha256);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_esim_cloud_active_order ON esim_cloud_access_keys(active_slot);
--> statement-breakpoint
CREATE INDEX idx_esim_cloud_owner ON esim_cloud_access_keys(owner_user_id,sky_order_id,created_at);
