// Noah 取り込みの試験の土台: 一時の SQLite を D1 の形で包む。外の接続先・鍵・本番のデータには触らない。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const H = 'a'.repeat(64);
export const split = (sql) => sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean);
/** 注釈（-- …）と空行を外す。文そのものは変えない。 */
export const stripSql = (statement) =>
  statement
    .split('\n')
    .map((line) => {
      const at = line.indexOf('--');
      return (at < 0 ? line : line.slice(0, at)).trimEnd();
    })
    .filter((line) => line.trim())
    .join('\n');
export const readRepo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
export const fixture = (name) => JSON.parse(readRepo(`tests/fixtures/noah/${name}`));

/** 取り込みの 5 表だけを持つ一時 DB と、D1 と同じ形の入口。hooks で、失敗や呼び出しの記録を差し込める。 */
export function intakeDatabase(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const statement of split(readRepo('drizzle/0044_noah_intake.sql'))) sql.exec(statement);
  const hooks = { queries: [], batches: 0 };
  const statement = (query, args = []) => ({
    query,
    args,
    bind: (...values) => statement(query, values),
    async first() {
      hooks.queries.push(query);
      return sql.prepare(query).get(...args) ?? null;
    },
    async all() {
      hooks.queries.push(query);
      return { results: sql.prepare(query).all(...args) };
    },
    async run() {
      hooks.queries.push(query);
      return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } };
    },
  });
  const db = {
    prepare: (query) => statement(query),
    async batch(items) {
      hooks.batches += 1;
      sql.exec('BEGIN');
      try {
        const out = [];
        for (const item of items) {
          if (hooks.failBatch?.(item.query)) throw Error('batch failure');
          hooks.queries.push(item.query);
          out.push({ meta: { changes: Number(sql.prepare(item.query).run(...item.args).changes) } });
        }
        sql.exec('COMMIT');
        return out;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sql, db, hooks };
}

/** 公式台帳の 1 件（合成）。接続先は、名前から決まる公開の host。 */
export const registryEntry = (name, change = {}) => ({
  server: { name, description: `${name} の説明`, version: '1.0.0', remotes: [{ type: 'streamable-http', url: `https://${name.replace(/[^a-z0-9]+/g, '-')}.example.com/mcp` }], ...change.server },
  _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', updatedAt: '2026-11-20T00:00:00.000Z', isLatest: true, ...change.meta } },
});

/**
 * 公式台帳の代わり。entries を size 件ずつの頁にして返す。呼ばれた URL を calls に残す。
 * updated_since が付いた要求には、updated に入れた記録だけを返す。hooks.respond で、頁ごとに応答を差し替えられる。
 */
export function registry({ entries = [], size = 2 } = {}) {
  const state = { entries, updated: [], size, calls: [], respond: null };
  const fetcher = async (url, init) => {
    state.calls.push({ url, init });
    const custom = await state.respond?.(url, init, state.calls.length);
    if (custom) return custom;
    const params = new URL(url).searchParams;
    const from = params.has('updated_since') ? state.updated : state.entries;
    const start = Number(params.get('cursor') ?? 0);
    const servers = from.slice(start, start + state.size);
    const nextCursor = start + state.size < from.length ? String(start + state.size) : undefined;
    return Response.json({ servers, metadata: { ...(nextCursor ? { nextCursor } : {}), count: servers.length } });
  };
  return { state, fetcher };
}

/** 握手が通った後の形の候補・握手の記録・系列を、直に入れる（握手そのものは L4 の試験で確かめる）。 */
export function seedFamily(sql, key, { level = 1, l2At = null, shuffle = 500, oneTap = 1, summary = '', source = 'mcp-registry', setup = 0, auth = 'none', formTools = 1, listed = 1, connect = null } = {}) {
  const id = `${source}:${key}`;
  const host = `${key.replace(/[^a-z0-9]+/g, '-')}.example.com`;
  const draft = connect ?? {
    schema: 'noah-connect/1', candidateId: id, candidateDigest: H, mouth: 'mcp-remote', surface: 'none', places: ['provider'], target: { url: `https://${host}/mcp`, headers: [] },
    codeDelivery: 'none', model: { use: 'provider', needs: [], minContextTokens: 0 }, egress: [host], services: [], secrets: [], uses: [],
  };
  sql.prepare('INSERT OR IGNORE INTO noah_intake_sources(id) VALUES(?)').run(source);
  sql
    .prepare(
      `INSERT INTO noah_intake_candidates(id, source, external_key, family_id, group_key, name, summary, host, record_sha256, record_json, state, source_updated_at, first_seen_at, changed_at, seen_at, revision)
       VALUES(?,?,?,?,?,?,?,?,?,?,'active',5,1,1,1,1)`,
    )
    .run(id, source, key, id, key.split('/')[0], key, summary, host, H, JSON.stringify({ name: key, websiteUrl: `https://${host}/about` }));
  sql
    .prepare(
      `INSERT INTO noah_intake_checks(candidate_id, mouth, surface, auth, connect_json, connect_sha256, setup, tools_sha256, tool_count, read_only, form_tools, one_tap_tools, level, result, checked_at, l1_at, l2_at, next_check_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    )
    .run(id, draft.mouth, draft.surface, auth, JSON.stringify(draft), H, setup, level ? H : null, level ? 3 : null, level ? 1 : null, level ? formTools : null, level ? oneTap : null, level, level ? 'ok' : 'unchecked', level ? 90 : null, level ? 10 : null, level === 2 ? (l2At ?? 20) : null);
  sql
    .prepare('INSERT INTO noah_intake_families(id, representative_id, members, level, l2_at, badge_hint, listed, one_tap, shuffle, updated_at, revision) VALUES(?,?,1,?,?,?,?,?,?,1,1)')
    .run(id, id, level, level === 2 ? (l2At ?? 20) : null, level === 2 ? 'one_click' : 'unverified', level ? listed : 0, level ? oneTap : 0, shuffle);
  return id;
}
