CREATE TABLE IF NOT EXISTS noah_instances (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  family_key TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS noah_instances_owner_family ON noah_instances(owner_id,family_key);
CREATE INDEX IF NOT EXISTS noah_instances_owner_updated ON noah_instances(owner_id, updated_at, id);
