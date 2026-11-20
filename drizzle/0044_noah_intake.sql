CREATE TABLE IF NOT EXISTS noah_intake_sources (
  id TEXT PRIMARY KEY CHECK(id IN ('mcp-registry','hf-mcp-space','acp-registry')),
  lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL DEFAULT 0, last_attempt_at INTEGER, last_success_at INTEGER,
  cursor TEXT,
  updated_since TEXT,
  sweep_started_at INTEGER,
  checkpoint_at INTEGER,
  last_full_at INTEGER,
  error_code TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
  observed INTEGER NOT NULL DEFAULT 0, withdrawn INTEGER NOT NULL DEFAULT 0, request_count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_intake_candidates (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 3 AND 300),
  source TEXT NOT NULL REFERENCES noah_intake_sources(id),
  external_key TEXT NOT NULL,
  family_id TEXT NOT NULL,
  group_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 500),
  summary_ja TEXT CHECK(summary_ja IS NULL OR length(summary_ja) <= 200),
  repository TEXT,
  host TEXT,
  record_sha256 TEXT NOT NULL CHECK(length(record_sha256) = 64),
  record_json TEXT NOT NULL CHECK(json_valid(record_json) AND length(record_json) <= 65536),
  state TEXT NOT NULL CHECK(state IN ('active','unsupported','withdrawn')),
  reason TEXT,
  running INTEGER NOT NULL DEFAULT 1 CHECK(running IN (0,1)),
  likes INTEGER NOT NULL DEFAULT 0 CHECK(likes >= 0),
  source_updated_at INTEGER,
  first_seen_at INTEGER NOT NULL, changed_at INTEGER NOT NULL, seen_at INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK((state = 'unsupported') = (reason IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS noah_intake_candidates_key ON noah_intake_candidates(source, external_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_candidates_family ON noah_intake_candidates(family_id, state);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_candidates_sweep ON noah_intake_candidates(source, state, seen_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_candidates_repository ON noah_intake_candidates(repository) WHERE repository IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_candidates_group ON noah_intake_candidates(source, group_key, host);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_intake_checks (
  candidate_id TEXT PRIMARY KEY REFERENCES noah_intake_candidates(id),
  mouth TEXT NOT NULL CHECK(mouth IN ('mcp-remote','space-mcp','a2a','mcp-package','acp','source')),
  surface TEXT NOT NULL CHECK(surface IN ('none','terminal','browser','screen','own-device')),
  auth TEXT NOT NULL CHECK(auth IN ('none','oauth','key','payment','unknown')),
  connect_json TEXT NOT NULL CHECK(json_valid(connect_json) AND length(connect_json) <= 16384),
  connect_sha256 TEXT NOT NULL CHECK(length(connect_sha256) = 64),
  setup INTEGER NOT NULL CHECK(setup IN (0,1)),
  oauth_json TEXT CHECK(oauth_json IS NULL OR json_valid(oauth_json)),
  tools_sha256 TEXT CHECK(tools_sha256 IS NULL OR length(tools_sha256) = 64),
  tool_count INTEGER CHECK(tool_count IS NULL OR tool_count >= 0),
  read_only INTEGER CHECK(read_only IS NULL OR read_only IN (0,1)),
  form_tools INTEGER CHECK(form_tools IS NULL OR form_tools >= 0),
  one_tap_tools INTEGER CHECK(one_tap_tools IS NULL OR one_tap_tools >= 0),
  level INTEGER NOT NULL CHECK(level IN (0,1,2)),
  result TEXT NOT NULL CHECK(result IN ('unchecked','ok','auth_required','payment_required','forbidden','rate_limited','unreachable','incompatible','too_large','blocked')),
  latency_ms INTEGER CHECK(latency_ms IS NULL OR latency_ms >= 0),
  sample_json TEXT CHECK(sample_json IS NULL OR (json_valid(sample_json) AND length(sample_json) <= 4096)),
  checked_at INTEGER, l1_at INTEGER, l2_at INTEGER,
  next_check_at INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0 CHECK(failures >= 0), first_failure_at INTEGER,
  lease_until INTEGER NOT NULL DEFAULT 0,
  CHECK(level = 0 OR (tools_sha256 IS NOT NULL AND l1_at IS NOT NULL)),
  CHECK(level < 2 OR l2_at IS NOT NULL),
  CHECK((failures = 0) = (first_failure_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_checks_due ON noah_intake_checks(next_check_at, lease_until) WHERE setup = 0 AND mouth IN ('mcp-remote','space-mcp','a2a');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_checks_level ON noah_intake_checks(level, l2_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_intake_families (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 3 AND 400),
  representative_id TEXT NOT NULL REFERENCES noah_intake_candidates(id),
  members INTEGER NOT NULL CHECK(members >= 1),
  level INTEGER NOT NULL CHECK(level IN (0,1,2)), l2_at INTEGER,
  badge_hint TEXT NOT NULL CHECK(badge_hint IN ('one_click','taps','setup','unverified','blocked')),
  connections INTEGER NOT NULL DEFAULT 0 CHECK(connections >= 0),
  listed INTEGER NOT NULL DEFAULT 0 CHECK(listed IN (0,1)),
  one_tap INTEGER NOT NULL DEFAULT 0 CHECK(one_tap IN (0,1)),
  shuffle INTEGER NOT NULL DEFAULT 0 CHECK(shuffle >= 0),
  claimed_by TEXT, claimed_at INTEGER, withdrawn_at INTEGER, hidden_at INTEGER,
  updated_at INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK((claimed_by IS NULL) = (claimed_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_families_timeline ON noah_intake_families(l2_at DESC, id) WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_families_listed ON noah_intake_families(shuffle DESC, id) WHERE listed = 1 AND level = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_families_representative ON noah_intake_families(representative_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_families_claimed ON noah_intake_families(claimed_by) WHERE claimed_by IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_probe_hosts (
  host TEXT PRIMARY KEY, last_probe_at INTEGER NOT NULL, not_before INTEGER NOT NULL DEFAULT 0,
  user_window_at INTEGER NOT NULL DEFAULT 0, user_count INTEGER NOT NULL DEFAULT 0 CHECK(user_count >= 0)
);
