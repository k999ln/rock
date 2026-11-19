CREATE TABLE noah_feed_preferences (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('follow','hide','interest','personalize')),
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 160),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, kind, subject)
);
