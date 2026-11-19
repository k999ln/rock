ALTER TABLE noah_agent_uploads ADD COLUMN original_key TEXT;
--> statement-breakpoint
ALTER TABLE noah_agent_uploads ADD COLUMN original_name TEXT;
--> statement-breakpoint
ALTER TABLE noah_agent_uploads ADD COLUMN original_bytes INTEGER;
--> statement-breakpoint
ALTER TABLE noah_agent_uploads ADD COLUMN original_sha256 TEXT;
--> statement-breakpoint
ALTER TABLE noah_agent_uploads ADD COLUMN processing_json TEXT;
