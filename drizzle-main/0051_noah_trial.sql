-- Noah: 300 人の試行の表（経路の札・入口・本人の報告）。docs/contracts/noah-shelf-v1.sql の noah_trial_channels・noah_trial_entries・noah_trial_reports と、その索引 2 つを、そのまま移した（task 114）。
-- Trial task 114: channels, entries and reports only. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表は変えない。noah_trial_reports は noah_packages（0050）を指す。
-- 本文（依頼・成果・相手の URL）と、本人の名前を置く列は無い。報告は、本人が自分で入れる数だけ。
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
