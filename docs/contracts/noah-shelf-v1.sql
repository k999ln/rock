-- Noah: 棚とパッケージ・実績の集計・見せた記録・つなげる数・300 人の試行の DDL 案。
-- Design contract only. 正式な migration ではない。実装する task が、同じ内容を drizzle/ の新しい番号と db/schema.ts へ移す。
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。
-- 先に docs/contracts/noah-v1.sql の表が要る（noah_connections・noah_asks を読む）。既存の表と、noah-v1.sql の表は、列も意味も変えない。
-- 検証: python3 docs/design-validation/noah/validate-noah-shelf-v1.py
-- 値の形: 時刻は epoch ミリ秒。日付（day）は UTC の yyyymmdd の整数。hash は sha256 の hex 64 桁。
-- 本文（依頼・成果・相手の URL）を置く列は、どの表にも無い。

-- ---------------------------------------------------------------------------
-- 棚のカード（パッケージ）。正本は package_json（docs/contracts/noah-shelf-v1.ts の parseNoahPackage を通った物）。
-- 棚・領域・並び・状態は、問い合わせのための写し。listed・reason は、noahPackageListing の結果の写し。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_packages (
  id TEXT PRIMARY KEY CHECK(id GLOB 'pkg:[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9:-]*' AND length(id) BETWEEN 6 AND 67),
  shelf TEXT NOT NULL CHECK(shelf IN ('earn','learn','life')),
  topic TEXT NOT NULL CHECK(topic IN ('dev','research','support','office','study','home','health')),
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 9999),       -- 運営が決めた並び。小さいほど上
  status TEXT NOT NULL CHECK(status IN ('draft','verified','retired')),
  package_json TEXT NOT NULL CHECK(json_valid(package_json) AND length(package_json) <= 8192),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256) = 64),
  listed INTEGER NOT NULL DEFAULT 0 CHECK(listed IN (0,1)),
  reason TEXT CHECK(reason IS NULL OR reason IN ('retired','draft','advice_unreviewed','later_chain','later_home','step_missing','step_not_running','step_changed')),
  reason_step INTEGER CHECK(reason_step IS NULL OR reason_step BETWEEN 0 AND 5),   -- 理由が工程にある時、その番号（0 から）
  checked_at INTEGER,                                                -- 載せるかを、最後に見直した時刻
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK((listed = 1) = (reason IS NULL)),                            -- 載せていない物には、必ず理由がある
  CHECK(listed = 0 OR status = 'verified'),                          -- 運営が動かして確かめた物だけが載る
  CHECK(reason_step IS NULL OR reason IS NOT NULL)
);
--> statement-breakpoint
-- 棚 1 段: 載せているカードを、運営の順で。
CREATE INDEX IF NOT EXISTS noah_packages_shelf ON noah_packages(shelf, position, id) WHERE listed = 1;
--> statement-breakpoint
-- カードの工程の先。系列が変わった時に、どのカードを見直すかを引く。実績を数える時に、どの系列・どの道具かを引く。
CREATE TABLE IF NOT EXISTS noah_package_steps (
  package_id TEXT NOT NULL REFERENCES noah_packages(id),
  step INTEGER NOT NULL CHECK(step BETWEEN 0 AND 5),
  kind TEXT NOT NULL CHECK(kind IN ('family','home','builtin','owner','gap')),
  ref TEXT NOT NULL CHECK(length(ref) <= 400),      -- family: 系列の ID。home: Agent の ID。builtin: 道具の ID。owner・gap: ''
  tool TEXT CHECK(tool IS NULL OR length(tool) BETWEEN 1 AND 128),   -- family の時、道具の名前
  PRIMARY KEY(package_id, step),
  CHECK((kind = 'family') = (tool IS NOT NULL)),
  CHECK((kind IN ('owner','gap')) = (ref = ''))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_package_steps_ref ON noah_package_steps(kind, ref);
--> statement-breakpoint
-- 接続が、どのカードの中でつながれたか。同じカードの中の接続は、つなげる数を 1 と数える（noahLiveCards）。カードの外の接続は、行を持たない。
CREATE TABLE IF NOT EXISTS noah_package_connections (
  connection_id TEXT PRIMARY KEY REFERENCES noah_connections(id),
  package_id TEXT NOT NULL REFERENCES noah_packages(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_package_connections_package ON noah_package_connections(package_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 実績の集計。カード 1 枚につき 1 行。1 日 1 回、数え直す（noah-shelf-queries-v1.sql の evidence_rollup）。
-- 全部の利用者を合わせた数だけ。本人の ID は置かない。並びに使うのは people が 5 以上の行だけ（NOAH_SHELF_RANK.minPeople）。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_package_evidence (
  package_id TEXT PRIMARY KEY REFERENCES noah_packages(id),
  people INTEGER NOT NULL CHECK(people >= 0),
  connects INTEGER NOT NULL CHECK(connects >= 0), connected INTEGER NOT NULL CHECK(connected >= 0),
  asks INTEGER NOT NULL CHECK(asks >= 0), succeeded INTEGER NOT NULL CHECK(succeeded >= 0),
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed >= 0), accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted >= 0),
  first_users INTEGER NOT NULL CHECK(first_users >= 0), returned INTEGER NOT NULL CHECK(returned >= 0),
  median_seconds INTEGER CHECK(median_seconds IS NULL OR median_seconds >= 0),
  since_at INTEGER NOT NULL, computed_at INTEGER NOT NULL,
  CHECK(connected <= connects AND succeeded <= asks AND accepted <= reviewed AND returned <= first_users)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 見せた記録。
-- noah_shelf_daily: 全員を合わせた数。誰が見たかは置かない。位置は 3 つの区分（noahShelfBand）。
-- noah_shelf_seen: 履歴の利用に同意した本人だけ（今の noah_recommendation_settings.history_enabled）。同意をやめた時・履歴を消した時に、その本人の行を消す。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_shelf_daily (
  day INTEGER NOT NULL CHECK(day BETWEEN 20260101 AND 99991231),
  package_id TEXT NOT NULL REFERENCES noah_packages(id),
  band TEXT NOT NULL CHECK(band IN ('top','mid','low')),
  shown INTEGER NOT NULL DEFAULT 0 CHECK(shown >= 0),     -- 一覧に出した回数
  opened INTEGER NOT NULL DEFAULT 0 CHECK(opened >= 0),   -- そこから詳細を開いた回数
  PRIMARY KEY(day, package_id, band)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_shelf_seen (
  owner_id TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES noah_packages(id),
  shown INTEGER NOT NULL DEFAULT 0 CHECK(shown >= 0),
  opened INTEGER NOT NULL DEFAULT 0 CHECK(opened >= 0),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),          -- 本人が「非表示」にした
  first_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, package_id),
  CHECK(last_at >= first_at)
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 300 人の試行（docs/noah/trial-300.md）。経路の札は、運営が登録した物だけ。本人 1 人につき、入口は 1 行（最初に入ってきた経路）。
-- 報告は、本人が自分で入れる数だけ（出品したか・売れた件数・手取り・掛かった分）。文章は置かない。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noah_trial_channels (
  via TEXT PRIMARY KEY CHECK(via GLOB '[a-z0-9]*' AND via NOT GLOB '*[^a-z0-9-]*' AND length(via) BETWEEN 1 AND 40),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 60),         -- 運営の画面に出す名前（例: 「サロン 11/21 の投稿」）
  wave INTEGER NOT NULL CHECK(wave IN (1,2,3)),
  created_at INTEGER NOT NULL, closed_at INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_trial_entries (
  owner_id TEXT PRIMARY KEY,
  via TEXT NOT NULL REFERENCES noah_trial_channels(via),
  wave INTEGER NOT NULL CHECK(wave IN (1,2,3)),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_trial_entries_via ON noah_trial_entries(via, wave);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS noah_trial_reports (
  owner_id TEXT NOT NULL REFERENCES noah_trial_entries(owner_id),
  package_id TEXT NOT NULL REFERENCES noah_packages(id),
  listed INTEGER NOT NULL CHECK(listed IN (0,1)),                    -- 自分の出品として出したか
  sold INTEGER NOT NULL CHECK(sold BETWEEN 0 AND 999),               -- 売れた件数
  net_yen INTEGER NOT NULL CHECK(net_yen BETWEEN 0 AND 100000000),   -- 販売先の手数料を引いた後の手取り（円）
  minutes INTEGER NOT NULL CHECK(minutes BETWEEN 0 AND 100000),      -- 本人が掛けた分
  reported_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, package_id),
  CHECK(sold = 0 OR listed = 1),                                     -- 出品していない物は、売れていない
  CHECK(net_yen = 0 OR sold > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_trial_reports_package ON noah_trial_reports(package_id);
