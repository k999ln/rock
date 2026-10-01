CREATE TABLE operator_managed_devices (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  model TEXT NOT NULL,
  os_version TEXT NOT NULL,
  status TEXT NOT NULL,
  trust_state TEXT NOT NULL,
  channel_state TEXT NOT NULL,
  key_fingerprint TEXT,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_operator_devices_status_seen
  ON operator_managed_devices(status,last_seen_at);
CREATE INDEX idx_operator_devices_owner
  ON operator_managed_devices(owner_user_id,created_at);

CREATE TABLE operator_device_commands (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  operator_user_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  not_before INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  completed_at INTEGER,
  result_code TEXT
);
CREATE INDEX idx_operator_commands_device_status
  ON operator_device_commands(device_id,status,issued_at);
CREATE INDEX idx_operator_commands_incident
  ON operator_device_commands(incident_id,issued_at);

CREATE TABLE operator_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  command_id TEXT,
  actor_user_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  event TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_operator_audit_device_created
  ON operator_audit_events(device_id,created_at);
CREATE INDEX idx_operator_audit_incident_created
  ON operator_audit_events(incident_id,created_at);
CREATE TRIGGER operator_audit_events_no_update
BEFORE UPDATE ON operator_audit_events
BEGIN SELECT RAISE(ABORT, 'operator audit immutable'); END;
CREATE TRIGGER operator_audit_events_no_delete
BEFORE DELETE ON operator_audit_events
BEGIN SELECT RAISE(ABORT, 'operator audit immutable'); END;
