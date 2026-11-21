// Promoted verbatim from docs/contracts/noah-listing-v1.sql.
export const REMOTE_GATE_SQL = {
  gate: String.raw`-- 頼む前の上限（noahAskGate へ渡す 4 つの数）。:minute_ago = 今 - 60,000、:day_ago = 今 - 86,400,000。
SELECT (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND finished_at IS NULL) AS open,
       (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND created_at > :minute_ago) AS last_minute,
       (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND created_at > :day_ago) AS last_day,
       (SELECT COUNT(*) FROM noah_asks WHERE host = :host AND created_at > :minute_ago) AS host_last_minute;
`,
  connect_gate: String.raw`-- つなぐ前の上限（noahConnectGate へ渡す 3 つの数）。新しく行を作る時だけ数える。:minute_ago = 今 - 60,000、:day_ago = 今 - 86,400,000。
SELECT (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND disconnected_at IS NULL) AS live,
       (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND updated_at > :minute_ago AND created_at > :minute_ago) AS last_minute,
       (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND updated_at > :day_ago AND created_at > :day_ago) AS last_day;
`,
  host_take: String.raw`-- 利用者の操作から始める握手（接続・道具の一覧・依頼）の前に、接続先の枠を 1 つ取る。行が返れば、握手してよい。
-- 返らないのは、直近 60 秒の枠（:limit 回）を使い切った時と、相手が「混んでいる」と返して、待つ時刻（not_before）がまだ先の時。
-- 巡回の間隔（last_probe_at）には触らない。新しい host の行は last_probe_at = 0 で入るので、巡回の握手を妨げない。
INSERT INTO noah_probe_hosts(host, last_probe_at, not_before, user_window_at, user_count) VALUES(:host, 0, 0, :now, 1)
ON CONFLICT(host) DO UPDATE SET
  user_count = CASE WHEN noah_probe_hosts.user_window_at <= :now - 60000 THEN 1 ELSE noah_probe_hosts.user_count + 1 END,
  user_window_at = CASE WHEN noah_probe_hosts.user_window_at <= :now - 60000 THEN :now ELSE noah_probe_hosts.user_window_at END
 WHERE noah_probe_hosts.not_before <= :now
   AND (noah_probe_hosts.user_window_at <= :now - 60000 OR noah_probe_hosts.user_count < :limit)
RETURNING user_count;
`,
  host_wait: String.raw`-- 相手が「混んでいる」（429）と返した時。Retry-After の時刻（:until）まで、巡回も、利用者の操作から始める握手も待つ。短くはしない。
INSERT INTO noah_probe_hosts(host, last_probe_at, not_before) VALUES(:host, 0, :until)
ON CONFLICT(host) DO UPDATE SET not_before = MAX(noah_probe_hosts.not_before, excluded.not_before);
`,
};
