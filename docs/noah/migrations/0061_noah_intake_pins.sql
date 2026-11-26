ALTER TABLE noah_intake_candidates ADD COLUMN pin_json TEXT
  CHECK (pin_json IS NULL OR (length(CAST(pin_json AS BLOB)) <= 2048 AND json_valid(pin_json)));
--> statement-breakpoint
ALTER TABLE noah_intake_candidates ADD COLUMN pin_source_sha256 TEXT
  CHECK (pin_source_sha256 IS NULL OR (length(pin_source_sha256) = 64 AND pin_source_sha256 NOT GLOB '*[^0-9a-f]*'));
--> statement-breakpoint
ALTER TABLE noah_intake_candidates ADD COLUMN pin_model TEXT
  CHECK (pin_model IS NULL OR length(pin_model) BETWEEN 1 AND 128);
--> statement-breakpoint
ALTER TABLE noah_intake_candidates ADD COLUMN pin_at INTEGER
  CHECK (pin_at IS NULL OR (typeof(pin_at) = 'integer' AND pin_at > 0));
--> statement-breakpoint
ALTER TABLE noah_intake_candidates ADD COLUMN pin_skip TEXT
  CHECK (pin_skip IS NULL OR (pin_json IS NULL AND pin_skip IN ('unclear', 'no_template', 'not_for_people', 'invalid')));
