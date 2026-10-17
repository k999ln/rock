CREATE TABLE sky_mcp_slots (
  user_id TEXT NOT NULL,
  connection_key TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, connection_key)
);
