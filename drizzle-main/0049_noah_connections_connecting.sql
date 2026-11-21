-- Noah: つなぐ途中で止まった接続を、後始末が拾うための索引。docs/contracts/noah-v1.sql の noah_connections_connecting を、そのまま移した（MVP L7）。
-- Launch L7: one partial index only. Apply locally; production application requires explicit authorization.
-- 本番 D1 への適用は、本人の明示の許可の後（AGENTS.md §6）。表と、今ある索引（drizzle/0047_noah_connections.sql）は変えない。
-- 検証: python3 docs/design-validation/noah/validate-noah-v1.py

-- つなぐ途中（planned〜probing）のまま止まった接続を、巡回の後始末が拾う（spec-88 の 9.5）。その接続だけを持つ、小さな索引。
-- 問い合わせは、この WHERE と同じ式（IN の並びも同じ）で書く。式が違うと、この索引は使われない。
CREATE INDEX IF NOT EXISTS noah_connections_connecting ON noah_connections(updated_at) WHERE disconnected_at IS NULL AND state IN ('planned','entitling','preparing','probing');
