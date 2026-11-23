CREATE TABLE `noah_agent_availability` (
	`project_id` text PRIMARY KEY NOT NULL,
	`protocol` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`endpoints_json` text NOT NULL,
	`state` text NOT NULL,
	`checked_at` integer NOT NULL,
	`success_at` integer,
	`success_digest` text,
	`failure_at` integer,
	`next_check_at` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "noah_agent_availability_state" CHECK("noah_agent_availability"."state" IN ('connected','verified','unavailable')),
	CONSTRAINT "noah_agent_availability_protocol" CHECK("noah_agent_availability"."protocol" IN ('gradio','mcp')),
	CONSTRAINT "noah_agent_availability_manifest" CHECK(length("noah_agent_availability"."manifest_hash") = 64),
	CONSTRAINT "noah_agent_availability_endpoints" CHECK(json_valid("noah_agent_availability"."endpoints_json"))
);
--> statement-breakpoint
CREATE INDEX `noah_agent_availability_due` ON `noah_agent_availability` (`next_check_at`,`lease_until`);
