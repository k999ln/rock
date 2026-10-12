ALTER TABLE operator_managed_devices ADD COLUMN device_public_key_spki TEXT;
ALTER TABLE operator_managed_devices ADD COLUMN attestation_record_sha256 TEXT;

ALTER TABLE operator_device_commands ADD COLUMN operator_credential_id TEXT;
ALTER TABLE operator_device_commands ADD COLUMN authenticator_data TEXT;
ALTER TABLE operator_device_commands ADD COLUMN client_data_json TEXT;
ALTER TABLE operator_device_commands ADD COLUMN operator_signature TEXT;
ALTER TABLE operator_device_commands ADD COLUMN signed_payload_sha256 TEXT;

CREATE TABLE operator_webauthn_assertions (
  credential_id TEXT NOT NULL,
  sign_count INTEGER NOT NULL CHECK(sign_count > 0),
  command_id TEXT NOT NULL UNIQUE,
  used_at INTEGER NOT NULL,
  PRIMARY KEY(credential_id,sign_count)
);

CREATE TABLE operator_device_request_nonces (
  device_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY(device_id,nonce)
);
CREATE INDEX idx_operator_device_nonces_used
  ON operator_device_request_nonces(used_at);
