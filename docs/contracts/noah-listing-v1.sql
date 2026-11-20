-- Noah: ローンチの一覧（タイムライン・検索）と、つなぐ前・頼む前の上限の問い合わせ。
-- Design contract only. 実装する task が、同じ文を lib/ へ移す（文字列のまま。書き直さない）。
-- 載せる条件の正本は docs/contracts/noah-intake-v1.ts の noahListing。系列の行の listed・one_tap は noah-regroup-v1.sql と、下の touch が書く。
-- 検証: python3 docs/design-validation/noah/validate-noah-v1.py（索引を使うこと、頁の継ぎ目で重ならず抜けないこと、表と同じ結果になること）。
-- 文の名前は「-- name: …」。引数は :名前。

-- name: ran
-- 「動いた」: 人が動かして成果が返った系列（L2）。新しい順。最初の頁は :before_at = 9007199254740991、:after_id = ''。
SELECT id, l2_at FROM noah_intake_families
 WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL AND listed = 1
   AND (l2_at < :before_at OR (l2_at = :before_at AND id > :after_id))
 ORDER BY l2_at DESC, id LIMIT :limit;
--> statement-breakpoint
-- name: new
-- 「まだ誰も動かしていない」: 握手まで（L1）の系列。その日の並び（shuffle）。:one_tap = 1 で、押すだけで頼める物だけ。
-- 最初の頁は :before = 1000000000、:after_id = ''。
SELECT id, shuffle FROM noah_intake_families
 WHERE listed = 1 AND level = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL
   AND (:one_tap = 0 OR one_tap = 1)
   AND (shuffle < :before OR (shuffle = :before AND id > :after_id))
 ORDER BY shuffle DESC, id LIMIT :limit;
--> statement-breakpoint
-- name: reshuffle
-- 並びの引き直し。UTC の日付が変わって最初の巡回で 1 回。名前の順や、台帳での更新の多さが並びに出ないようにする。
UPDATE noah_intake_families SET shuffle = abs(random()) % 1000000000 WHERE listed = 1 AND level = 1;
--> statement-breakpoint
-- name: touch
-- 握手・実行で noah_intake_checks を書いた直後に、その候補が代表の系列へ写す（次の名寄せを待たない）。
-- :listed・:one_tap・:badge_hint は noahListing の結果から。L2 になった時は :l2_at に時刻、それ以外は今の値のまま（COALESCE）。
UPDATE noah_intake_families
   SET level = :level, l2_at = CASE WHEN :level = 2 THEN COALESCE(:l2_at, l2_at) ELSE NULL END, badge_hint = :badge_hint,
       listed = :listed, one_tap = :one_tap, updated_at = :now, revision = revision + 1
 WHERE representative_id = :candidate_id;
--> statement-breakpoint
-- name: search
-- 語で探す（名前と説明の部分一致）。載せている系列だけ。:like は、% と _ と \ を \ で逃がした語の前後に % を付けた物。
-- 載せている系列（約 18,000）を読む。件数が 10 万を越えたら、検索用の表を足す。
SELECT f.id FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id = f.representative_id
 WHERE f.listed = 1 AND f.level >= 1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL
   AND (c.name LIKE :like ESCAPE '\' OR c.summary LIKE :like ESCAPE '\')
 ORDER BY f.level DESC, f.shuffle DESC, f.id LIMIT :limit OFFSET :offset;
--> statement-breakpoint
-- name: counts
-- 運営の画面: 載せている数と、載せていない理由を数えるための集計。理由そのものは、行ごとに noahListing が決める。
SELECT c.source, c.state, (c.family_id LIKE 'bulk:%') AS bulk, k.mouth, k.setup, k.auth, k.result, k.level,
       (COALESCE(k.form_tools, 0) >= 1) AS has_form, (COALESCE(k.one_tap_tools, 0) >= 1) AS has_one_tap, COUNT(*) AS n
  FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id
 GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;
--> statement-breakpoint
-- name: gate
-- 頼む前の上限（noahAskGate へ渡す 4 つの数）。:minute_ago = 今 - 60,000、:day_ago = 今 - 86,400,000。
SELECT (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND finished_at IS NULL) AS open,
       (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND created_at > :minute_ago) AS last_minute,
       (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND created_at > :day_ago) AS last_day,
       (SELECT COUNT(*) FROM noah_asks WHERE host = :host AND created_at > :minute_ago) AS host_last_minute;
--> statement-breakpoint
-- name: connect_gate
-- つなぐ前の上限（noahConnectGate へ渡す 3 つの数）。新しく行を作る時だけ数える。:minute_ago = 今 - 60,000、:day_ago = 今 - 86,400,000。
SELECT (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND disconnected_at IS NULL) AS live,
       (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND updated_at > :minute_ago AND created_at > :minute_ago) AS last_minute,
       (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND updated_at > :day_ago AND created_at > :day_ago) AS last_day;
--> statement-breakpoint
-- name: host_take
-- 利用者の操作から始める握手（接続・道具の一覧・依頼）の前に、接続先の枠を 1 つ取る。行が返れば、握手してよい。
-- 返らないのは、直近 60 秒の枠（:limit 回）を使い切った時と、相手が「混んでいる」と返して、待つ時刻（not_before）がまだ先の時。
-- 巡回の間隔（last_probe_at）には触らない。新しい host の行は last_probe_at = 0 で入るので、巡回の握手を妨げない。
INSERT INTO noah_probe_hosts(host, last_probe_at, not_before, user_window_at, user_count) VALUES(:host, 0, 0, :now, 1)
ON CONFLICT(host) DO UPDATE SET
  user_count = CASE WHEN noah_probe_hosts.user_window_at <= :now - 60000 THEN 1 ELSE noah_probe_hosts.user_count + 1 END,
  user_window_at = CASE WHEN noah_probe_hosts.user_window_at <= :now - 60000 THEN :now ELSE noah_probe_hosts.user_window_at END
 WHERE noah_probe_hosts.not_before <= :now
   AND (noah_probe_hosts.user_window_at <= :now - 60000 OR noah_probe_hosts.user_count < :limit)
RETURNING user_count;
--> statement-breakpoint
-- name: host_wait
-- 相手が「混んでいる」（429）と返した時。Retry-After の時刻（:until）まで、巡回も、利用者の操作から始める握手も待つ。短くはしない。
INSERT INTO noah_probe_hosts(host, last_probe_at, not_before) VALUES(:host, 0, :until)
ON CONFLICT(host) DO UPDATE SET not_before = MAX(noah_probe_hosts.not_before, excluded.not_before);
