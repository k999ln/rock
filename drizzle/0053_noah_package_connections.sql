-- Noah: 接続が、どのカードの中でつながれたか（つなげる数を、カードで数える）。docs/contracts/noah-shelf-v1.sql の noah_package_connections と索引を、そのまま移した（task 113）。
-- Plan limits task 113: card membership of connections only. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。既存の表は変えない。noah_connections（0047）と noah_packages（0050）を指す。
-- 行を書くのは、切り替え NOAH_PLAN_LIMITS が開いている時の、カードから始めた接続だけ（lib/noah-connect.ts）。
-- 接続が、どのカードの中でつながれたか。同じカードの中の接続は、つなげる数を 1 と数える（noahLiveCards）。カードの外の接続は、行を持たない。
CREATE TABLE IF NOT EXISTS noah_package_connections (
  connection_id TEXT PRIMARY KEY REFERENCES noah_connections(id),
  package_id TEXT NOT NULL REFERENCES noah_packages(id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS noah_package_connections_package ON noah_package_connections(package_id);
