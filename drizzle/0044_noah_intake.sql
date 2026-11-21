-- Noah: 取り込み・接続（Passport）・相手の許可・頼む・継続運用・利用の記録の DDL 案。
-- Launch L3: intake tables only. Apply locally; production application requires explicit authorization.
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
