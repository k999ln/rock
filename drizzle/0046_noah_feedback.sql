-- Development source only. Do not apply to production during this task.
CREATE TABLE IF NOT EXISTS noah_agent_crowns (
 agent_id TEXT NOT NULL, owner_id TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>=1), request_id TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(agent_id,owner_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_crowns_count ON noah_agent_crowns(agent_id,enabled);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_agent_comments (
 id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 profile_id TEXT NOT NULL REFERENCES sky_social_profiles(id), parent_id TEXT,
 content TEXT NOT NULL CHECK(length(content)<=1000), content_sha256 TEXT NOT NULL,
 created_at INTEGER NOT NULL, deleted_at INTEGER,
 CHECK(parent_id IS NULL OR parent_id<>id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_comments_feed ON noah_agent_comments(agent_id,created_at,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_comments_rate ON noah_agent_comments(owner_id,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_runner_usage ON noah_runner_commands(json_extract(payload,'$.pin.agentId'),owner_id) WHERE kind='run' AND state='succeeded';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_maintenance_requests (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 objective TEXT NOT NULL, repository TEXT NOT NULL, request_sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state='requested'), scope_version TEXT NOT NULL CHECK(scope_version='noah-maintenance-v1'),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_maintenance_owner ON noah_maintenance_requests(owner_id,created_at);
