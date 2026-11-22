// 定期便の台帳（task 123）の試験の台。本番と同じ migration（0055）を、メモリの SQLite に流し、D1 の形（prepare・bind・first・all・run・batch）で包む。
// batch は 1 回 50 文・1 文 100 個の値まで（D1 の上限と同じ）。hooks.failBatch が真を返す batch は、途中で失敗させる（締めの途中で止まった時の試験）。
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createNoahTeikibinApi } from '../../../lib/noah-teikibin-api.ts';
import { createNoahTeikibinStore } from '../../../lib/noah-teikibin-store.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '../../../lib/owner-intent.ts';

/** 2026-12-05 12:00（日本時間）。今の月は 2026-12。締められるのは 2026-11 まで。 */
export const NOW = Date.UTC(2026, 11, 5, 3);
export const KEY = 'test-teikibin-key-0123456789abcdef-0123';
export const REVIEWER = 'operator-1';

export function teikibinFixture(t, options = {}) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL('../../../drizzle/0055_noah_teikibin.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const hooks = {};
  const batches = [];
  const db = {
    prepare(query) {
      const statement = {
        query,
        args: [],
        bind(...args) {
          if (args.length > 100) throw Error('D1 binding limit');
          return { ...statement, args };
        },
        async first() { return sql.prepare(query).get(...this.args) ?? null; },
        async all() { return { results: sql.prepare(query).all(...this.args) }; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...this.args).changes) } }; },
      };
      return statement;
    },
    async batch(statements) {
      if (statements.length > 50) throw Error('D1 batch limit');
      batches.push(statements.length);
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (hooks.failBatch?.(batches.length, index)) throw Error('Synthetic batch failure');
          results.push(await statement.run());
        }
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  let clock = options.now ?? NOW, ids = 0, seed = 7;
  const deps = {
    db,
    now: () => clock,
    uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    // 決まった並びの乱数（受け取り番号が、試験ごとに同じになる）。
    random: (size) => Uint8Array.from({ length: size }, () => ((seed = (seed * 1103515245 + 12345) % 2147483648) >>> 16) & 255),
  };
  const flags = { open: options.open ?? true, key: options.key === undefined ? KEY : options.key, warnings: [] };
  const api = createNoahTeikibinApi({
    ...deps,
    authenticate: async (request) => {
      const user = request.headers.get('x-test-user');
      if (!user) throw Error('UNAUTHORIZED');
      return user;
    },
    reviewers: [REVIEWER],
    flags,
  });
  /** 入口を呼ぶ。who が null なら未サインイン。headers で、Origin・本人の印・形を上書きできる。 */
  async function call(who, method, query = '', body, headers = {}) {
    const base = { origin: 'https://noah.test', 'content-type': 'application/json' };
    if (who) {
      base['x-test-user'] = who;
      base[OWNER_SCOPE_HEADER] = await ownerScopeFor(who);
    }
    const init = { method, headers: { ...base, ...headers } };
    if (method !== 'GET' && body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const response = await api(new Request(`https://noah.test/api/noah/teikibin${query}`, init));
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('json')) return { status: response.status, type, body: await response.json() };
    // 文字に直す時に BOM は消えるので、先頭の 3 byte を別に見せる。
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, type, bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, body: new TextDecoder().decode(bytes) };
  }
  const post = (who, body, headers) => call(who, 'POST', '', body, headers);
  const operator = (body) => post(REVIEWER, body);
  /** 申し込んで、確かめる。返すのは受け取り番号。 */
  async function member(owner, identity = `0001-${owner}-1234567`) {
    const joined = await post(owner, { action: 'join' });
    const code = joined.body.person.code;
    const verified = await operator({ action: 'verify', code, method: 'bank_account', identity });
    if (verified.status !== 200) throw Error(`verify failed: ${JSON.stringify(verified.body)}`);
    return code;
  }
  /** 締めの下書きを見て、そのまま締める。 */
  async function close(month, params = {}) {
    const p = { form: 'cash', reserve: 0, dividend: 5000, price: null, ...params };
    const query = `?${new URLSearchParams({ preview: month, form: p.form, reserve: String(p.reserve), dividend: String(p.dividend), ...(p.price === null ? {} : { price: String(p.price) }) })}`;
    const preview = await call(REVIEWER, 'GET', query);
    if (preview.status !== 200) return preview;
    return operator({ action: 'close', month, form: p.form, reserveBps: p.reserve, dividendBps: p.dividend, planPrice: p.price, digest: preview.body.digest });
  }
  const store = createNoahTeikibinStore(deps);
  return { sql, db, deps, hooks, batches, flags, call, post, operator, member, close, store, advance: (ms) => { clock += ms; } };
}
