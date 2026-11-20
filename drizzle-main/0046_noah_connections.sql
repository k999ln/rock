-- Noah: 接続（Passport）の表。docs/contracts/noah-v1.sql の noah_connections と、その索引 4 つを、そのまま移した（MVP L5）。
-- Launch L5: connections table only. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表（noah_runner_*、noah_intake_*、noah_probe_hosts）は変えない。
-- 鍵の表（noah_connection_secrets）と、相手の許可の表（noah_oauth_*）は、ローンチの後（docs/noah/spec-74-one-click-connect.md の 11.1）。
-- 検証: python3 docs/design-validation/noah/validate-noah-v1.py
-- 値の形: 時刻は epoch ミリ秒。hash は sha256 の hex 64 桁。JSON の列は json_valid を満たす。

-- ---------------------------------------------------------------------------
-- 接続（Passport）。account が正本。端末は cache。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_connections (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),                     -- 接続の操作 ID（client が作る UUID）
  owner_id TEXT NOT NULL,
  family_key TEXT NOT NULL,                                       -- noah_instances.family_key か、noah_intake_families.id
  agent_id TEXT NOT NULL, digest TEXT NOT NULL,                   -- つないだ版（NoahAgentPin.digest か、候補の record_sha256）
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),-- 同じ操作 ID で内容が変わっていないかの検査
  connect_json TEXT NOT NULL CHECK(json_valid(connect_json) AND length(connect_json) <= 16384),   -- 本人が同意した時の接続要件の写し
  connect_sha256 TEXT NOT NULL CHECK(length(connect_sha256) = 64),
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256) = 64),
  tools_sha256 TEXT CHECK(tools_sha256 IS NULL OR length(tools_sha256) = 64),                    -- 同意した時の道具の定義
  confirmed_tools_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(confirmed_tools_json)),       -- 本人が確かめた、読み取りだけでない道具。[{ "name", "sha256" }]（定義が変わったら確かめ直す）
  egress_granted_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(egress_granted_json)),         -- 本人が許した通信先（package）
  place TEXT NOT NULL CHECK(place IN ('provider','home','cloud','pocket')),
  device_id TEXT REFERENCES noah_runner_devices(id),
  runner_command_id TEXT,                                         -- 置き場所が home の時、今の起動（boot）で通った接続の命令（noah_runner_commands.id）
  state TEXT NOT NULL CHECK(state IN ('planned','entitling','preparing','probing','needs_action','connected','failed','unknown','blocked','disconnected')),
  needs_json TEXT CHECK(needs_json IS NULL OR json_valid(needs_json)),      -- needs_action の時、次に本人がやる段（NoahPlanStep と nextStep）
  consent_json TEXT NOT NULL CHECK(json_valid(consent_json)),     -- 同意した権限・送り先・時刻
  price_json TEXT NOT NULL CHECK(json_valid(price_json)),
  cost_taps INTEGER NOT NULL CHECK(cost_taps >= 0), cost_typed INTEGER NOT NULL CHECK(cost_typed >= 0),
  probe_ms INTEGER CHECK(probe_ms IS NULL OR probe_ms >= 0),
  error TEXT CHECK(error IS NULL OR length(error) <= 300),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, connected_at INTEGER, last_used_at INTEGER, disconnected_at INTEGER,
  CHECK((place IN ('home','pocket')) = (device_id IS NOT NULL)),
  CHECK((state = 'disconnected') = (disconnected_at IS NOT NULL)),
  CHECK(state <> 'needs_action' OR needs_json IS NOT NULL),
  CHECK(state <> 'connected' OR connected_at IS NOT NULL)
);
--> statement-breakpoint
-- 同じ本人・同じ系列で、切っていない接続は 1 件。
CREATE UNIQUE INDEX IF NOT EXISTS noah_connections_one_live ON noah_connections(owner_id, family_key) WHERE disconnected_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_connections_owner ON noah_connections(owner_id, updated_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_connections_device ON noah_connections(device_id, state) WHERE device_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_connections_family ON noah_connections(family_key, state);
