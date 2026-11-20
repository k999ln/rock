/**
 * Noah: ローンチの一覧（タイムライン・検索）と、つなぐ前・頼む前の上限、接続先の枠の問い合わせ。名前つきの引数を D1 の形に直す小さな関数。
 *
 * 文は docs/contracts/noah-listing-v1.sql と同じ（注釈だけを外した。書き直さない）。同じ文である事は tests/noah-intake-sql.test.mjs が確かめる。
 * 載せる条件の正本は lib/noah-intake-family.ts の noahListing。系列の行の listed・one_tap は、名寄せ（NOAH_REGROUP_SQL）と、下の touch が書く。
 * gate・connect_gate は、noah_asks・noah_connections の表（L5・L6 の migration）ができてから使う。
 */

type Database = Pick<D1Database, 'prepare'>;

export const NOAH_LISTING_SQL = {
  /** 「動いた」: 人が動かして成果が返った系列（L2）。新しい順。最初の頁は :before_at = 9007199254740991、:after_id = ''。 */
  ran: `SELECT id, l2_at FROM noah_intake_families
 WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL AND listed = 1
   AND (l2_at < :before_at OR (l2_at = :before_at AND id > :after_id))
 ORDER BY l2_at DESC, id LIMIT :limit;`,
  /** 「まだ誰も動かしていない」: 握手まで（L1）の系列。その日の並び（shuffle）。:one_tap = 1 で、押すだけで頼める物だけ。最初の頁は :before = 1000000000、:after_id = ''。 */
  new: `SELECT id, shuffle FROM noah_intake_families
 WHERE listed = 1 AND level = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL
   AND (:one_tap = 0 OR one_tap = 1)
   AND (shuffle < :before OR (shuffle = :before AND id > :after_id))
 ORDER BY shuffle DESC, id LIMIT :limit;`,
  /** 並びの引き直し。UTC の日付が変わって最初の巡回で 1 回。名前の順や、台帳での更新の多さが並びに出ないようにする。 */
  reshuffle: `UPDATE noah_intake_families SET shuffle = abs(random()) % 1000000000 WHERE listed = 1 AND level = 1;`,
  /** 握手・実行で noah_intake_checks を書いた直後に、その候補が代表の系列へ写す（次の名寄せを待たない）。:listed・:one_tap・:badge_hint は noahListing の結果から。 */
  touch: `UPDATE noah_intake_families
   SET level = :level, l2_at = CASE WHEN :level = 2 THEN COALESCE(:l2_at, l2_at) ELSE NULL END, badge_hint = :badge_hint,
       listed = :listed, one_tap = :one_tap, updated_at = :now, revision = revision + 1
 WHERE representative_id = :candidate_id;`,
  /** 語で探す（名前と説明の部分一致）。載せている系列だけ。:like は、% と _ と \\ を \\ で逃がした語の前後に % を付けた物。 */
  search: `SELECT f.id FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id = f.representative_id
 WHERE f.listed = 1 AND f.level >= 1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL
   AND (c.name LIKE :like ESCAPE '\\' OR c.summary LIKE :like ESCAPE '\\')
 ORDER BY f.level DESC, f.shuffle DESC, f.id LIMIT :limit OFFSET :offset;`,
  /** 運営の画面: 載せている数と、載せていない理由を数えるための集計。理由そのものは、行ごとに noahListing が決める。 */
  counts: `SELECT c.source, c.state, (c.family_id LIKE 'bulk:%') AS bulk, k.mouth, k.setup, k.auth, k.result, k.level,
       (COALESCE(k.form_tools, 0) >= 1) AS has_form, (COALESCE(k.one_tap_tools, 0) >= 1) AS has_one_tap, COUNT(*) AS n
  FROM noah_intake_candidates c LEFT JOIN noah_intake_checks k ON k.candidate_id = c.id
 GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10;`,
  /** 頼む前の上限（noahAskGate へ渡す 4 つの数）。:minute_ago = 今 - 60,000、:day_ago = 今 - 86,400,000。 */
  gate: `SELECT (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND finished_at IS NULL) AS open,
       (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND created_at > :minute_ago) AS last_minute,
       (SELECT COUNT(*) FROM noah_asks WHERE owner_id = :owner AND created_at > :day_ago) AS last_day,
       (SELECT COUNT(*) FROM noah_asks WHERE host = :host AND created_at > :minute_ago) AS host_last_minute;`,
  /** つなぐ前の上限（noahConnectGate へ渡す 3 つの数）。新しく行を作る時だけ数える。 */
  connect_gate: `SELECT (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND disconnected_at IS NULL) AS live,
       (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND updated_at > :minute_ago AND created_at > :minute_ago) AS last_minute,
       (SELECT COUNT(*) FROM noah_connections WHERE owner_id = :owner AND updated_at > :day_ago AND created_at > :day_ago) AS last_day;`,
  /** 利用者の操作から始める握手（接続・道具の一覧・依頼）の前に、接続先の枠を 1 つ取る。行が返れば、握手してよい。巡回の間隔（last_probe_at）には触らない。 */
  host_take: `INSERT INTO noah_probe_hosts(host, last_probe_at, not_before, user_window_at, user_count) VALUES(:host, 0, 0, :now, 1)
ON CONFLICT(host) DO UPDATE SET
  user_count = CASE WHEN noah_probe_hosts.user_window_at <= :now - 60000 THEN 1 ELSE noah_probe_hosts.user_count + 1 END,
  user_window_at = CASE WHEN noah_probe_hosts.user_window_at <= :now - 60000 THEN :now ELSE noah_probe_hosts.user_window_at END
 WHERE noah_probe_hosts.not_before <= :now
   AND (noah_probe_hosts.user_window_at <= :now - 60000 OR noah_probe_hosts.user_count < :limit)
RETURNING user_count;`,
  /** 相手が「混んでいる」（429）と返した時。Retry-After の時刻（:until）まで、巡回も、利用者の操作から始める握手も待つ。短くはしない。 */
  host_wait: `INSERT INTO noah_probe_hosts(host, last_probe_at, not_before) VALUES(:host, 0, :until)
ON CONFLICT(host) DO UPDATE SET not_before = MAX(noah_probe_hosts.not_before, excluded.not_before);`,
} as const;
export type NoahListingSqlName = keyof typeof NOAH_LISTING_SQL;

const converted = new Map<string, { sql: string; names: string[] }>();

/**
 * `:name` で書いた文を、D1 が受ける番号つきの引数（?1・?2…）に直す。D1 は、名前つきの引数を受けない。
 * 文字列（'…'）と注釈（-- …）の中は読まない。同じ名前は、何回出ても同じ番号になる。
 */
export function noahNamedSql(sql: string): { sql: string; names: string[] } {
  const cached = converted.get(sql);
  if (cached) return cached;
  const names: string[] = [];
  let out = '';
  for (let i = 0; i < sql.length; ) {
    const ch = sql[i];
    if (ch === "'") {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === "'" && sql[end + 1] === "'") end += 2;
        else if (sql[end] === "'") break;
        else end += 1;
      }
      out += sql.slice(i, end + 1);
      i = end + 1;
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      out += sql.slice(i, end < 0 ? sql.length : end);
      i = end < 0 ? sql.length : end;
    } else if (ch === ':' && /[a-z_]/.test(sql[i + 1] ?? '')) {
      let end = i + 1;
      while (end < sql.length && /[a-z0-9_]/.test(sql[end])) end += 1;
      const name = sql.slice(i + 1, end);
      let at = names.indexOf(name);
      if (at < 0) at = names.push(name) - 1;
      out += `?${at + 1}`;
      i = end;
    } else {
      out += ch;
      i += 1;
    }
  }
  const result = { sql: out, names };
  converted.set(sql, result);
  return result;
}

/** 名前つきの引数で書いた文を、値を結んだ D1 の文にする。足りない名前は、その場で止める（NULL を黙って入れない）。 */
export function noahStatement(db: Database, sql: string, params: Record<string, string | number | null> = {}) {
  const { sql: text, names } = noahNamedSql(sql);
  for (const name of names) if (!Object.hasOwn(params, name)) throw new Error(`noah sql: 引数 ${name} がありません`);
  return names.length ? db.prepare(text).bind(...names.map((name) => params[name])) : db.prepare(text);
}
