CREATE TABLE noah_recommendation_settings (
  owner_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision>=1),
  history_enabled INTEGER NOT NULL DEFAULT 0 CHECK(history_enabled IN (0,1)),
  history_since INTEGER NOT NULL DEFAULT 0,
  runtime TEXT NOT NULL DEFAULT 'any' CHECK(runtime IN ('any','headless','local-model','codex')),
  updated_at INTEGER NOT NULL
);
