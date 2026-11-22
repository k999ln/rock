-- Noah: ピンタレスト風の一覧（2026-11-22 の本人の決定）。保存してまとめるボード・ボードのフォロー・Agent ごとの数えた実績・本人の「表示しない」。
-- Pin grid task 115: boards, board follows, per-agent counted evidence and per-owner hides. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表は変えない。系列は noah_intake_families（0044）を指す。
-- 仕様: docs/noah/spec-115-pin-grid.md の 4 章。

-- ボード。本人が作る、Agent をまとめる入れ物。公開（public）にすると、他の人が開いてフォローできる。
CREATE TABLE IF NOT EXISTS noah_boards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  pins INTEGER NOT NULL DEFAULT 0 CHECK (pins >= 0),
  followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_boards_owner ON noah_boards(owner_id, updated_at DESC);
--> statement-breakpoint
-- ボードに保存した Agent（系列）。同じボードに同じ Agent は 1 回。owner_id はボードの持ち主の写し（本人の保存を引く索引のため）。
CREATE TABLE IF NOT EXISTS noah_board_pins (
  board_id TEXT NOT NULL REFERENCES noah_boards(id),
  family_id TEXT NOT NULL REFERENCES noah_intake_families(id),
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, family_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_board_pins_family ON noah_board_pins(family_id, board_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_board_pins_owner ON noah_board_pins(owner_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_board_pins_board ON noah_board_pins(board_id, created_at DESC);
--> statement-breakpoint
-- 公開ボードのフォロー。フォローした公開ボードに新しく保存された Agent が、一覧の上に混ざる。
CREATE TABLE IF NOT EXISTS noah_board_follows (
  board_id TEXT NOT NULL REFERENCES noah_boards(id),
  follower_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, follower_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_board_follows_follower ON noah_board_follows(follower_id, created_at DESC);
--> statement-breakpoint
-- Agent ごとの、数えた実績（全員の合計。本人の ID は入らない）。並び（人気の順）に使う。votes が 0 の系列は行を持たなくてよい。
-- savers: 保存した人の数。succeeded: 直近 90 日に、頼んで成果が返った人の数。hides: 「表示しない」にした人の数。
-- votes = savers + 2 × succeeded − 5 × hides。hot は Reddit の hot と同じ形（lib/noah-pins.ts の noahPinHot）。anchor_at は、その系列が一覧に載った時刻。
CREATE TABLE IF NOT EXISTS noah_pin_stats (
  family_id TEXT PRIMARY KEY REFERENCES noah_intake_families(id),
  savers INTEGER NOT NULL DEFAULT 0 CHECK (savers >= 0),
  succeeded INTEGER NOT NULL DEFAULT 0 CHECK (succeeded >= 0),
  hides INTEGER NOT NULL DEFAULT 0 CHECK (hides >= 0),
  votes INTEGER NOT NULL DEFAULT 0,
  hot REAL NOT NULL DEFAULT 0,
  anchor_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_pin_stats_hot ON noah_pin_stats(hot DESC, family_id) WHERE votes > 0;
--> statement-breakpoint
-- 本人の「表示しない」。その本人の一覧から外し、数（hides）は全員の合計にだけ足す。
CREATE TABLE IF NOT EXISTS noah_pin_hidden (
  owner_id TEXT NOT NULL,
  family_id TEXT NOT NULL REFERENCES noah_intake_families(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, family_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_pin_hidden_family ON noah_pin_hidden(family_id);
--> statement-breakpoint
-- 実績の数え直し（成果が返った人の数）を、UTC の 1 日に 1 回だけ行うための印。
CREATE TABLE IF NOT EXISTS noah_pin_rollups (
  id TEXT PRIMARY KEY CHECK (id = 'succeeded'),
  day TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
