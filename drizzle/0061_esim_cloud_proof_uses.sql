CREATE TABLE esim_cloud_proof_uses (
  access_key_id text NOT NULL,
  request_id text NOT NULL,
  expires_at integer NOT NULL,
  PRIMARY KEY(access_key_id, request_id)
);
--> statement-breakpoint
CREATE INDEX idx_esim_cloud_proof_expiry ON esim_cloud_proof_uses(expires_at);
