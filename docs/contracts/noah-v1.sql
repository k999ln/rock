-- Noah: 取り込み・接続（Passport）・相手の許可・頼む・継続運用・利用の記録の DDL 案。
-- Design contract only. 正式な migration ではない。実装する task が、同じ内容を drizzle/ の新しい番号と db/schema.ts へ移す。
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表（noah_runner_*、noah_instances、noah_discovery_*）は変えない。
-- 検証: python3 docs/design-validation/noah/validate-noah-v1.py
-- 値の形: 時刻は epoch ミリ秒。hash は sha256 の hex 64 桁。JSON の列は json_valid を満たす。

-- ---------------------------------------------------------------------------
-- 取り込み。今の発見（noah_discovery_*）は、出どころを 'github','huggingface' に固定する CHECK を持ち、
-- 鍵がリポジトリで、上限が 10,000 件。SQLite は CHECK だけを変えられないので、取り込みは別の表にする。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_intake_sources (
  id TEXT PRIMARY KEY CHECK(id IN ('mcp-registry','hf-mcp-space','acp-registry')),
  lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL DEFAULT 0, last_attempt_at INTEGER, last_success_at INTEGER,
  cursor TEXT,                 -- 途中の頁。1 巡が終わったら NULL
  updated_since TEXT,          -- 進行中の巡回が使っている updated_since（1 巡の間は同じ値。全件の巡回は NULL）
  sweep_started_at INTEGER,    -- 進行中の巡回を始めた時刻。全件の巡回では、これより前に見た切りの行を、取り下げとして扱う
  checkpoint_at INTEGER,       -- 最後に書き終えた巡回を、始めた時刻。次の「更新された物だけ」は、ここから 10 分さかのぼって読む
  last_full_at INTEGER,        -- 最後に書き終えた全件の巡回を、始めた時刻。7 日たったら、もう一度全件を読む
  error_code TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
  observed INTEGER NOT NULL DEFAULT 0, withdrawn INTEGER NOT NULL DEFAULT 0, request_count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_intake_candidates (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 3 AND 300),       -- '出どころ:鍵'。例 'mcp-registry:ac.mizan/registry'
  source TEXT NOT NULL REFERENCES noah_intake_sources(id),
  external_key TEXT NOT NULL,
  family_id TEXT NOT NULL,                                        -- 名寄せの結果（noah-regroup-v1.sql。規則は groupNoahFamilies と同じ）
  group_key TEXT NOT NULL,                                        -- 名寄せに使う鍵。台帳は名前空間、Space は小文字にした名前、ACP は id
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 500), -- 出どころの説明（そのまま）
  summary_ja TEXT CHECK(summary_ja IS NULL OR length(summary_ja) <= 200),   -- 自動で作った日本語の 1 行
  repository TEXT,                                                -- 比べられる形にした鍵（noahRepositoryKey。例 'github.com/owner/name'）
  host TEXT,                                                      -- 接続先の host。端末で動かす配布は NULL
  record_sha256 TEXT NOT NULL CHECK(length(record_sha256) = 64),
  record_json TEXT NOT NULL CHECK(json_valid(record_json) AND length(record_json) <= 65536),
  state TEXT NOT NULL CHECK(state IN ('active','unsupported','withdrawn')),
  reason TEXT,                                                    -- unsupported の理由（NOAH_INTAKE_REASONS）
  running INTEGER NOT NULL DEFAULT 1 CHECK(running IN (0,1)),     -- Space が動いているか。他は 1
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
  setup INTEGER NOT NULL CHECK(setup IN (0,1)),                   -- 本人の入力が要る（secrets が 1 つ以上）
  oauth_json TEXT CHECK(oauth_json IS NULL OR json_valid(oauth_json)),      -- 許可の取り方（issuer・method・scope）。token は入れない
  tools_sha256 TEXT CHECK(tools_sha256 IS NULL OR length(tools_sha256) = 64),
  tool_count INTEGER CHECK(tool_count IS NULL OR tool_count >= 0),
  read_only INTEGER CHECK(read_only IS NULL OR read_only IN (0,1)),         -- 全部の道具が読み取りだけか
  form_tools INTEGER CHECK(form_tools IS NULL OR form_tools >= 0),          -- 入力欄で使える道具の数（noahFormSummary）。定義そのものは保存しない
  one_tap_tools INTEGER CHECK(one_tap_tools IS NULL OR one_tap_tools >= 0), -- そのうち、読み取りだけで必須の入力が無い道具の数（押すだけで頼める）
  level INTEGER NOT NULL CHECK(level IN (0,1,2)),
  result TEXT NOT NULL CHECK(result IN ('unchecked','ok','auth_required','payment_required','forbidden','rate_limited','unreachable','incompatible','too_large','blocked')),
  latency_ms INTEGER CHECK(latency_ms IS NULL OR latency_ms >= 0),
  sample_json TEXT CHECK(sample_json IS NULL OR (json_valid(sample_json) AND length(sample_json) <= 4096)),   -- 見本（道具の名前・入力・成果の先頭 500 文字）
  checked_at INTEGER, l1_at INTEGER, l2_at INTEGER,                -- checked_at は、巡回が最後に握手した時刻（利用者の接続・依頼では書き換えない）。l1_at・l2_at は、その段になった時刻
  next_check_at INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0 CHECK(failures >= 0), first_failure_at INTEGER,
  lease_until INTEGER NOT NULL DEFAULT 0,
  CHECK(level = 0 OR (tools_sha256 IS NOT NULL AND l1_at IS NOT NULL)),
  CHECK(level < 2 OR l2_at IS NOT NULL),
  CHECK((failures = 0) = (first_failure_at IS NULL))
);
--> statement-breakpoint
-- 巡回が次に握手する物。握手できるのは、相手のサーバーの口で、本人の鍵の入力が要らない候補だけ（端末で動かす配布と、鍵の要る物を、毎回読み飛ばさない）。
CREATE INDEX IF NOT EXISTS noah_intake_checks_due ON noah_intake_checks(next_check_at, lease_until) WHERE setup = 0 AND mouth IN ('mcp-remote','space-mcp','a2a');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_checks_level ON noah_intake_checks(level, l2_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_intake_families (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 3 AND 400),
  representative_id TEXT NOT NULL REFERENCES noah_intake_candidates(id),
  members INTEGER NOT NULL CHECK(members >= 1),
  level INTEGER NOT NULL CHECK(level IN (0,1,2)), l2_at INTEGER,
  badge_hint TEXT NOT NULL CHECK(badge_hint IN ('one_click','taps','setup','unverified','blocked')),   -- サインイン済みで端末の無い本人から見た印
  connections INTEGER NOT NULL DEFAULT 0 CHECK(connections >= 0),  -- 今つないでいる本人の数（見回りの間隔に使う）
  listed INTEGER NOT NULL DEFAULT 0 CHECK(listed IN (0,1)),        -- ローンチの一覧に載せる（noahListing と同じ条件。noah-regroup-v1.sql が計算する）
  one_tap INTEGER NOT NULL DEFAULT 0 CHECK(one_tap IN (0,1)),      -- 押すだけで頼める道具がある（一覧の絞り込み）
  shuffle INTEGER NOT NULL DEFAULT 0 CHECK(shuffle >= 0),          -- 「まだ誰も動かしていない」の並び。1 日 1 回、引き直す（名前の順・更新の多さで並べない）
  claimed_by TEXT, claimed_at INTEGER, withdrawn_at INTEGER, hidden_at INTEGER,
  updated_at INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK((claimed_by IS NULL) = (claimed_at IS NULL))
);
--> statement-breakpoint
-- タイムライン: L2 が新しい順。取り下げた物と隠した物は載せない。
CREATE INDEX IF NOT EXISTS noah_intake_families_timeline ON noah_intake_families(l2_at DESC, id) WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL;
--> statement-breakpoint
-- ローンチの一覧の「まだ誰も動かしていない」: 握手まで（L1）の系列を、その日の並びで。
CREATE INDEX IF NOT EXISTS noah_intake_families_listed ON noah_intake_families(shuffle DESC, id) WHERE listed = 1 AND level = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL;
--> statement-breakpoint
-- 握手・実行で checks を書いた時、その候補が代表の系列の行も同じ値にする。
CREATE INDEX IF NOT EXISTS noah_intake_families_representative ON noah_intake_families(representative_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_intake_families_claimed ON noah_intake_families(claimed_by) WHERE claimed_by IS NOT NULL;
--> statement-breakpoint
-- 接続先（host）ごとの礼儀。巡回: 同じ host へは 1 時間に 1 回（last_probe_at）。429 の Retry-After を守る（not_before。巡回も、利用者の操作も待つ）。
-- 利用者の操作から始める握手（接続・道具の一覧・依頼）: 全員合わせて、60 秒の枠に決まった回数まで（user_window_at・user_count。noah-listing-v1.sql の host_take）。
CREATE TABLE IF NOT EXISTS noah_probe_hosts (
  host TEXT PRIMARY KEY, last_probe_at INTEGER NOT NULL, not_before INTEGER NOT NULL DEFAULT 0,
  user_window_at INTEGER NOT NULL DEFAULT 0, user_count INTEGER NOT NULL DEFAULT 0 CHECK(user_count >= 0)
);
--> statement-breakpoint

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
--> statement-breakpoint
-- 本人が入れた鍵（header・環境変数・URL の変数・引数）。暗号化した値だけを置く。一覧の API に出さない。
CREATE TABLE IF NOT EXISTS noah_connection_secrets (
  connection_id TEXT NOT NULL REFERENCES noah_connections(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  value_ciphertext TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(connection_id, name)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 相手の許可（OAuth）。token は Broker だけが持つ。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_oauth_clients (
  issuer TEXT PRIMARY KEY, client_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cimd','dcr')),
  registration_json TEXT NOT NULL CHECK(json_valid(registration_json)), created_at INTEGER NOT NULL
);
--> statement-breakpoint
-- 認可の往復 1 回分。state は hash で持ち、1 回使ったら使えない。10 分で切れる。
CREATE TABLE IF NOT EXISTS noah_oauth_states (
  state_sha256 TEXT PRIMARY KEY CHECK(length(state_sha256) = 64),
  owner_id TEXT NOT NULL, connection_id TEXT NOT NULL REFERENCES noah_connections(id),
  service_id TEXT NOT NULL, issuer TEXT NOT NULL, resource TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL, redirect_uri TEXT NOT NULL, return_path TEXT NOT NULL CHECK(return_path LIKE '/noah%'),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_oauth_grants (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
  service_id TEXT NOT NULL, resource TEXT NOT NULL, issuer TEXT NOT NULL, scopes TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL, refresh_ciphertext TEXT, expires_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revoked_at INTEGER
);
--> statement-breakpoint
-- 同じ本人・同じ接続先で、有効な許可は 1 件。
CREATE UNIQUE INDEX IF NOT EXISTS noah_oauth_grants_live ON noah_oauth_grants(owner_id, resource) WHERE revoked_at IS NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 頼む（置き場所が provider の仕事）。置き場所が home の仕事は、今の noah_runner_commands のまま。
-- 依頼と成果の本文は既存 Work にだけ置く。ここに置くのは、状態と、照合に使う hash。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_asks (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),                     -- 依頼の操作 ID
  owner_id TEXT NOT NULL, connection_id TEXT NOT NULL REFERENCES noah_connections(id),
  work_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
  mode TEXT NOT NULL CHECK(mode IN ('agent','form')),             -- agent: 1 文で頼む。form: 入力欄から道具を 1 回呼ぶ
  host TEXT,                                                      -- 送り先の host（置き場所が provider の時）。同じ接続先へ集まりすぎないための数え方に使う
  tool TEXT CHECK(tool IS NULL OR length(tool) BETWEEN 1 AND 128),-- form の時、呼ぶ道具の名前
  tool_sha256 TEXT CHECK(tool_sha256 IS NULL OR length(tool_sha256) = 64),   -- form の時、本人が見た道具の定義
  screen TEXT CHECK(screen IS NULL OR screen IN ('narrow','wide')),          -- 頼んだ画面の幅の区分（600 未満が narrow）。「スマホで使われるか」を数えるためだけに持つ
  state TEXT NOT NULL CHECK(state IN ('queued','running','your_turn','succeeded','failed','stopped','limit','unknown')),
  stop_requested INTEGER NOT NULL DEFAULT 0 CHECK(stop_requested IN (0,1)),
  pending_json TEXT CHECK(pending_json IS NULL OR json_valid(pending_json)),   -- あなたの番で確かめている道具の名前と入力
  step INTEGER NOT NULL DEFAULT 0 CHECK(step >= 0),               -- 終えた step の数。同じ step を 2 回実行しないための番号
  lease_until INTEGER NOT NULL DEFAULT 0,
  model_calls INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT CHECK(error IS NULL OR length(error) <= 300),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, finished_at INTEGER,
  CHECK((state = 'your_turn') = (pending_json IS NOT NULL)),
  CHECK((state IN ('succeeded','failed','stopped','limit','unknown')) = (finished_at IS NOT NULL)),
  CHECK(mode <> 'form' OR (tool IS NOT NULL AND tool_sha256 IS NOT NULL AND host IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_asks_owner ON noah_asks(owner_id, updated_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_asks_open ON noah_asks(state, lease_until) WHERE finished_at IS NULL;
--> statement-breakpoint
-- 頼む前の上限（noahAskGate）: 本人の直近 60 秒と今日、接続先の直近 60 秒を数える。
CREATE INDEX IF NOT EXISTS noah_asks_owner_created ON noah_asks(owner_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_asks_host_created ON noah_asks(host, created_at) WHERE host IS NOT NULL;
--> statement-breakpoint
-- 同じ本人の、動いている依頼は 8 件まで（今の noah_runner_commands と同じ上限）。上限は API の INSERT で数える。

-- ---------------------------------------------------------------------------
-- 継続運用。正本を account に置く。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_standing_works (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),
  owner_id TEXT NOT NULL, connection_id TEXT NOT NULL REFERENCES noah_connections(id),
  prompt TEXT NOT NULL CHECK(length(prompt) BETWEEN 1 AND 12000),
  trigger_json TEXT NOT NULL CHECK(json_valid(trigger_json)),     -- { "everySeconds": 3600 }
  limits_json TEXT NOT NULL CHECK(json_valid(limits_json)),       -- { "maxRuns": 100, "until": <ms>, "maxCostMinor": 0 }
  state TEXT NOT NULL CHECK(state IN ('active','paused','stopped','limit_reached','failed_stopped')),
  runs INTEGER NOT NULL DEFAULT 0 CHECK(runs >= 0), failures INTEGER NOT NULL DEFAULT 0 CHECK(failures >= 0),
  next_run_at INTEGER, last_run_at INTEGER,
  revision INTEGER NOT NULL CHECK(revision >= 1), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  CHECK((state = 'active') = (next_run_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_standing_works_due ON noah_standing_works(next_run_at) WHERE state = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_standing_works_owner ON noah_standing_works(owner_id, updated_at);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 利用の記録。1 つの仕事につき 1 行。本文は入れない。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_usage_events (
  id TEXT PRIMARY KEY,                                            -- 仕事の ID（noah_asks.id か noah_runner_commands.id）
  owner_id TEXT NOT NULL, connection_id TEXT, family_key TEXT NOT NULL, digest TEXT NOT NULL,
  place TEXT NOT NULL CHECK(place IN ('provider','home','cloud','pocket')),
  mouth TEXT NOT NULL CHECK(mouth IN ('mcp-remote','space-mcp','a2a','mcp-package','acp','source')),
  result TEXT NOT NULL CHECK(result IN ('succeeded','failed','stopped','limit','unknown')),
  seconds INTEGER NOT NULL CHECK(seconds >= 0),
  model_calls INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER CHECK(cost_micro_usd IS NULL OR cost_micro_usd >= 0),   -- 計測できなかった費用は NULL。0 と書かない
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK(price_minor >= 0), currency TEXT NOT NULL DEFAULT 'JPY',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_usage_events_owner ON noah_usage_events(owner_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_usage_events_family ON noah_usage_events(family_key, created_at);
