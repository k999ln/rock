CREATE TABLE IF NOT EXISTS noah_compute_chain_payloads (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES noah_compute_jobs(id) ON DELETE CASCADE,
  recipe_json TEXT,
  expires_at INTEGER NOT NULL,
  result_json TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_compute_chain_expiry ON noah_compute_chain_payloads(expires_at) WHERE recipe_json IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS noah_compute_chain_clear_input AFTER UPDATE OF status ON noah_compute_jobs
WHEN NEW.status IN ('completed','cancelled','expired') BEGIN
  UPDATE noah_compute_chain_payloads SET recipe_json=NULL WHERE job_id=NEW.id AND recipe_json IS NOT NULL;
END;
