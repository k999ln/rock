-- Noah smartphone launch. Local validation only; production application requires approval.
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
