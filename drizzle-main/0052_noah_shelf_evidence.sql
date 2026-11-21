-- Noah: 棚の実績の集計と、見せた記録。docs/contracts/noah-shelf-v1.sql の noah_package_evidence・noah_shelf_daily・noah_shelf_seen を、そのまま移した（task 111）。
-- Shelf ranking task 111: evidence and seen records only. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表は変えない。3 つとも noah_packages（0050）を指す。
-- 集計の表と、全員を合わせた見せた記録に、本人の ID は置かない。本人ごとの行（noah_shelf_seen）は、履歴の利用に同意した本人の分と、本人が頼んだ「非表示」だけ。
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
