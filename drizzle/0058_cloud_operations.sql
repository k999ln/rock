CREATE TABLE cloud_usage_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  usage_json TEXT NOT NULL CHECK (json_valid(usage_json)),
  price_version TEXT NOT NULL,
  cost_usd REAL CHECK (cost_usd >= 0)
);
--> statement-breakpoint
CREATE INDEX idx_cloud_usage_observed_at ON cloud_usage_records(observed_at);
--> statement-breakpoint
CREATE TABLE cloud_admission_probes (
  slot_at INTEGER PRIMARY KEY NOT NULL CHECK (slot_at >= 0 AND slot_at % 300000 = 0),
  observed_at INTEGER NOT NULL CHECK (observed_at >= slot_at AND observed_at < slot_at + 300000),
  status_code INTEGER CHECK (status_code BETWEEN 100 AND 599),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE cloud_execution_timings (
  source TEXT NOT NULL CHECK (source IN ('remote_text', 'a2a', 'free_cloud')),
  execution_id TEXT NOT NULL,
  admitted_at INTEGER NOT NULL,
  first_result_at INTEGER CHECK (first_result_at >= admitted_at),
  PRIMARY KEY (source, execution_id)
);
--> statement-breakpoint
CREATE INDEX idx_cloud_execution_admitted_at ON cloud_execution_timings(admitted_at);
--> statement-breakpoint
CREATE TRIGGER cloud_remote_text_admitted AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state = 'quoted' AND NEW.state = 'reserved'
BEGIN
  INSERT INTO cloud_execution_timings (source, execution_id, admitted_at)
  VALUES ('remote_text', NEW.id, NEW.updated_at)
  ON CONFLICT DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER cloud_remote_text_first_result AFTER UPDATE OF state ON remote_ai_text_executions
WHEN OLD.state <> 'completed' AND NEW.state = 'completed'
BEGIN
  UPDATE cloud_execution_timings SET first_result_at = MAX(admitted_at, NEW.updated_at)
  WHERE source = 'remote_text' AND execution_id = NEW.id AND first_result_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER cloud_a2a_admitted AFTER INSERT ON agent_delegation_events
WHEN NEW.event_type = 'user_approved'
BEGIN
  INSERT INTO cloud_execution_timings (source, execution_id, admitted_at)
  VALUES ('a2a', NEW.delegation_id, NEW.created_at)
  ON CONFLICT DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER cloud_a2a_first_result AFTER INSERT ON agent_delegation_events
WHEN NEW.event_type = 'remote_artifacts_captured'
BEGIN
  UPDATE cloud_execution_timings SET first_result_at = MAX(admitted_at, NEW.created_at)
  WHERE source = 'a2a' AND execution_id = NEW.delegation_id AND first_result_at IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER cloud_free_text_admitted AFTER INSERT ON work_jobs
WHEN json_extract(NEW.payload, '$.templateId') = 'free-cloud-text'
  AND json_extract(NEW.payload, '$.freeCloud.state') IN ('queued', 'prepared')
  AND unixepoch(NEW.updated_at, 'subsec') IS NOT NULL
BEGIN
  INSERT INTO cloud_execution_timings (source, execution_id, admitted_at)
  VALUES ('free_cloud', NEW.id, CAST(ROUND(unixepoch(NEW.updated_at, 'subsec') * 1000) AS INTEGER))
  ON CONFLICT DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER cloud_free_text_first_result AFTER UPDATE OF payload ON work_jobs
WHEN json_extract(NEW.payload, '$.templateId') = 'free-cloud-text'
  AND json_extract(NEW.payload, '$.freeCloud.state') = 'completed'
  AND json_extract(OLD.payload, '$.freeCloud.state') <> 'completed'
  AND unixepoch(NEW.updated_at, 'subsec') IS NOT NULL
BEGIN
  UPDATE cloud_execution_timings
  SET first_result_at = MAX(admitted_at, CAST(ROUND(unixepoch(NEW.updated_at, 'subsec') * 1000) AS INTEGER))
  WHERE source = 'free_cloud' AND execution_id = NEW.id AND first_result_at IS NULL;
END;
