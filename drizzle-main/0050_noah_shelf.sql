-- Noah: 棚のカード（パッケージ）と、その工程の先の表。docs/contracts/noah-shelf-v1.sql の noah_packages・noah_package_steps と、その索引 2 つを、そのまま移した（task 110）。
-- Shelf task 110: cards and their steps only. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表（noah_intake_*、noah_connections、noah_asks）は変えない。
-- 実績の集計・見せた記録・つなげる数・試行の表（noah_package_evidence ほか 7 つ）は、task 111・113・114 で足す。
-- 正本は package_json（lib/noah-shelf.ts の parseNoahPackage を通った物）。棚・領域・並び・状態・載せる判定は、問い合わせのための写し。
-- 値の形: 時刻は epoch ミリ秒。hash は sha256 の hex 64 桁。JSON の列は json_valid を満たす。本文（依頼・成果・相手の URL）を置く列は無い。
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
-- カードの工程の先。系列が変わった時に、どのカードを見直すかを引く。
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
